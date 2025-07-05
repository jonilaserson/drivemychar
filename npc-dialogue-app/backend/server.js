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
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const User = require('./models/User');
const NPCOwnership = require('./models/NPCOwnership');
const { authenticateToken, optionalAuth } = require('./middleware/auth');
const { checkOwnership, checkAccess } = require('./middleware/ownership');

// Add Passport configuration
const passport = require('passport');
require('./config/passport');

// Add Cloudinary configuration
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('Cloudinary configured with cloud name:', process.env.CLOUDINARY_CLOUD_NAME);

const app = express();

// Connect to MongoDB with error handling
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/npc-dialogue-app')
  .then(() => {
    console.log('Connected to MongoDB successfully');
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error.message);
    console.log('Server will continue without database functionality');
    console.log('To enable full functionality, please install MongoDB or use MongoDB Atlas');
  });

// Add session middleware (using memory store for now)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

console.log('Using memory session store (sessions will be lost on restart)');

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Ensure all required directories exist
const REQUIRED_DIRS = [
  path.join(__dirname, 'logs'),
  path.join(__dirname, 'npcs'),
  path.join(__dirname, 'images'),
  path.join(__dirname, 'data'),
  path.join(__dirname, 'data', 'sessions'),
  path.join(__dirname, 'config')
];

REQUIRED_DIRS.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Enable CORS and JSON parsing
app.use(cors({
    origin: true, // Allow all origins in development
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Add root route handler
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'NPC Dialogue App API is running',
    availableEndpoints: {
      getNPCs: '/npcs',
      getNPCContext: '/context/:npcId',
      chat: '/chat/:npcId',
      speak: '/speak/:npcId',
      generateImage: '/generate-image/:npcId',
      realTimeUpdates: '/sse/conversation/:npcId'
    },
    docs: 'See README.md for detailed API documentation'
  });
});

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

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Google OAuth routes (only if configured)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  app.get('/auth/google', passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  }));

  app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
      // Generate JWT token
      const token = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL}/auth-callback?token=${token}`);
    }
  );
} else {
  // Fallback routes when Google OAuth is not configured
  app.get('/auth/google', (req, res) => {
    res.status(503).json({ error: 'Google OAuth not configured' });
  });
  
  app.get('/auth/google/callback', (req, res) => {
    res.status(503).json({ error: 'Google OAuth not configured' });
  });
}

// Simple login status check
app.get('/auth/status', (req, res) => {
  if (req.user) {
    res.json({ 
      authenticated: true, 
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        picture: req.user.picture
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    database: dbStatus,
    googleOAuth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

// Logout
app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.json({ success: true });
  });
});

// Set up logging
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'model_prompts.log');
const NPCS_DIR = path.join(__dirname, 'npcs');
const CONFIG_DIR = path.join(__dirname, 'config');

// Load prompt format configuration
const promptConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'prompt_format.json'), 'utf8'));
const npcConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'npc-config.json'), 'utf8'));

// Load NPCs
const npcs = {};

// Helper function to search for NPC image in Cloudinary
async function findNpcImageInCloudinary(npcId) {
  try {
    const imageResult = await cloudinary.search
      .expression(`public_id:npcs/images/${npcId}`)
      .max_results(1)
      .execute();
    
    if (imageResult.resources && imageResult.resources.length > 0) {
      const imageUrl = imageResult.resources[0].secure_url;
      console.log(`Found Cloudinary image for ${npcId}: ${imageUrl}`);
      return imageUrl;
    } else {
      console.log(`No Cloudinary image found for ${npcId}`);
      return null;
    }
  } catch (error) {
    console.log(`Error searching for image for ${npcId}:`, error.message);
    return null;
  }
}

// Function to load NPCs from Cloudinary
async function loadNpcsFromCloudinary() {
  try {
    console.log('Loading NPCs from Cloudinary...');
    
    // Get list of all NPC data files from Cloudinary
    const result = await cloudinary.search
      .expression('public_id:npcs/data/*')
      .max_results(100)
      .execute();

    console.log(`Found ${result.resources.length} NPCs in Cloudinary`);

    // Load each NPC's data from Cloudinary
    for (const resource of result.resources) {
      try {
        const response = await fetch(resource.secure_url);
        const npcData = await response.json();
        const imageUrl = await findNpcImageInCloudinary(npcData.id);
        
        // Merge with default config
        npcs[npcData.id] = {
          ...npcData,
          responseTriggers: npcConfig.responseTriggers,
          whatTheyKnow: npcData.whatTheyKnow || [],
          pitfalls: npcData.pitfalls || [],
          motivations: npcData.motivations || [],
          name: npcData.name || 'Unknown',
          description: npcData.description || '',
          personality: npcData.personality || '',
          currentScene: npcData.currentScene || '',
          cloudinaryUrl: resource.secure_url,
          imageUrl: imageUrl
        };
        
        console.log(`Loaded NPC ${npcData.id} from Cloudinary${imageUrl ? ' with image' : ''}`);
      } catch (error) {
        console.error(`Error loading NPC from ${resource.secure_url}:`, error);
      }
    }
    
    // Search for Cloudinary images for locally-loaded NPCs
    console.log('Searching for Cloudinary images for locally-loaded NPCs...');
    const localNpcs = Object.entries(npcs).filter(([_, npc]) => npc.source === 'local' && !npc.imageUrl);
    
    for (const [npcId, npc] of localNpcs) {
      const imageUrl = await findNpcImageInCloudinary(npcId);
      if (imageUrl) {
        npc.imageUrl = imageUrl;
        console.log(`Found Cloudinary image for locally-loaded NPC ${npcId}`);
      }
    }
  } catch (error) {
    console.error('Error loading NPCs from Cloudinary:', error);
  }
}

// Load NPCs from local files first, then from Cloudinary
fs.readdirSync(NPCS_DIR).forEach(file => {
    if (file.endsWith('.json')) {
        const npcData = JSON.parse(fs.readFileSync(path.join(NPCS_DIR, file), 'utf8'));
        // Only load if not already loaded
        if (!npcs[npcData.id]) {
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
                currentScene: npcData.currentScene || '',
                source: 'local'
            };
            logInfo(`Loaded NPC ${npcData.id} from local file with response triggers: ${JSON.stringify(npcConfig.responseTriggers)}`);
        } else {
            logInfo(`Skipping duplicate NPC ${npcData.id} from local file`);
        }
    }
});

// Load NPCs from Cloudinary (this will add to or override local NPCs)
loadNpcsFromCloudinary().then(() => {
  console.log('All NPCs loaded. Available NPCs:', Object.keys(npcs));
});

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

// Function to extract clean NPC data (only core properties that should be saved)
function getCleanNpcData(npc) {
    return {
        id: npc.id,
        name: npc.name,
        description: npc.description,
        personality: npc.personality,
        currentScene: npc.currentScene,
        whatTheyKnow: npc.whatTheyKnow || [],
        pitfalls: npc.pitfalls || [],
        motivations: npc.motivations || [],
        voice: npc.voice,
        imagePrompt: npc.imagePrompt,
        imageUrl: npc.imageUrl // Include Cloudinary image URL
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
app.get(['/api/context/:npcId', '/context/:npcId'], optionalAuth, checkAccess, async (req, res) => {
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
    
    // Check for Cloudinary image first, then local image
    let imageUrl = null;
    let localImagePath = null;
    
    if (npc.imageUrl) {
      // Use Cloudinary image if available
      imageUrl = npc.imageUrl;
      localImagePath = npc.imageUrl;
      console.log(`[CONTEXT] Using Cloudinary image for ${npc.id}: ${imageUrl}`);
    } else {
      // Fall back to local image
      const localPath = `/images/${npc.id}.png`;
      const imagePath = path.join(__dirname, 'images', `${npc.id}.png`);
      const hasLocalImage = fs.existsSync(imagePath);
      
      if (hasLocalImage) {
        localImagePath = localPath;
        console.log(`[CONTEXT] Using local image for ${npc.id}: ${localPath}`);
      } else {
        console.log(`[CONTEXT] No image found for ${npc.id}`);
      }
    }
    
    res.json({
      ...npc,
      session: {
        id: session.sessionId,
        patience: session.patience,
        interest: session.interest,
        lastUpdated: session.lastActive
      },
      localImagePath: localImagePath,
      imageUrl: imageUrl,
      conversationHistory: session.messages,
      access: {
        isOwner: req.isOwner,
        canEdit: req.isOwner,
        canUseGMFeatures: req.isOwner
      }
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
        !updatedNpc.personality || !updatedNpc.currentScene || 
        !updatedNpc.whatTheyKnow || !updatedNpc.pitfalls || !updatedNpc.motivations) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Update the NPC data in memory (merge with existing runtime properties)
    npcs[npcId] = {
      ...npcs[npcId], // Keep existing runtime properties like responseTriggers, source, etc.
      ...updatedNpc,  // Apply the updates
      id: npcId       // Ensure ID doesn't change
    };
    
    // Save clean data to local file
    const filePath = path.join(NPCS_DIR, `${npcId}.json`);
    const cleanNpcData = getCleanNpcData(npcs[npcId]);
    fs.writeFileSync(filePath, JSON.stringify(cleanNpcData, null, 2));
    
    logInfo(`Updated context for ${npcId}`);
    
    // Return the updated NPC data (clean version)
    res.json(cleanNpcData);
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
app.post('/api/npc/:npcId/patience', authenticateToken, checkOwnership, (req, res) => {
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
app.post('/api/npc/:npcId/interest', authenticateToken, checkOwnership, (req, res) => {
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
  }, 30000);
  
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
      model: "gpt-4o-mini",
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

// Modify the generate-image endpoint to use Cloudinary
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
    
    // Upload image to Cloudinary
    console.log('Uploading image to Cloudinary...');
    const uploadResponse = await cloudinary.uploader.upload(imageUrl, {
      public_id: `npcs/images/${npcId}`,
      overwrite: true
    });

    console.log(`[${new Date().toISOString()}] Image uploaded to Cloudinary:`, uploadResponse.secure_url);

    // Update NPC data with Cloudinary image URL
    npc.imageUrl = uploadResponse.secure_url;
    npc.cloudinaryImageId = uploadResponse.public_id;

    // Save updated NPC data to Cloudinary (use clean data only)
    console.log('Saving updated NPC data to Cloudinary...');
    const cleanNpcData = getCleanNpcData(npc);
    const npcDataBuffer = Buffer.from(JSON.stringify(cleanNpcData, null, 2));
    console.log(`[${new Date().toISOString()}] Saving NPC data to Cloudinary for ${npcId}:`, cleanNpcData);
    const npcDataUpload = await cloudinary.uploader.upload(
      `data:application/json;base64,${npcDataBuffer.toString('base64')}`,
      {
        public_id: `npcs/data/${npcId}`,
        resource_type: 'raw',
        overwrite: true
      }
    );

    console.log(`[${new Date().toISOString()}] NPC data saved to Cloudinary:`, {
      public_id: npcDataUpload.public_id,
      secure_url: npcDataUpload.secure_url,
      resource_type: npcDataUpload.resource_type
    });
    
    res.json({ 
        imageUrl: uploadResponse.secure_url,
        localImagePath: uploadResponse.secure_url, // Use Cloudinary URL as the "local" path
        npcDataUrl: npcDataUpload.secure_url
    });
  } catch (error) {
    console.error('Error generating/uploading image:', error);
    
    // Handle rate limit errors
    if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after'] || 60; // Default to 60 seconds
      return res.status(429).json({ 
        error: 'Rate limit exceeded', 
        retryAfter: parseInt(retryAfter) 
      });
    }
    
    res.status(500).json({ error: 'Failed to generate/upload image' });
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
app.post('/api/npc/:npcId/attitude', authenticateToken, checkOwnership, (req, res) => {
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

// Character parsing endpoint
app.post('/parse-character', async (req, res) => {
  try {
    const { rawText } = req.body;
    
    if (!rawText || rawText.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a character description' });
    }

    const parsingPrompt = `
You are a D&D character data parser. Extract character information from the provided text and return ONLY valid JSON in this exact format:

{
  "name": "Character Name",
  "description": "Physical appearance and notable features (2-3 sentences)",
  "personality": "Personality traits, mannerisms, speaking style (2-3 sentences)",
  "currentScene": "Where they are and what they're doing right now (1-2 sentences)",
  "whatTheyKnow": ["Specific knowledge item 1", "Specific knowledge item 2", "Specific knowledge item 3", "Specific knowledge item 4"],
  "pitfalls": ["Potential conversation pitfall or character weakness"],
  "motivations": ["Primary driving motivation", "Secondary motivation", "Personal goal"]
}

Rules:
- Extract concrete, actionable information from the text
- whatTheyKnow: 3-5 specific facts, secrets, or knowledge they possess
- pitfalls: 1-3 ways conversations could go wrong or character vulnerabilities
- motivations: 2-4 driving forces, goals, or desires that motivate the character
- If information is missing, infer reasonable defaults based on context and common D&D tropes
- Keep descriptions concise but vivid
- Return ONLY the JSON object, no other text or formatting
`;

    const messages = [
      { role: "system", content: parsingPrompt },
      { role: "user", content: rawText }
    ];

    logToFile(`Character Parsing GPT Prompt:\n${JSON.stringify(messages, null, 2)}`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.3,
      max_tokens: 800
    });

    const rawResponse = completion.choices[0].message.content;
    logToFile(`Character Parsing GPT Response:\n${rawResponse}`);

    const parsedJson = JSON.parse(rawResponse);
    
    // Generate ID and add defaults
    const id = parsedJson.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const completeData = {
      ...parsedJson,
      id,
      imagePrompt: `Create a portrait of ${parsedJson.name}: ${parsedJson.description} Style: fantasy art, detailed, professional illustration`,
      voice: {
        provider: "elevenlabs",
        voiceId: "ysswSXp8U9dFpzPJqFje",
        settings: {
          stability: 0.55,
          similarity_boost: 0.7,
          style: 0.3,
          use_speaker_boost: true
        }
      }
    };

    logInfo(`Parsed character: ${parsedJson.name} (ID: ${id})`);
    res.json(completeData);
  } catch (error) {
    logError('Error parsing character:', error);
    res.status(500).json({ 
      error: 'Failed to parse character', 
      details: error.message 
    });
  }
});

// Add endpoint to create new NPC
app.post('/npcs', authenticateToken, async (req, res) => {
  try {
    const npcData = req.body;
    const npcId = npcData.id.toLowerCase().replace(/[^a-z0-9]/g, '');
    const userId = req.user._id;

    // Validate required fields
    if (!npcId || !npcData.name || !npcData.description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if NPC already exists
    const existingOwnership = await NPCOwnership.findOne({ npcId });
    if (existingOwnership) {
      return res.status(409).json({ error: 'NPC with this ID already exists' });
    }

    // Create ownership record
    const ownership = new NPCOwnership({
      npcId,
      ownerId: userId,
      shareToken: generateShareToken()
    });
    await ownership.save();

    // Prepare NPC data with defaults
    const completeNpcData = {
      id: npcId,
      name: npcData.name,
      description: npcData.description,
      personality: npcData.personality || '',
      currentScene: npcData.currentScene || '',
      whatTheyKnow: npcData.whatTheyKnow || [],
      pitfalls: npcData.pitfalls || [],
      motivations: npcData.motivations || [],
      imagePrompt: npcData.imagePrompt || '',
      voice: npcData.voice || {
        provider: "elevenlabs",
        voiceId: "ysswSXp8U9dFpzPJqFje", // Default voice
        settings: {
          stability: 0.55,
          similarity_boost: 0.7,
          style: 0.3,
          use_speaker_boost: true
        }
      }
    };

    console.log(`Creating new NPC: ${npcId}`);

    // Save clean NPC data to Cloudinary
    const npcDataBuffer = Buffer.from(JSON.stringify(completeNpcData, null, 2));
    console.log(`[${new Date().toISOString()}] Saving NPC data to Cloudinary for ${npcId}:`, completeNpcData);
    const npcDataUpload = await cloudinary.uploader.upload(
      `data:application/json;base64,${npcDataBuffer.toString('base64')}`,
      {
        public_id: `npcs/data/${npcId}`,
        resource_type: 'raw',
        overwrite: true
      }
    );

    console.log(`[${new Date().toISOString()}] NPC data saved to Cloudinary:`, {
      public_id: npcDataUpload.public_id,
      secure_url: npcDataUpload.secure_url,
      resource_type: npcDataUpload.resource_type
    });

    // Add to local npcs object (with runtime properties)
    npcs[npcId] = {
      ...completeNpcData,
      responseTriggers: npcConfig.responseTriggers,
      source: 'cloudinary',
      createdAt: new Date().toISOString(),
      cloudinaryUrl: npcDataUpload.secure_url
    };

    console.log(`NPC ${npcId} created and saved to Cloudinary`);

    res.json({
      success: true,
      npc: completeNpcData,
      shareUrl: `${req.protocol}://${req.get('host')}/npc/${npcId}?token=${ownership.shareToken}`
    });
  } catch (error) {
    console.error('Error creating NPC:', error);
    res.status(500).json({ error: 'Failed to create NPC' });
  }
});

// Admin endpoints for editing NPCs
// GET endpoint to retrieve current NPC data for editing
app.get('/admin/npc/:npcId', (req, res) => {
  try {
    const { npcId } = req.params;
    const npc = npcs[npcId];
    
    if (!npc) {
      return res.status(404).json({ error: 'NPC not found' });
    }
    
    // Return clean NPC data (without runtime properties)
    const cleanNpcData = getCleanNpcData(npc);
    res.json(cleanNpcData);
  } catch (error) {
    console.error('Error getting NPC for admin:', error);
    res.status(500).json({ error: 'Failed to get NPC data' });
  }
});

// PUT endpoint to update NPC data
app.put('/admin/npc/:npcId', async (req, res) => {
  try {
    const { npcId } = req.params;
    const updatedData = req.body;
    
    if (!npcs[npcId]) {
      return res.status(404).json({ error: 'NPC not found' });
    }
    
    // Update the NPC data in memory
    npcs[npcId] = {
      ...npcs[npcId],
      ...updatedData,
      id: npcId, // Ensure ID doesn't change
      lastModified: new Date().toISOString()
    };
    
    console.log(`Admin: Updating NPC ${npcId} data`);
    
    // Save clean NPC data to Cloudinary
    const cleanNpcData = getCleanNpcData(npcs[npcId]);
    const npcDataBuffer = Buffer.from(JSON.stringify(cleanNpcData, null, 2));
    const npcDataUpload = await cloudinary.uploader.upload(
      `data:application/json;base64,${npcDataBuffer.toString('base64')}`,
      {
        public_id: `npcs/data/${npcId}`,
        resource_type: 'raw',
        overwrite: true
      }
    );
    
    console.log(`Admin: NPC ${npcId} data saved to Cloudinary:`, npcDataUpload.secure_url);
    
    res.json({
      success: true,
      npc: npcs[npcId],
      cloudinaryUrl: npcDataUpload.secure_url
    });
  } catch (error) {
    console.error('Error updating NPC:', error);
    res.status(500).json({ error: 'Failed to update NPC' });
  }
});

// Quick endpoint to update just the voice ID
app.post('/admin/npc/:npcId/voice', async (req, res) => {
  try {
    const { npcId } = req.params;
    const { voiceId, settings } = req.body;
    
    if (!npcs[npcId]) {
      return res.status(404).json({ error: 'NPC not found' });
    }
    
    // Update voice settings
    npcs[npcId].voice = {
      ...npcs[npcId].voice,
      voiceId: voiceId || npcs[npcId].voice.voiceId,
      settings: settings || npcs[npcId].voice.settings
    };
    
    console.log(`Admin: Updating voice for ${npcId} to ${voiceId}`);
    
    // Save clean NPC data to Cloudinary
    const cleanNpcData = getCleanNpcData(npcs[npcId]);
    const npcDataBuffer = Buffer.from(JSON.stringify(cleanNpcData, null, 2));
    const npcDataUpload = await cloudinary.uploader.upload(
      `data:application/json;base64,${npcDataBuffer.toString('base64')}`,
      {
        public_id: `npcs/data/${npcId}`,
        resource_type: 'raw',
        overwrite: true
      }
    );
    
    res.json({
      success: true,
      voice: npcs[npcId].voice,
      cloudinaryUrl: npcDataUpload.secure_url
    });
  } catch (error) {
    console.error('Error updating voice:', error);
    res.status(500).json({ error: 'Failed to update voice' });
  }
});

// Utility endpoint to clean all NPC data in Cloudinary (remove runtime properties)
app.post('/admin/clean-npcs', async (req, res) => {
  try {
    const results = [];
    
    for (const [npcId, npc] of Object.entries(npcs)) {
      try {
        console.log(`Cleaning NPC data for ${npcId}...`);
        
        // Get clean data
        const cleanNpcData = getCleanNpcData(npc);
        
        // Save to Cloudinary
        const npcDataBuffer = Buffer.from(JSON.stringify(cleanNpcData, null, 2));
        const npcDataUpload = await cloudinary.uploader.upload(
          `data:application/json;base64,${npcDataBuffer.toString('base64')}`,
          {
            public_id: `npcs/data/${npcId}`,
            resource_type: 'raw',
            overwrite: true
          }
        );
        
        // Also save to local file
        const filePath = path.join(NPCS_DIR, `${npcId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(cleanNpcData, null, 2));
        
        results.push({
          npcId,
          status: 'success',
          cloudinaryUrl: npcDataUpload.secure_url
        });
        
        console.log(`Successfully cleaned ${npcId}`);
      } catch (error) {
        console.error(`Error cleaning ${npcId}:`, error);
        results.push({
          npcId,
          status: 'error',
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Cleaned ${results.filter(r => r.status === 'success').length} NPCs`,
      results
    });
  } catch (error) {
    console.error('Error cleaning NPCs:', error);
    res.status(500).json({ error: 'Failed to clean NPCs' });
  }
});

// Add this after the existing routes and before the port listener
// Character-specific routes for direct URLs
app.get('/api/character/:npcId/info', (req, res) => {
  const { npcId } = req.params;
  const npc = npcs[npcId];
  
  if (!npc) {
    return res.status(404).json({ error: 'Character not found' });
  }
  
  res.json({
    id: npc.id,
    name: npc.name,
    description: npc.description,
    exists: true
  });
});

// Get all characters with basic info for selection
app.get('/api/characters', (req, res) => {
  const characterList = Object.values(npcs).map(npc => ({
    id: npc.id,
    name: npc.name,
    description: npc.description,
    imageUrl: npc.imageUrl
  }));
  
  res.json(characterList);
});

// Utility endpoint to verify NPC data in Cloudinary
app.get('/admin/verify-npc/:npcId', async (req, res) => {
  try {
    const { npcId } = req.params;
    console.log(`[${new Date().toISOString()}] Verifying NPC ${npcId} in Cloudinary...`);
    
    // Check for NPC data
    const dataResult = await cloudinary.search
      .expression(`public_id:npcs/data/${npcId}`)
      .max_results(1)
      .execute();
    
    // Check for NPC image
    const imageResult = await cloudinary.search
      .expression(`public_id:npcs/images/${npcId}`)
      .max_results(1)
      .execute();
    
    const verification = {
      npcId,
      data: {
        exists: dataResult.resources.length > 0,
        details: dataResult.resources[0] || null
      },
      image: {
        exists: imageResult.resources.length > 0,
        details: imageResult.resources[0] || null
      }
    };
    
    console.log(`[${new Date().toISOString()}] Verification results for ${npcId}:`, verification);
    
    res.json(verification);
  } catch (error) {
    console.error('Error verifying NPC:', error);
    res.status(500).json({ error: 'Failed to verify NPC data' });
  }
});

// Add this after the loadNpcsFromCloudinary function
async function reloadNpcsFromCloudinary() {
  try {
    console.log('Reloading NPCs from Cloudinary...');
    // Clear existing NPCs
    Object.keys(npcs).forEach(key => delete npcs[key]);
    // Reload from Cloudinary
    await loadNpcsFromCloudinary();
    console.log('NPCs reloaded successfully. Available NPCs:', Object.keys(npcs));
    return true;
  } catch (error) {
    console.error('Error reloading NPCs:', error);
    return false;
  }
}

// Add this before the server start
// Endpoint to reload NPCs from Cloudinary
app.post('/admin/reload-npcs', async (req, res) => {
  try {
    const success = await reloadNpcsFromCloudinary();
    if (success) {
      res.json({ 
        success: true, 
        message: 'NPCs reloaded successfully',
        availableNpcs: Object.keys(npcs)
      });
    } else {
      res.status(500).json({ error: 'Failed to reload NPCs' });
    }
  } catch (error) {
    console.error('Error in reload endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint to get user's NPCs
app.get('/api/my-npcs', authenticateToken, async (req, res) => {
  try {
    const ownerships = await NPCOwnership.find({ ownerId: req.user._id });
    const userNpcs = ownerships.map(ownership => {
      const npc = npcs[ownership.npcId];
      return npc ? {
        id: npc.id,
        name: npc.name,
        description: npc.description,
        imageUrl: npc.imageUrl,
        shareUrl: `${req.protocol}://${req.get('host')}/npc/${npc.id}?token=${ownership.shareToken}`
      } : null;
    }).filter(Boolean);
    
    res.json(userNpcs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user NPCs' });
  }
});

// Helper function to generate share tokens
function generateShareToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the server at http://localhost:${PORT} or http://<your-ip-address>:${PORT}`);
});