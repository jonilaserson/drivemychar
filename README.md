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

## Running in Different Modes

### Local Development (Frontend and Backend)
1. Start the backend server:
```bash
cd npc-dialogue-app/backend
node server.js
```

2. In a new terminal, start the frontend development server with local backend:
```bash
cd frontend
PORT=3001 REACT_APP_USE_LOCAL_BACKEND=true npm start
```

The frontend will be available at http://localhost:3001 and will connect to the local backend at http://localhost:3000

### Accessing from Other Machines on the Network
When running locally, you can access the application from other machines on the same network:

1. Find your machine's IP address (e.g., 192.168.1.100 or 10.100.102.15)
2. Start the backend server as usual
3. Start the frontend with:
```bash
cd frontend
PORT=3001 REACT_APP_USE_LOCAL_BACKEND=true npm start
```
4. Access the frontend from other machines using:
   - Frontend: http://YOUR_IP:3001
   - Backend: http://YOUR_IP:3000

### Using the Hosted Server
To run the frontend against the production backend:

```bash
cd frontend
npm start
```

This will connect to the hosted backend at https://drivemychar.onrender.com

## Features

- Interactive dialogue with NPCs using GPT-4
- Text-to-speech for NPC responses
- Image generation for NPCs
- GM mode for editing NPC details
- Separate conversation history for each NPC
