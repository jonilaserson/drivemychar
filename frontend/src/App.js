import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [playerInput, setPlayerInput] = useState('');
  const [npcResponse, setNpcResponse] = useState('');
  const [isGMMode, setIsGMMode] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [npcImage, setNpcImage] = useState('https://placehold.co/400x400/222222/FFFFFF?text=Loading+NPC+Image...');
  const [imageError, setImageError] = useState(null);
  const [npcContext, setNpcContext] = useState({
    name: '',
    description: '',
    personality: '',
    currentScene: '',
    gameContext: ''
  });

  // Fetch initial context and generate NPC image
  useEffect(() => {
    fetch('http://localhost:3000/context')
      .then(response => response.json())
      .then(data => {
        setNpcContext({
          name: data.name,
          description: data.description,
          personality: data.personality,
          currentScene: data.currentScene,
          gameContext: data.gameContext
        });
        setConversationHistory(data.conversationHistory || []);
        
        // Set a placeholder image based on the NPC's name
        const placeholderUrl = `https://placehold.co/400x400/222222/FFFFFF?text=${encodeURIComponent(data.name)}`;
        setNpcImage(placeholderUrl);
        setImageError(null);
        
        // Use the cached image URL if available
        if (data.imageUrl) {
          console.log('Using cached image URL:', data.imageUrl);
          setNpcImage(data.imageUrl);
        }
      })
      .catch(error => {
        console.error('Error fetching context:', error);
        setImageError(error.message);
      });
  }, []);

  const handleInputChange = (e) => {
    setPlayerInput(e.target.value);
  };

  const handleContextChange = (e) => {
    const { name, value } = e.target;
    setNpcContext(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const response = await fetch('http://localhost:3000/dialogue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: playerInput }),
    });
    const data = await response.json();
    setNpcResponse(data.response);
    setConversationHistory(data.conversationHistory);
    setPlayerInput('');
  };

  const handleClearHistory = async () => {
    const response = await fetch('http://localhost:3000/clear-history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    if (response.ok) {
      setConversationHistory([]);
    }
  };

  const handleContextSubmit = async (e) => {
    e.preventDefault();
    const response = await fetch('http://localhost:3000/update-context', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(npcContext),
    });
    const data = await response.json();
    if (data.message) {
      alert('NPC context updated successfully!');
      setConversationHistory([]); // Clear conversation history when context is updated
      
      // Update placeholder image immediately
      setNpcImage(`https://placehold.co/400x400/222222/FFFFFF?text=${encodeURIComponent(npcContext.name)}`);
      
      // Don't automatically generate a new image - wait for explicit request
    }
  };

  // Function to generate a new NPC image
  const generateNpcImage = () => {
    console.log('Generating new NPC image...');
    setNpcImage(`https://placehold.co/400x400/222222/FFFFFF?text=${encodeURIComponent(npcContext.name)}`);
    setImageError(null);
    
    fetch('http://localhost:3000/generate-npc-image')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.imageUrl) {
          console.log('New image URL received:', data.imageUrl);
          setNpcImage(data.imageUrl);
        } else {
          throw new Error('No image URL in response');
        }
      })
      .catch(error => {
        console.error('Error generating NPC image:', error);
        setImageError(error.message);
        // Keep the placeholder image
      });
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>NPC Dialogue System</h1>
        <button onClick={() => setIsGMMode(!isGMMode)}>
          Switch to {isGMMode ? 'Player' : 'GM'} Mode
        </button>
      </header>

      <div className="npc-profile">
        <div className="npc-image">
          <img 
            src={npcImage} 
            alt={npcContext.name} 
            onError={(e) => {
              console.error('Image failed to load:', e);
              setImageError('Failed to load image');
              e.target.src = `https://placehold.co/400x400/222222/FFFFFF?text=${encodeURIComponent(npcContext.name)}`;
            }}
          />
          {imageError && (
            <div className="image-error">
              <p>Error loading image: {imageError}</p>
              <p>Using placeholder image instead</p>
            </div>
          )}
        </div>
        <div className="npc-info">
          <h2>{npcContext.name}</h2>
          <p><strong>Description:</strong> {npcContext.description}</p>
          <p><strong>Personality:</strong> {npcContext.personality}</p>
          <p><strong>Current Scene:</strong> {npcContext.currentScene}</p>
        </div>
      </div>

      {isGMMode ? (
        <div className="gm-interface">
          <h2>Game Master Interface</h2>
          <form onSubmit={handleContextSubmit} className="context-form">
            <div className="form-group">
              <label>NPC Name:</label>
              <input
                type="text"
                name="name"
                value={npcContext.name}
                onChange={handleContextChange}
                placeholder="Enter NPC name"
              />
            </div>
            <div className="form-group">
              <label>Description:</label>
              <textarea
                name="description"
                value={npcContext.description}
                onChange={handleContextChange}
                placeholder="Describe the NPC's appearance and role"
              />
            </div>
            <div className="form-group">
              <label>Personality:</label>
              <textarea
                name="personality"
                value={npcContext.personality}
                onChange={handleContextChange}
                placeholder="Describe the NPC's personality traits"
              />
            </div>
            <div className="form-group">
              <label>Current Scene:</label>
              <textarea
                name="currentScene"
                value={npcContext.currentScene}
                onChange={handleContextChange}
                placeholder="Describe the current location and scene"
              />
            </div>
            <div className="form-group">
              <label>Game Context:</label>
              <textarea
                name="gameContext"
                value={npcContext.gameContext}
                onChange={handleContextChange}
                placeholder="Additional game context, setting, or relevant information"
              />
            </div>
            <div className="form-actions">
              <button type="submit">Update NPC Context</button>
              <button type="button" onClick={generateNpcImage} className="generate-image-btn">
                Generate New Image
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="player-interface">
          <h1>NPC Dialogue</h1>
          <div className="dialogue-container">
            {conversationHistory.map((message, index) => (
              <div key={index} className={`message ${message.role}`}>
                <h3>{message.role === 'user' ? 'You' : npcContext.name} says:</h3>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
          <div className="controls">
            <button onClick={handleClearHistory} className="clear-history">
              Clear Conversation History
            </button>
          </div>
          <form onSubmit={handleSubmit} className="input-form">
            <input
              type="text"
              value={playerInput}
              onChange={handleInputChange}
              placeholder="Speak to the NPC..."
            />
            <button type="submit">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
