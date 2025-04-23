require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

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
app.use('/images', express.static(path.join(__dirname, 'images')));

// Set up logging
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'model_prompts.log');
const NPCS_DIR = path.join(__dirname, 'npcs');

// Ensure directories exist
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}
if (!fs.existsSync(NPCS_DIR)) {
    fs.mkdirSync(NPCS_DIR, { recursive: true });
}

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

// Logging utility
function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logMessage);
    console.log(logMessage.trim());
}

// Function to format prompt with NPC data
function formatPrompt(template, npcData) {
    return template
        .replace('{name}', npcData.name)
        .replace('{description}', npcData.description)
        .replace('{personality}', npcData.personality)
        .replace('{currentScene}', npcData.currentScene)
        .replace('{gameContext}', npcData.gameContext);
}

// Add this near the top with other constants
const IMAGE_CACHE = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitMap = new Map();

// Add this function to check rate limits
function checkRateLimit(npcId) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(npcId) || [];
  
  // Remove requests older than the window
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(npcId, recentRequests);
  return true;
}

// Route to get available NPCs
app.get('/npcs', (req, res) => {
    const npcList = Object.values(npcs).map(npc => ({
        id: npc.id,
        name: npc.name,
        description: npc.description
    }));
    res.json(npcList);
});

// Route to get specific NPC context
app.get('/context/:npcId', (req, res) => {
    const npc = npcs[req.params.npcId];
    if (!npc) {
        return res.status(404).json({ error: 'NPC not found' });
    }

    // Add the local image path to the NPC data
    const localImagePath = `/images/${npc.id}.png`;
    console.log(`[CONTEXT] Setting localImagePath for ${npc.id} to: ${localImagePath}`);
    console.log(`[CONTEXT] Full image path would be: ${path.join(__dirname, 'images', `${npc.id}.png`)}`);
    
    const npcWithImage = {
        ...npc,
        localImagePath
    };

    res.json(npcWithImage);
});

// Route to handle dialogue
app.post('/dialogue/:npcId', async (req, res) => {
    const npc = npcs[req.params.npcId];
    if (!npc) {
        return res.status(404).json({ error: 'NPC not found' });
    }

    const playerInput = req.body.input;
    
    try {
        const systemPrompt = formatPrompt(npc.systemPrompt, npc);
        const messages = [
            { role: "system", content: systemPrompt }
        ];

        // Add conversation history if provided
        if (req.body.conversationHistory) {
            messages.push(...req.body.conversationHistory);
        }

        // Add current input
        if (playerInput) {
            messages.push({ role: "user", content: playerInput });
        }

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
        const updatedHistory = [...(req.body.conversationHistory || [])];
        if (playerInput) {
            updatedHistory.push({ role: "user", content: playerInput });
        }
        updatedHistory.push({ role: "assistant", content: npcResponse });

        res.json({ 
            response: npcResponse,
            conversationHistory: updatedHistory
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to generate response' });
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
        logToFile(`Generating speech for text: ${text}`);
        
        // Generate audio using ElevenLabs API
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${npc.voice.voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': process.env.ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_multilingual_v2",
                voice_settings: npc.voice.settings
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
  
  // Check if we have a cached image for this NPC
  if (imageCache[npcId]) {
    console.log(`[DALL-E CACHE] Using cached DALL-E image for: ${npcId}`);
    console.log(`[DALL-E CACHE] Cached URL: ${imageCache[npcId]}`);
    return res.json({ imageUrl: imageCache[npcId] });
  }
  
  // If no cached image, generate a new one
  try {
    const npc = npcs[npcId];
    if (!npc) {
      return res.status(404).json({ error: 'NPC not found' });
    }

    // Use formatPrompt to properly replace placeholders
    const defaultPrompt = `Create a portrait of {name}: {description} Style: fantasy art, detailed, professional illustration`;
    const prompt = npc.imagePrompt ? formatPrompt(npc.imagePrompt, npc) : formatPrompt(defaultPrompt, npc);
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
    
    // Cache the image URL
    imageCache[npcId] = imageUrl;
    
    res.json({ imageUrl });
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

const port = 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});