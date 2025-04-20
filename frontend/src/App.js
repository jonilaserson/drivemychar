import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [playerInput, setPlayerInput] = useState('');
  const [npcResponse, setNpcResponse] = useState('');
  const [isGMMode, setIsGMMode] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [npcImage, setNpcImage] = useState('https://placehold.co/400x400/222222/FFFFFF?text=Loading+NPC+Image...');
  const [imageError, setImageError] = useState(null);
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [showProgress, setShowProgress] = useState(false);
  const autoSubmitTimeout = useRef(null);
  const inputRef = useRef(null);
  const [voiceSettings, setVoiceSettings] = useState({
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true
  });
  const [npcContext, setNpcContext] = useState({
    name: '',
    description: '',
    personality: '',
    currentScene: '',
    gameContext: ''
  });

  // Function to speak text using ElevenLabs
  const speakText = async (text) => {
    if (!isSpeechEnabled) return;
    
    try {
      setIsSpeaking(true);
      console.log('Sending text to speech:', text);  // Debug log
      
      const response = await fetch('http://localhost:3000/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text })
      });

      console.log('Speech API response status:', response.status);  // Debug log

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Speech API error:', errorData);  // Debug log
        throw new Error(errorData.error || 'Failed to generate speech');
      }

      // Create audio element and play the response
      const audioBlob = await response.blob();
      console.log('Received audio blob size:', audioBlob.size);  // Debug log
      
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);  // Debug log
        setIsSpeaking(false);
      };

      await audio.play();
    } catch (error) {
      console.error('Error speaking text:', error);
      setIsSpeaking(false);
    }
  };

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        setPlayerInput(transcript);
        setShowProgress(true);
        
        // Clear any existing timeout
        if (autoSubmitTimeout.current) {
          clearTimeout(autoSubmitTimeout.current);
        }

        // Start 3-second countdown for auto-submit
        autoSubmitTimeout.current = setTimeout(() => {
          if (inputRef.current === document.activeElement) {
            // User is editing, don't auto-submit
            setShowProgress(false);
          } else {
            handleSubmit(new Event('submit'));
            setShowProgress(false);
          }
        }, 3000);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setShowProgress(false);
      };

      setRecognition(recognition);
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSubmitTimeout.current) {
        clearTimeout(autoSubmitTimeout.current);
      }
    };
  }, []);

  // Handle input focus/blur
  const handleInputFocus = () => {
    if (autoSubmitTimeout.current) {
      clearTimeout(autoSubmitTimeout.current);
      setShowProgress(false);
    }
  };

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
    
    // Speak the NPC's response if speech is enabled
    if (data.response && isSpeechEnabled) {
      speakText(data.response);
    }
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

  const startListening = () => {
    if (recognition && !isListening) {
      recognition.start();
    }
  };

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop();
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>NPC Dialogue System</h1>
        <div className="header-controls">
          <button onClick={() => setIsGMMode(!isGMMode)}>
            Switch to {isGMMode ? 'Player' : 'GM'} Mode
          </button>
          <div className="voice-controls">
            <label>
              <input
                type="checkbox"
                checked={isSpeechEnabled}
                onChange={(e) => setIsSpeechEnabled(e.target.checked)}
              />
              Enable NPC Voice
            </label>
            {isSpeaking && <span className="speaking-indicator">Speaking...</span>}
          </div>
        </div>
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
            <div className="input-wrapper">
              <input
                ref={inputRef}
                type="text"
                value={playerInput}
                onChange={(e) => setPlayerInput(e.target.value)}
                onFocus={handleInputFocus}
                placeholder="Speak to the NPC..."
              />
              {showProgress && <div className="auto-submit-progress" />}
            </div>
            <button type="submit">Send</button>
            <button 
              type="button" 
              className={`voice-input-button ${isListening ? 'listening' : ''}`}
              onClick={isListening ? stopListening : startListening}
              title={isListening ? "Stop recording" : "Start recording"}
            >
              <svg viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
