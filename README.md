# NPC Dialogue App

🎭 **An interactive AI-powered NPC dialogue system for tabletop RPGs and storytelling**

Transform your gaming sessions with dynamic, intelligent NPCs that respond naturally to player interactions. Features real-time GM controls, voice synthesis, image generation, and persistent character development.

## ✨ Key Features

- 🤖 **AI-Powered Conversations** - GPT-4 driven dynamic dialogue
- 🎙️ **Voice Synthesis** - ElevenLabs integration for character voices  
- 🖼️ **Image Generation** - DALL-E 3 character portraits
- 🎮 **GM Controls** - Real-time patience/interest adjustment
- ☁️ **Cloud Storage** - Cloudinary integration for persistence
- 📱 **Real-time Updates** - Live conversation synchronization

## 🚀 Quick Start

### Prerequisites
- Node.js (v14+)
- OpenAI API key
- ElevenLabs API key (optional, for voice)
- Cloudinary account (optional, for image storage)

### Installation

1. **Clone and install:**
```bash
git clone <your-repo-url>
cd explore-uv

# Install backend dependencies
cd npc-dialogue-app/backend && npm install

# Install frontend dependencies  
cd ../../frontend && npm install
```

2. **Configure backend:**
Create `npc-dialogue-app/backend/.env`:
```env
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

3. **Start the application:**
```bash
# Terminal 1: Backend (choose one of these methods)
cd npc-dialogue-app/backend
npm start
# OR
cd npc-dialogue-app/backend
node server.js

# Terminal 2: Frontend (on port 3001 to avoid conflict)
cd frontend
PORT=3001 npm start
```

> **Note**: Both `npm start` and `node server.js` work to start the backend. Use `npm start` for standard workflow, or `node server.js` for direct execution.

4. **Access:**
- **Player Interface**: http://localhost:3001
- **GM Interface**: http://localhost:3000/admin

## 🏗️ Project Structure

```
explore-uv/
├── frontend/              # React web application
│   └── src/              # React components and styles
├── npc-dialogue-app/
│   └── backend/          # Node.js API server
│       ├── server.js     # Main server file
│       ├── npcs/         # NPC configuration files
│       └── README.md     # 📖 Complete technical documentation
└── README.md             # 👈 This overview
```

## 🎮 For Game Masters

### GM Controls
- **Real-time Adjustments**: Modify NPC patience and interest during conversations
- **Attitude Presets**: Quick mood changes (Hostile, Neutral, Friendly, Enthusiastic)
- **Character Management**: Edit NPCs on the fly
- **Image Generation**: Create AI portraits

### Admin Interface
Access `/admin` to monitor conversations and control NPCs in real-time.

## 🚀 Deployment

### Live Demo
- **App**: https://drive-my-char.netlify.app/
- **Backend**: https://drivemychar.onrender.com

### Deploy Your Own
The app works with Netlify (frontend) and Render.com (backend) out of the box.

## 📚 Documentation

**[Complete Technical Documentation →](npc-dialogue-app/backend/README.md)**

Includes API reference, configuration details, troubleshooting, and deployment guides.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test your changes
4. Submit a pull request

## 📄 License

MIT License

---

**Ready to bring your NPCs to life?** 🎭✨
