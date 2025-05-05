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
        npcs[npcData.id] = npcData;
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
    patience: 5, // Changed from 100 to 5 (max value in new scale)
    interest: 3, // Default interest value
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

// Function to broadcast attribute updates to all connected clients
function broadcastAttributeUpdate(npcId, type, value) {
  const clients = SSE_CLIENTS.get(npcId);
  if (!clients) return;

  const eventData = JSON.stringify({
    type: `${type}Update`,
    [type]: value
  });

  for (const client of clients) {
    try {
      client.write(`data: ${eventData}\n\n`);
    } catch (error) {
      console.error(`Error broadcasting ${type} update:`, error);
      clients.delete(client);
    }
  }
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
  }
  
  const clients = SSE_CLIENTS.get(npcId);
  const clientKey = `${clientId}_${Date.now()}`;
  clients.add(res);
  
  // Handle client disconnect
  req.on('close', () => {
    logInfo(`SSE connection closed for ${npcId} from client ${clientId}`);
    if (SSE_CLIENTS.has(npcId)) {
      const clients = SSE_CLIENTS.get(npcId);
      clients.delete(res);
      if (clients.size === 0) {
        SSE_CLIENTS.delete(npcId);
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

    const npcResponse = completion.choices[0].message.content;
    logToFile(`GPT Response:\n${npcResponse}`);

    // Update conversation history
    const updatedHistory = [...conversationHistory, userMessage, { role: "assistant", content: npcResponse }];
    
    // Save the updated conversation history in session
    updateSession(npcId, {
      messages: updatedHistory,
      lastClientId: clientId
    });

    logInfo(`Chat completed for ${npcId}, new message count: ${updatedHistory.length}`);

    // Broadcast the update to all connected clients
    broadcastConversationUpdate(npcId);
    
    res.json({ 
      response: npcResponse,
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

// Add endpoint to clear conversation history
app.post('/clear-history/:npcId', (req, res) => {
  try {
    const { npcId } = req.params;
    const clientId = req.query.client || 'unknown';
    
    logInfo(`Clear history request for ${npcId} from client ${clientId}`);
    
    // Update session with empty messages array
    updateSession(npcId, {
      messages: []
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the server at http://localhost:${PORT} or http://<your-ip-address>:${PORT}`);
});