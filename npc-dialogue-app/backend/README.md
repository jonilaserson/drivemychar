# NPC Dialogue App Backend

A Node.js backend for an interactive NPC dialogue system using OpenAI's GPT-4 and ElevenLabs for voice synthesis.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
OPENAI_API_KEY=your_openai_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
PORT=3000
```

3. Start the development server:
```bash
npm run dev
```

## Deployment

This application is configured for deployment on Render.com.

1. Create a new Web Service on Render.com
2. Connect your GitHub repository
3. Set the following:
   - Build Command: `npm install`
   - Start Command: `node server.js`
4. Add your environment variables in the Render.com dashboard:
   - OPENAI_API_KEY
   - ELEVENLABS_API_KEY

## API Endpoints

- `GET /npcs` - Get list of available NPCs
- `GET /context/:npcId` - Get NPC context and conversation history
- `POST /chat/:npcId` - Send message to NPC
- `POST /speak/:npcId` - Generate speech for NPC response
- `GET /sse/conversation/:npcId` - SSE endpoint for real-time updates
- `POST /generate-image/:npcId` - Generate NPC portrait

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key
- `ELEVENLABS_API_KEY`: Your ElevenLabs API key
- `PORT`: Server port (default: 3000) 