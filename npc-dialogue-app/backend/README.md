# NPC Dialogue App Backend

A sophisticated Node.js backend for an interactive NPC dialogue system featuring AI-powered conversations, voice synthesis, image generation, and real-time GM controls.

## 🚀 Features

### Core Functionality
- **AI-Powered Conversations**: GPT-4 integration for dynamic, context-aware NPC dialogues
- **Voice Synthesis**: ElevenLabs integration for realistic NPC speech
- **Image Generation**: DALL-E 3 integration for NPC portrait generation
- **Real-time Updates**: Server-Sent Events (SSE) for live conversation synchronization
- **Cloud Storage**: Cloudinary integration for image and data management

### Advanced Features
- **GM Controls**: Real-time patience and interest adjustment
- **Motivation System**: Track and respond to character motivation appeals
- **Session Management**: Persistent conversation history and character states
- **Attitude System**: Configurable NPC attitudes affecting behavior
- **Response Triggers**: Dynamic reactions to player interactions
- **Rate Limiting**: Built-in protection against API abuse

## 🛠️ Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- OpenAI API key
- ElevenLabs API key
- Cloudinary account (for image storage)

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Create environment file:**
Create a `.env` file in the backend directory:
```env
# AI Services
OPENAI_API_KEY=your_openai_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Cloud Storage
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Server Configuration
PORT=3000
```

3. **Start the server:**
```bash
# Development
npm run dev

# Production
npm start
```

## 📁 Project Structure

```
backend/
├── server.js              # Main server file
├── config/                # Configuration files
│   ├── npc-config.json   # NPC behavior configuration
│   └── prompt_format.json # AI prompt templates
├── npcs/                  # Local NPC data files
├── data/
│   └── sessions/          # Session persistence
├── logs/                  # Application logs
├── utils/                 # Utility modules
│   ├── promptFormatter.js
│   ├── rateLimiter.js
│   └── logger.js
└── admin.html            # GM admin interface
```

## 🎮 NPC Configuration

NPCs are configured using JSON files with the following structure:

```json
{
  "id": "character_id",
  "name": "Character Name",
  "description": "Physical description",
  "personality": "Personality traits",
  "currentScene": "Current situation",
  "whatTheyKnow": ["Knowledge item 1", "Knowledge item 2"],
  "pitfalls": ["Potential conversation pitfall"],
  "motivations": ["Character motivation"],
  "voice": {
    "provider": "elevenlabs",
    "voiceId": "voice_id_from_elevenlabs",
    "settings": {
      "stability": 0.55,
      "similarity_boost": 0.7,
      "style": 0.3,
      "use_speaker_boost": true
    }
  },
  "imagePrompt": "DALL-E prompt for character portrait"
}
```

## 🌐 API Endpoints

### Core Endpoints

#### NPCs
- `GET /npcs` - List all available NPCs
- `GET /context/:npcId` - Get NPC context and session data
- `POST /context/:npcId` - Update NPC context

#### Conversations
- `POST /chat/:npcId` - Send message to NPC
- `GET /sse/conversation/:npcId` - Real-time conversation updates
- `POST /clear-history/:npcId` - Clear conversation history

#### Media Generation
- `POST /speak/:npcId` - Generate speech audio
- `POST /generate-image/:npcId` - Generate NPC portrait

### GM Control Endpoints

#### Attribute Management
- `POST /api/npc/:npcId/patience` - Adjust NPC patience
- `POST /api/npc/:npcId/interest` - Adjust NPC interest
- `POST /api/npc/:npcId/attitude` - Set NPC attitude

#### Admin Functions
- `GET /admin/npc/:npcId` - Get NPC data for editing
- `PUT /admin/npc/:npcId` - Update NPC data
- `POST /admin/npc/:npcId/voice` - Update voice settings
- `POST /npcs` - Create new NPC

#### Utilities
- `GET /admin` - GM admin interface
- `POST /admin/clean-npcs` - Clean NPC data in Cloudinary

## 🎯 GM Controls

### Patience System
- Range: 0-5
- Affects NPC willingness to continue conversation
- Adjustable in real-time via GM interface

### Interest System
- Range: 0-5
- Affects NPC engagement level
- Increases when motivations are appealed to

### Attitude Presets
- **Hostile**: Low patience (1), Low interest (1)
- **Neutral**: Medium patience (3), Medium interest (2)
- **Friendly**: High patience (4), High interest (3)
- **Enthusiastic**: Max patience (5), High interest (4)

## 🔄 Real-time Features

### Server-Sent Events (SSE)
The system uses SSE for real-time updates:

```javascript
// Client-side connection
const eventSource = new EventSource('/sse/conversation/npcId?client=clientId');

eventSource.addEventListener('update', (event) => {
  const data = JSON.parse(event.data);
  // Handle conversation updates
});

eventSource.addEventListener('attributeUpdate', (event) => {
  const data = JSON.parse(event.data);
  // Handle patience/interest changes
});
```

### Motivation Tracking
NPCs can detect when players appeal to their motivations:
- Automatic interest increase
- Sound effects trigger
- Prevents repeated appeals to same motivation

## ☁️ Cloudinary Integration

### Image Management
- Automatic upload of generated NPC portraits
- Persistent storage across sessions
- Automatic loading of existing images

### Data Synchronization
- NPC data backup to cloud
- Seamless switching between local and cloud storage
- Version control for NPC configurations

### Folder Structure
```
cloudinary/
├── npcs/
│   ├── images/           # NPC portraits
│   │   ├── character1.png
│   │   └── character2.png
│   └── data/             # NPC configuration files
│       ├── character1.json
│       └── character2.json
```

## 🚀 Deployment

### Render.com Deployment

1. **Create Web Service**
   - Connect GitHub repository
   - Set build command: `npm install`
   - Set start command: `node server.js`

2. **Environment Variables**
   Add all required environment variables in Render dashboard

3. **Auto-deploy**
   - Automatic deployments on git push
   - Health checks included

### Environment Variables for Production
```env
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
PORT=3000
```

## 🔧 Configuration Files

### `config/npc-config.json`
Global NPC behavior settings:
- Response triggers
- Attitude definitions
- Voice provider defaults

### `config/prompt_format.json`
AI prompt templates for consistent character behavior

## 📊 Logging and Monitoring

### Log Files
- `logs/model_prompts.log` - AI interaction logs
- Console logging for real-time monitoring

### Rate Limiting
- 5 requests per minute per NPC
- Automatic retry-after headers
- Protection against API abuse

## 🛡️ Security Features

- CORS configuration
- Rate limiting
- Input validation
- Environment variable protection
- Secure file handling

## 🔄 Session Management

### Persistent Sessions
- Automatic session creation
- Conversation history storage
- Character state persistence
- Periodic auto-save (5 minutes)

### Session Data
```json
{
  "npcId": "character_id",
  "sessionId": "2025-01-28-character_id-1",
  "startedAt": "2025-01-28T10:00:00.000Z",
  "lastActive": "2025-01-28T10:30:00.000Z",
  "attitude": "neutral",
  "patience": 3,
  "interest": 2,
  "messages": [],
  "trackedMotivations": []
}
```

## 🎵 Audio Features

### ElevenLabs Integration
- High-quality voice synthesis
- Character-specific voice settings
- Configurable voice parameters
- Action text filtering (removes [actions])

### Voice Configuration
```json
{
  "provider": "elevenlabs",
  "voiceId": "voice_id",
  "settings": {
    "stability": 0.55,
    "similarity_boost": 0.7,
    "style": 0.3,
    "use_speaker_boost": true
  }
}
```

## 🖼️ Image Generation

### DALL-E 3 Integration
- High-quality portrait generation
- Customizable prompts per character
- Automatic Cloudinary upload
- 1024x1024 resolution

### Image Prompt Template
```
Create a portrait of {name}: {description} 
Style: fantasy art, detailed, professional illustration
```

## 🐛 Troubleshooting

### Common Issues

1. **Images not loading**
   - Check Cloudinary configuration
   - Verify image exists in `npcs/images/` folder
   - Restart server to reload image URLs

2. **Voice synthesis failing**
   - Verify ElevenLabs API key
   - Check voice ID validity
   - Monitor rate limits

3. **SSE connection issues**
   - Check CORS settings
   - Verify client connection handling
   - Monitor server logs

### Debug Mode
Set `NODE_ENV=development` for verbose logging.

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review server logs
- Open GitHub issue with detailed description 