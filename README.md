# NPC Dialogue App

An interactive NPC dialogue system using AI for dynamic conversations.

## Setup

1. Install dependencies for the backend:
```bash
cd npc-dialogue-app/backend
npm install
```

2. Install dependencies for the frontend:
```bash
cd frontend
npm install
```

3. Create a `.env` file in the backend directory with your OpenAI API key:
```
OPENAI_API_KEY=your_api_key_here
```

## NPC Images

Place your NPC images in the `npc-dialogue-app/backend/images` directory. The image filename should match the NPC's ID with a `.png` extension.

For example:
- For NPC with ID "eldrin", use: `backend/images/eldrin.png`
- For NPC with ID "spider", use: `backend/images/spider.png`

Note: Images are not tracked in Git due to their size. You'll need to add your own images or generate them using the application's image generation feature.

## Running the Application

1. Start the backend server:
```bash
cd npc-dialogue-app/backend
node server.js
```

2. In a new terminal, start the frontend development server:
```bash
cd frontend && npm start
```

The application will be available at http://localhost:3000

## Features

- Interactive dialogue with NPCs using GPT-4
- Text-to-speech for NPC responses
- Image generation for NPCs
- GM mode for editing NPC details
- Separate conversation history for each NPC
