# NPC Dialogue App

An interactive application for managing and conversing with NPCs using AI.

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   cd npc-dialogue-app/backend && npm install
   cd ../frontend && npm install
   ```
3. Create a `.env` file in the backend directory with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_key_here
   ```

## NPC Images

Place your NPC images in the `npc-dialogue-app/backend/images` directory. The image filename should match the NPC's ID with a `.png` extension.

For example:
- For NPC with ID "eldrin", use: `backend/images/eldrin.png`
- For NPC with ID "spider", use: `backend/images/spider.png`

Note: Images are not tracked in Git due to their size. You'll need to add your own images or generate them using the application's image generation feature.

## Running the Application

1. Start the backend:
   ```bash
   cd npc-dialogue-app/backend && node server.js
   ```

2. Start the frontend:
   ```bash
   cd npc-dialogue-app/frontend && npm start
   ```

3. Open http://localhost:3000 in your browser

## Features

- Interactive dialogue with NPCs using GPT-4
- Text-to-speech for NPC responses
- Image generation for NPCs
- GM mode for editing NPC details
- Separate conversation history for each NPC
