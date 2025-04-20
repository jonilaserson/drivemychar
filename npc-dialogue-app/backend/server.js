require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');
const fetch = require('node-fetch');

const app = express();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Check required environment variables
if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ERROR: ELEVENLABS_API_KEY is not set in .env file');
    process.exit(1);
}

if (!process.env.ELEVENLABS_VOICE_ID) {
    console.error('ERROR: ELEVENLABS_VOICE_ID is not set in .env file');
    process.exit(1);
}

console.log('ElevenLabs configuration:');
console.log('- API Key:', process.env.ELEVENLABS_API_KEY.substring(0, 8) + '...');
console.log('- Voice ID:', process.env.ELEVENLABS_VOICE_ID);

const port = 3000;

// Set up logging
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'model_prompts.log');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// File paths for persistence
const DATA_DIR = path.join(__dirname, 'data');
const IMAGE_DATA_FILE = path.join(DATA_DIR, 'image_data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load persisted image data
let imageData = {
    lastGeneratedImageUrl: null,
    lastImageGenerationTime: 0
};

if (fs.existsSync(IMAGE_DATA_FILE)) {
    try {
        const data = fs.readFileSync(IMAGE_DATA_FILE, 'utf8');
        imageData = JSON.parse(data);
        console.log('Loaded persisted image data:', imageData);
    } catch (error) {
        console.error('Error loading image data:', error);
    }
}

// NPC context - now mutable
let npcContext = {
    name: "Eldrin the Sage",
    description: "A wise elderly elf with silver hair and ancient eyes that seem to hold centuries of knowledge. He is the keeper of the Grand Library of Silverspire and has extensive knowledge of ancient lore and magical artifacts.",
    personality: "Patient and wise, but can be cryptic at times. He has a gentle sense of humor and often teaches through questions rather than direct answers.",
    currentScene: "The Grand Library of Silverspire, a vast chamber filled with towering bookshelves, magical scrolls, and artifacts from forgotten ages.",
    gameContext: "Standard D&D 5e setting in the Forgotten Realms"
};

// Store conversation history
let conversationHistory = [];
const MAX_HISTORY = 10; // Keep last 10 exchanges

// Rate limiting constants
const MIN_TIME_BETWEEN_REQUESTS = 60000; // 60 seconds minimum between requests

// Logging utility
function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logMessage);
    console.log(logMessage.trim()); // Also log to console
}

// Function to save image data
function saveImageData() {
    try {
        // Ensure the data directory exists
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        
        // Write the image data to the file
        fs.writeFileSync(IMAGE_DATA_FILE, JSON.stringify(imageData, null, 2));
        console.log('Saved image data:', imageData);
    } catch (error) {
        console.error('Error saving image data:', error);
    }
}

// Route to update NPC context
app.post('/update-context', (req, res) => {
    const updates = req.body;
    
    // Validate required fields
    const requiredFields = ['name', 'description', 'personality', 'currentScene'];
    const missingFields = requiredFields.filter(field => !updates[field]);
    
    if (missingFields.length > 0) {
        return res.status(400).json({
            error: `Missing required fields: ${missingFields.join(', ')}`
        });
    }

    // Update context
    npcContext = {
        ...npcContext,
        ...updates
    };

    // Clear conversation history when context is updated
    conversationHistory = [];

    res.json({
        message: 'Context updated successfully',
        currentContext: npcContext
    });
});

// Route to get current context
app.get('/context', (req, res) => {
    res.json({
        ...npcContext,
        conversationHistory,
        imageUrl: imageData.lastGeneratedImageUrl // Use persisted image URL
    });
});

// Route to clear conversation history
app.post('/clear-history', (req, res) => {
    conversationHistory = [];
    res.json({ message: 'Conversation history cleared' });
});

// Route to handle dialogue input
app.post('/dialogue', async (req, res) => {
    const playerInput = req.body.input;
    
    try {
        // Add player's message to history
        conversationHistory.push({ role: "user", content: playerInput });
        
        // Keep only the last MAX_HISTORY exchanges
        if (conversationHistory.length > MAX_HISTORY * 2) {
            conversationHistory = conversationHistory.slice(-MAX_HISTORY * 2);
        }

        const messages = [
            {
                role: "system",
                content: `You are ${npcContext.name}. ${npcContext.description} ${npcContext.personality} 
                You are currently in ${npcContext.currentScene}. 
                Game Context: ${npcContext.gameContext}
                Respond in character, maintaining the personality and knowledge appropriate for your role.
                Keep responses concise (2-3 sentences) but meaningful, focusing on being helpful while maintaining the mystical and wise nature of an ancient elven sage.
                If asked about specific D&D rules or lore, provide accurate information while staying in character.
                Reference previous parts of the conversation when relevant.`
            },
            ...conversationHistory
        ];

        // Log the prompt being sent to GPT
        logToFile(`GPT Prompt:\n${JSON.stringify(messages, null, 2)}`);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini-2024-07-18",
            messages: messages,
            max_tokens: 150,
            temperature: 0.7
        });

        const npcResponse = completion.choices[0].message.content;
        
        // Log the response from GPT
        logToFile(`GPT Response:\n${npcResponse}\n`);
        
        // Add NPC's response to history
        conversationHistory.push({ role: "assistant", content: npcResponse });

        res.json({ 
            response: npcResponse,
            conversationHistory: conversationHistory
        });
    } catch (error) {
        logToFile(`Error in dialogue: ${error.message}`);
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to generate NPC response' });
    }
});

// Route to generate NPC image
app.get('/generate-npc-image', async (req, res) => {
    try {
        // Check if we're within the rate limit window
        const now = Date.now();
        const timeSinceLastRequest = now - imageData.lastImageGenerationTime;
        
        if (timeSinceLastRequest < MIN_TIME_BETWEEN_REQUESTS) {
            const waitTime = Math.ceil((MIN_TIME_BETWEEN_REQUESTS - timeSinceLastRequest) / 1000);
            logToFile(`Rate limiting: ${waitTime} seconds until next request allowed`);
            
            // If we have a cached image, return that instead
            if (imageData.lastGeneratedImageUrl) {
                logToFile('Returning cached image URL due to rate limiting');
                return res.json({ imageUrl: imageData.lastGeneratedImageUrl });
            } else {
                return res.status(429).json({ 
                    error: 'Rate limit exceeded', 
                    details: `Please wait ${waitTime} seconds before trying again` 
                });
            }
        }
        
        const imagePrompt = `Create a portrait of ${npcContext.name}: ${npcContext.description}. Style: fantasy art, detailed, professional illustration`;
        logToFile(`DALL-E Prompt:\n${imagePrompt}`);
        
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: imagePrompt,
            n: 1,
            size: "1024x1024",
            quality: "standard",
            style: "vivid"
        });

        const imageUrl = response.data[0].url;
        logToFile(`DALL-E Response URL:\n${imageUrl}\n`);
        
        imageData.lastGeneratedImageUrl = imageUrl;
        imageData.lastImageGenerationTime = now;
        
        // Save the image data to the file
        saveImageData();
        
        res.json({ imageUrl: imageData.lastGeneratedImageUrl });
    } catch (error) {
        logToFile(`Error generating image: ${error.message}`);
        console.error('Error generating image:', error);
        // If we have a cached image, return that instead of an error
        if (imageData.lastGeneratedImageUrl) {
            logToFile('Returning cached image URL due to error');
            res.json({ imageUrl: imageData.lastGeneratedImageUrl });
        } else {
            res.status(500).json({ error: 'Failed to generate image', details: error.message });
        }
    }
});

// Route to handle text-to-speech
app.post('/speak', async (req, res) => {
    const { text } = req.body;
    
    try {
        logToFile(`Generating speech for text: ${text}`);
        
        // Generate audio using ElevenLabs API directly
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': process.env.ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.52,
                    similarity_boost: 0.85,
                    style: 0.0,
                    use_speaker_boost: true
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            logToFile(`ElevenLabs API error: ${JSON.stringify(errorData)}`);
            throw new Error(`ElevenLabs API error: ${JSON.stringify(errorData)}`);
        }

        // Get the audio buffer
        const audioBuffer = await response.buffer();
        logToFile(`Successfully generated speech, buffer size: ${audioBuffer.length} bytes`);

        // Set appropriate headers
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length
        });

        // Send the audio buffer
        res.send(audioBuffer);
    } catch (error) {
        console.error('Error generating speech:', error);
        logToFile(`Error generating speech: ${error.message}`);
        res.status(500).json({ error: 'Failed to generate speech', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
}); 