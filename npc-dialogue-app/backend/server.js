require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { formatPrompt } = require('./utils/promptFormatter');
const { checkRateLimit } = require('./utils/rateLimiter');
const { logRequest, logError, logInfo } = require('./utils/logger');

const app = express();

// Enable CORS and JSON parsing
app.use(cors({
    origin: true, // Allow all origins in development
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Add request logging middleware BEFORE static file serving
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] - ${req.method} ${req.url}`);
    if (req.url.startsWith('/images/')) {
        const imagePath = path.join(__dirname, 'images', path.basename(req.url));
        console.log(`[IMAGE REQUEST] Attempting to serve image from: ${imagePath}`);
        if (fs.existsSync(imagePath)) {
            console.log(`[IMAGE REQUEST] File exists at: ${imagePath}`);
            const stats = fs.statSync(imagePath);
            console.log(`[IMAGE REQUEST] File size: ${stats.size} bytes`);
            console.log(`[IMAGE REQUEST] File permissions: ${stats.mode}`);
        } else {
            console.log(`[IMAGE REQUEST] File NOT found at: ${imagePath}`);
            // List contents of images directory
            console.log('[IMAGE REQUEST] Contents of images directory:');
            fs.readdirSync(path.join(__dirname, 'images')).forEach(file => {
                console.log(`  - ${file}`);
            });
        }
    }
    next();
});

// Serve static files from the images directory
app.use('/images', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  console.log(`[STATIC] Serving image: ${req.url}`);
  next();
}, express.static(path.join(__dirname, 'images')));

// Set up logging
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'model_prompts.log');
const NPCS_DIR = path.join(__dirname, 'npcs');
const CONFIG_DIR = path.join(__dirname, 'config');

// Ensure directories exist
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}
if (!fs.existsSync(NPCS_DIR)) {
    fs.mkdirSync(NPCS_DIR, { recursive: true });
}
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Load prompt format configuration
const promptConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'prompt_format.json'), 'utf8'));
const npcConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'npc-config.json'), 'utf8'));

// Load NPCs
const npcs = {};
fs.readdirSync(NPCS_DIR).forEach(file => {
    if (file.endsWith('.json')) {
        const npcData = JSON.parse(fs.readFileSync(path.join(NPCS_DIR, file), 'utf8'));
        // Merge with default config and ensure all required fields are present
        npcs[npcData.id] = {
            ...npcData,
            responseTriggers: npcConfig.responseTriggers,
            // Ensure arrays are initialized if not present
            whatTheyKnow: npcData.whatTheyKnow || [],
            pitfalls: npcData.pitfalls || [],
            motivations: npcData.motivations || [],
            // Ensure string fields have defaults
            name: npcData.name || 'Unknown',
            description: npcData.description || '',
            personality: npcData.personality || '',
            currentScene: npcData.currentScene || ''
        };
        logInfo(`Loaded NPC ${npcData.id} with response triggers: ${JSON.stringify(npcConfig.responseTriggers)}`);
    }
});

console.log('Loaded NPCs:', Object.keys(npcs));

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Function to load NPC data
function loadNpcData(npcId) {
    const npc = npcs[npcId];
    if (!npc) {
        return null;
    }
    return npc;
}

// Logging utility
function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logMessage);
    console.log(logMessage.trim());
}

// Function to get voice settings with defaults from config
function getVoiceSettings(npcVoice) {
    const defaultSettings = npcConfig.providers.voice.elevenlabs.defaultSettings;
    return {
        ...defaultSettings,
        ...npcVoice.settings
    };
}

// Function to format image prompt (without dialogue instructions)
function formatImagePrompt(template, npcData) {
    return template
        .replace('{name}', npcData.name)
        .replace('{description}', npcData.description);
}

// Add this near the top with other constants
const IMAGE_CACHE = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitMap = new Map();
const SSE_CLIENTS = new Map(); // Map to track SSE clients by npcId

// Add middleware to fix SSE for proxies if needed
app.use((req, res, next) => {
  res.flush = () => {};
  next();
});

// Route to get available NPCs
app.get('/npcs', (req, res) => {
    const npcList = Object.values(npcs).map(npc => ({
        id: npc.id,
        name: npc.name,
        description: npc.description
    }));
    res.json(npcList);
});

// Session management
const SESSIONS_DIR = path.join(__dirname, 'data', 'sessions');
const sessionCache = new Map();

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function getOrCreateSession(npcId) {
  // Check cache first
  if (sessionCache.has(npcId)) {
    const session = sessionCache.get(npcId);
    // Ensure interest exists
    if (session.interest === undefined) {
      session.interest = 3;
    }
    return session;
  }
  
  // Load from disk if not in cache
  const sessionPath = path.join(SESSIONS_DIR, `${npcId}.json`);
  if (fs.existsSync(sessionPath)) {
    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    // Ensure interest exists
    if (session.interest === undefined) {
      session.interest = 3;
    }
    sessionCache.set(npcId, session);
    return session;
  }
  
  // Create new session
  const newSession = {
    npcId,
    sessionId: `${new Date().toISOString().split('T')[0]}-${npcId}-1`,
    startedAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    attitude: 'neutral', // Default attitude
    patience: 3, // Default patience for neutral attitude
    interest: 2, // Default interest for neutral attitude
    messages: []
  };
  
  sessionCache.set(npcId, newSession);
  return newSession;
}

function updateSession(npcId, updates) {
  const session = getOrCreateSession(npcId);
  const updatedSession = {
    ...session,
    ...updates,
    lastActive: new Date().toISOString()
  };
  
  sessionCache.set(npcId, updatedSession);
  return updatedSession;
}

// Save all sessions to disk
function saveAllSessions() {
  logInfo('Saving all sessions to disk...');
  for (const [npcId, session] of sessionCache.entries()) {
    const sessionPath = path.join(SESSIONS_DIR, `${npcId}.json`);
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  }
  logInfo('All sessions saved successfully');
}

// Save sessions periodically (every 5 minutes)
setInterval(saveAllSessions, 5 * 60 * 1000);

// Save sessions on server shutdown
process.on('SIGTERM', () => {
  logInfo('Server shutting down, saving sessions...');
  saveAllSessions();
  process.exit(0);
});

// Modified context endpoint - handle both paths
app.get(['/api/context/:npcId', '/context/:npcId'], async (req, res) => {
  try {
    const { npcId } = req.params;
    const npc = npcs[npcId];
    if (!npc) {
      return res.status(404).json({ error: 'NPC not found' });
    }
    
    const session = getOrCreateSession(npcId);
    
    // Initialize interest if it doesn't exist
    if (session.interest === undefined) {
      session.interest = 3; // Default starting value
      // Save the update
      updateSession(npcId, { interest: session.interest });
    }
    
    logInfo(`Retrieved context for ${npcId}, session ${session.sessionId}`);
    
    const localImagePath = `/images/${npc.id}.png`;
    console.log(`[CONTEXT] Setting localImagePath for ${npc.id} to: ${localImagePath}`);
    
    // Check if local image exists
    const imagePath = path.join(__dirname, 'images', `${npc.id}.png`);
    const hasLocalImage = fs.existsSync(imagePath);
    console.log(`[CONTEXT] Local image ${hasLocalImage ? 'exists' : 'does not exist'} at: ${imagePath}`);
    
    res.json({
      ...npc,
      session: {
        id: session.sessionId,
        patience: session.patience,
        interest: session.interest, // Include interest in the response
        lastUpdated: session.lastActive
      },
      localImagePath: hasLocalImage ? localImagePath : null,
      conversationHistory: session.messages // Include server-side conversation history
    });
  } catch (error) {
    logError('Error in context endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add POST endpoint for updating NPC context
app.post(['/api/context/:npcId', '/context/:npcId'], async (req, res) => {
  try {
    const { npcId } = req.params;
    const updatedNpc = req.body;
    
    // Validate required fields
    if (!updatedNpc.id || !updatedNpc.name || !updatedNpc.description || 
        !updatedNpc.personality || !updatedNpc.currentScene || !updatedNpc.gameContext) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Update the NPC data
    npcs[npcId] = updatedNpc;
    
    // Save to file
    const filePath = path.join(NPCS_DIR, `${npcId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(updatedNpc, null, 2));
    
    logInfo(`Updated context for ${npcId}`);
    
    // Return the updated NPC data
    res.json(updatedNpc);
  } catch (error) {
    logError('Error updating NPC context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to broadcast attribute updates to all connected clients
function broadcastAttributeUpdate(npcId, type, value) {
  const clients = SSE_CLIENTS.get(npcId);
  if (!clients) {
    logInfo(`No clients found for ${npcId} when trying to broadcast ${type} update`);
    return;
  }

  logInfo(`Broadcasting ${type} update (${value}) to ${clients.size} clients for ${npcId}`);
  const eventData = JSON.stringify({
    type,
    value
  });

  let successCount = 0;
  for (const client of clients) {
    try {
      client.write('event: attributeUpdate\n');
      client.write(`data: ${eventData}\n\n`);
      successCount++;
      logInfo(`Successfully sent ${type} update to client (${successCount}/${clients.size})`);
    } catch (error) {
      logError(`Error broadcasting ${type} update to client:`, error);
      clients.delete(client);
    }
  }
  logInfo(`Completed broadcasting ${type} update. ${successCount} successful out of ${clients.size} clients`);
}

// Endpoint for GM to adjust patience
app.post('/api/npc/:npcId/patience', (req, res) => {
  try {
    const { npcId } = req.params;
    const { adjustment } = req.body;
    
    const session = getOrCreateSession(npcId);
    
    // Calculate new patience value, keeping it between 0-5
    const newPatience = Math.max(0, Math.min(5, session.patience + adjustment));
    
    const updatedSession = updateSession(npcId, {
      patience: newPatience
    });
    
    // Broadcast the update to all connected clients
    broadcastAttributeUpdate(npcId, 'patience', newPatience);
    
    logInfo(`Adjusted patience for ${npcId} by ${adjustment}, new value: ${updatedSession.patience}`);
    res.json({ 
      success: true, 
      patience: updatedSession.patience 
    });
  } catch (error) {
    logError('Error adjusting patience:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint for GM to adjust interest
app.post('/api/npc/:npcId/interest', (req, res) => {
  try {
    const { npcId } = req.params;
    const { adjustment } = req.body;
    
    const session = getOrCreateSession(npcId);
    
    // Initialize interest if it doesn't exist
    if (session.interest === undefined) {
      session.interest = 3; // Default starting value
    }
    
    // Calculate new interest value, keeping it between 0-5
    const newInterest = Math.max(0, Math.min(5, session.interest + adjustment));
    
    const updatedSession = updateSession(npcId, {
      interest: newInterest
    });
    
    // Broadcast the update to all connected clients
    broadcastAttributeUpdate(npcId, 'interest', newInterest);
    
    logInfo(`Adjusted interest for ${npcId} by ${adjustment}, new value: ${updatedSession.interest}`);
    res.json({ 
      success: true, 
      interest: updatedSession.interest 
    });
  } catch (error) {
    logError('Error adjusting interest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New SSE endpoint for conversation updates
app.get('/sse/conversation/:npcId', (req, res) => {
  const { npcId } = req.params;
  const clientId = req.query.client || 'unknown';
  
  logInfo(`SSE connection established for ${npcId} from client ${clientId}`);
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable buffering for nginx
  });
  
  // Send initial heartbeat
  res.write('event: connected\n');
  res.write(`data: ${JSON.stringify({ status: 'connected', clientId })}\n\n`);
  
  // Send current conversation state
  const session = getOrCreateSession(npcId);
  sendConversationUpdate(res, session);
  
  // Add this client to the SSE clients map
  if (!SSE_CLIENTS.has(npcId)) {
    SSE_CLIENTS.set(npcId, new Set());
    logInfo(`Created new SSE client set for ${npcId}`);
  }
  
  const clients = SSE_CLIENTS.get(npcId);
  const clientKey = `${clientId}_${Date.now()}`;
  clients.add(res);
  logInfo(`Added client ${clientId} to SSE clients for ${npcId}. Total clients: ${clients.size}`);
  
  // Handle client disconnect
  req.on('close', () => {
    logInfo(`SSE connection closed for ${npcId} from client ${clientId}`);
    if (SSE_CLIENTS.has(npcId)) {
      const clients = SSE_CLIENTS.get(npcId);
      clients.delete(res);
      logInfo(`Removed client ${clientId} from SSE clients for ${npcId}. Remaining clients: ${clients.size}`);
      if (clients.size === 0) {
        SSE_CLIENTS.delete(npcId);
        logInfo(`Removed empty SSE client set for ${npcId}`);
      }
    }
  });
  
  // Setup periodic heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write('event: heartbeat\n');
      res.write(`data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
    } catch (error) {
      logError('Error sending heartbeat:', error);
      clearInterval(heartbeatInterval);
    }
  }, 30000); // Every 30 seconds
  
  // Clear interval on disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
  });
});

// Function to send conversation update to all connected clients
function sendConversationUpdate(res, session) {
  try {
    const data = {
      conversationHistory: session.messages || [],
      lastUpdated: session.lastActive,
      messageCount: session.messages ? session.messages.length : 0,
      session: {
        patience: session.patience,
        interest: session.interest, // Include interest in SSE updates
        id: session.sessionId
      }
    };
    
    const eventData = JSON.stringify(data);
    logInfo(`Sending update event with ${data.messageCount} messages, patience: ${session.patience}, interest: ${session.interest || 'N/A'}`);
    
    res.write('event: update\n');
    res.write(`data: ${eventData}\n\n`);
  } catch (error) {
    logError('Error sending conversation update:', error);
  }
}

// Function to broadcast conversation update to all clients for an NPC
function broadcastConversationUpdate(npcId) {
  if (!SSE_CLIENTS.has(npcId)) return;
  
  const session = getOrCreateSession(npcId);
  const clients = SSE_CLIENTS.get(npcId);
  
  logInfo(`Broadcasting update to ${clients.size} clients for ${npcId}`);
  
  for (const res of clients) {
    sendConversationUpdate(res, session);
  }
}

// Function to process response triggers
function processResponseTriggers(npcId, response) {
  const session = getOrCreateSession(npcId);
  const npc = npcs[npcId];
  
  logInfo(`Processing response triggers for ${npcId}`);
  logInfo(`Initial response: ${response}`);
  
  if (!npc || !npc.responseTriggers) {
    logInfo('No response triggers found for NPC');
    return response;
  }
  
  // Check for motivation appeal
  if (response.startsWith('<applied to motivation:')) {
    logInfo('Detected motivation appeal in response');
    const trigger = npc.responseTriggers.motivationAppeal;
    if (trigger) {
      // Extract motivation name
      const motivationMatch = response.match(/<applied to motivation: (.*?)>/);
      if (motivationMatch) {
        const motivation = motivationMatch[1].trim();
        logInfo(`Extracted motivation: ${motivation}`);
        
        // Check if this motivation has already been appealed to
        if (!session.trackedMotivations) {
          session.trackedMotivations = [];
        }
        
        if (!session.trackedMotivations.includes(motivation)) {
          logInfo(`New motivation appeal detected: ${motivation}`);
          // Process trigger actions
          trigger.actions.forEach(action => {
            logInfo(`Processing action: ${JSON.stringify(action)}`);
            switch (action.type) {
              case 'sound':
                logInfo('Attempting to play sound effect');
                // Emit sound event to connected clients
                if (SSE_CLIENTS.has(npcId)) {
                  const clients = SSE_CLIENTS.get(npcId);
                  logInfo(`Found ${clients.size} connected clients for sound event`);
                  for (const res of clients) {
                    try {
                      res.write('event: sound\n');
                      res.write(`data: ${JSON.stringify({ effect: action.effect })}\n\n`);
                      logInfo('Sound event sent successfully');
                    } catch (error) {
                      logError('Error sending sound event:', error);
                    }
                  }
                } else {
                  logInfo('No connected clients found for sound event');
                }
                break;
              case 'stat':
                if (action.target === 'interest') {
                  const currentInterest = session.interest || 0;
                  const newInterest = Math.min(5, currentInterest + action.value);
                  logInfo(`Updating interest from ${currentInterest} to ${newInterest} for ${npcId}`);
                  updateSession(npcId, { interest: newInterest });
                  logInfo(`Broadcasting interest update to clients`);
                  broadcastAttributeUpdate(npcId, 'interest', newInterest);
                  logInfo(`Completed interest update broadcast`);
                }
                break;
              case 'track':
                if (action.target === 'motivations') {
                  logInfo(`Adding ${motivation} to tracked motivations`);
                  session.trackedMotivations.push(motivation);
                  updateSession(npcId, { trackedMotivations: session.trackedMotivations });
                }
                break;
            }
          });
        } else {
          logInfo(`Motivation ${motivation} has already been appealed to`);
        }
      } else {
        logInfo('Failed to extract motivation name from response');
      }
    } else {
      logInfo('No motivation appeal trigger found in NPC config');
    }
    
    // Remove the motivation appeal text from the response
    const cleanedResponse = response.replace(/<applied to motivation:.*?>\n?/, '');
    logInfo(`Cleaned response: ${cleanedResponse}`);
    return cleanedResponse;
  }
  
  logInfo('No motivation appeal detected in response');
  return response;
}

// Modified chat endpoint to save messages and broadcast updates
app.post('/chat/:npcId', async (req, res) => {
  try {
    const { npcId } = req.params;
    const { input, conversationHistory, clientId = 'unknown' } = req.body;
    
    logInfo(`Chat request from client ${clientId} for ${npcId}`);
    
    // Rate limiting check
    const rateLimitResult = checkRateLimit(npcId);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter
      });
    }
    
    const session = getOrCreateSession(npcId);
    const userMessage = { role: "user", content: input };
    
    const npc = npcs[npcId];
    if (!npc) {
      return res.status(404).json({ error: 'NPC not found' });
    }

    const systemPrompt = formatPrompt(npc);
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      userMessage
    ];

    logToFile(`GPT Prompt:\n${JSON.stringify(messages, null, 2)}`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: messages,
      max_tokens: 150,
      temperature: 0.7
    });

    let npcResponse = completion.choices[0].message.content;
    logToFile(`GPT Response:\n${npcResponse}`);

    // Process response triggers and get cleaned response
    const cleanedResponse = processResponseTriggers(npcId, npcResponse);

    // Update conversation history with cleaned response
    const updatedHistory = [...conversationHistory, userMessage, { role: "assistant", content: cleanedResponse }];
    
    // Save the updated conversation history in session
    updateSession(npcId, {
      messages: updatedHistory,
      lastClientId: clientId
    });

    logInfo(`Chat completed for ${npcId}, new message count: ${updatedHistory.length}`);

    // Broadcast the update to all connected clients
    broadcastConversationUpdate(npcId);
    
    res.json({ 
      response: cleanedResponse,
      conversationHistory: updatedHistory
    });
  } catch (error) {
    logError('Error in chat endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// We don't need the old polling endpoint anymore, but I'll keep it for backward compatibility
// with reduced functionality
app.get('/conversation/:npcId', (req, res) => {
  try {
    const { npcId } = req.params;
    const clientId = req.query.client || 'unknown';
    const session = getOrCreateSession(npcId);
    
    // Set cache control headers to encourage using SSE instead
    res.set({
      'Cache-Control': 'private, max-age=60',
      'X-Use-SSE': 'Please switch to /sse/conversation endpoint for real-time updates'
    });
    
    logInfo(`Legacy conversation request from client ${clientId} for ${npcId} - consider using SSE`);
    
    res.json({
      conversationHistory: session.messages,
      lastUpdated: session.lastActive,
      messageCount: session.messages.length,
      useSse: true
    });
  } catch (error) {
    logError('Error getting conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation history' });
  }
});

// Modify the clear history endpoint to also clear tracked motivations
app.post('/clear-history/:npcId', (req, res) => {
  try {
    const { npcId } = req.params;
    const clientId = req.query.client || 'unknown';
    
    logInfo(`Clear history request for ${npcId} from client ${clientId}`);
    
    // Update session with empty messages array and clear tracked motivations
    updateSession(npcId, {
      messages: [],
      trackedMotivations: []
    });
    
    // Broadcast the update to all connected clients
    broadcastConversationUpdate(npcId);
    
    res.json({ success: true });
  } catch (error) {
    logError('Error clearing history:', error);
    res.status(500).json({ error: 'Failed to clear conversation history' });
  }
});

// Route to handle text-to-speech
app.post('/speak/:npcId', async (req, res) => {
    const npc = npcs[req.params.npcId];
    if (!npc) {
        return res.status(404).json({ error: 'NPC not found' });
    }

    const { text } = req.body;
    
    try {
        // Remove text within square brackets and trim any extra whitespace
        const cleanText = text.replace(/\[.*?\]/g, '').trim();
        logToFile(`Generating speech for text (after removing actions): ${cleanText}`);
        
        // Use merged voice settings from config and NPC
        const voiceSettings = getVoiceSettings(npc.voice);
        
        // Generate audio using ElevenLabs API
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${npc.voice.voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': process.env.ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
                text: cleanText,
                model_id: "eleven_flash_v2_5",
                voice_settings: voiceSettings
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            logToFile(`ElevenLabs API error: ${JSON.stringify(errorData)}`);
            throw new Error(`ElevenLabs API error: ${JSON.stringify(errorData)}`);
        }

        const audioBuffer = await response.buffer();
        logToFile(`Successfully generated speech, buffer size: ${audioBuffer.length} bytes`);

        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length
        });

        res.send(audioBuffer);
    } catch (error) {
        console.error('Error generating speech:', error);
        logToFile(`Error generating speech: ${error.message}`);
        res.status(500).json({ error: 'Failed to generate speech', details: error.message });
    }
});

// Add a cache for generated images
const imageCache = {};

// Modify the generate-image endpoint to add logging
app.post('/generate-image/:npcId', async (req, res) => {
  const { npcId } = req.params;
  
  try {
    const npc = npcs[npcId];
    if (!npc) {
      return res.status(404).json({ error: 'NPC not found' });
    }

    // Use formatImagePrompt to properly replace placeholders without dialogue instructions
    const defaultPrompt = `Create a portrait of {name}: {description} Style: fantasy art, detailed, professional illustration`;
    const prompt = npc.imagePrompt ? formatImagePrompt(npc.imagePrompt, npc) : formatImagePrompt(defaultPrompt, npc);
    console.log(`[${new Date().toISOString()}] DALL-E Prompt:`, prompt);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
    });

    const imageUrl = response.data[0].url;
    console.log(`[${new Date().toISOString()}] DALL-E Response URL:`, imageUrl);
    
    // Download and save the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error('Failed to download image');
    
    const imageBuffer = await imageResponse.buffer();
    const imagePath = path.join(__dirname, 'images', `${npcId}.png`);
    
    // Ensure the images directory exists
    const imagesDir = path.join(__dirname, 'images');
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    // Save the image, overwriting if it already exists
    fs.writeFileSync(imagePath, imageBuffer);
    console.log(`[${new Date().toISOString()}] Saved image to:`, imagePath);
    
    res.json({ 
        imageUrl,
        localImagePath: `/images/${npcId}.png`
    });
  } catch (error) {
    console.error('Error generating image:', error);
    
    // Handle rate limit errors
    if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after'] || 60; // Default to 60 seconds
      return res.status(429).json({ 
        error: 'Rate limit exceeded', 
        retryAfter: parseInt(retryAfter) 
      });
    }
    
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// SSE endpoint for real-time updates
app.get('/api/events/:npcId', (req, res) => {
  const { npcId } = req.params;
  const session = getOrCreateSession(npcId);

  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send initial state
  const initialData = JSON.stringify({
    type: 'initialState',
    patience: session.patience,
    interest: session.interest || 3
  });
  res.write(`data: ${initialData}\n\n`);

  // Add client to the SSE_CLIENTS map
  if (!SSE_CLIENTS.has(npcId)) {
    SSE_CLIENTS.set(npcId, new Set());
  }
  SSE_CLIENTS.get(npcId).add(res);

  // Remove client on connection close
  req.on('close', () => {
    if (SSE_CLIENTS.has(npcId)) {
      const clients = SSE_CLIENTS.get(npcId);
      clients.delete(res);
      if (clients.size === 0) {
        SSE_CLIENTS.delete(npcId);
      }
    }
  });

  // Setup heartbeat
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
    } catch (error) {
      clearInterval(heartbeatInterval);
    }
  }, 30000);

  // Clear heartbeat on close
  req.on('close', () => {
    clearInterval(heartbeatInterval);
  });
});

// Add endpoint for setting NPC attitude
app.post('/api/npc/:npcId/attitude', (req, res) => {
  try {
    const { npcId } = req.params;
    const { attitude } = req.body;
    
    // Validate attitude
    if (!npcConfig.attitudes[attitude]) {
      return res.status(400).json({ error: 'Invalid attitude' });
    }
    
    const session = getOrCreateSession(npcId);
    const attitudeConfig = npcConfig.attitudes[attitude];
    
    // Update session with new attitude and corresponding values
    const updatedSession = updateSession(npcId, {
      attitude,
      patience: attitudeConfig.patience,
      interest: attitudeConfig.interest
    });
    
    // Broadcast the updates to all connected clients
    broadcastAttributeUpdate(npcId, 'patience', attitudeConfig.patience);
    broadcastAttributeUpdate(npcId, 'interest', attitudeConfig.interest);
    broadcastAttributeUpdate(npcId, 'attitude', attitude);
    
    logInfo(`Set attitude for ${npcId} to ${attitude}`);
    res.json({ 
      success: true,
      attitude,
      patience: updatedSession.patience,
      interest: updatedSession.interest
    });
  } catch (error) {
    logError('Error setting attitude:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the server at http://localhost:${PORT} or http://<your-ip-address>:${PORT}`);
});