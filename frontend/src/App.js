import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Add BACKEND_URL constant at the top of the file
const BACKEND_URL = 'http://localhost:3000';

function App() {
  const [npcs, setNpcs] = useState([]);
  const [selectedNpc, setSelectedNpc] = useState(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [npcImage, setNpcImage] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [retryAfter, setRetryAfter] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const conversationHistories = useRef({});  // Store histories by NPC ID
  const imageCache = useRef({});
  const imageGenerationTimeout = useRef(null);
  const loadedNpcs = useRef(new Set());  // Track which NPCs we've loaded
  const [playerInput, setPlayerInput] = useState('');
  const [npcResponse, setNpcResponse] = useState('');
  const [isGMMode, setIsGMMode] = useState(false);
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
    id: '',
    name: '',
    description: '',
    personality: '',
    currentScene: '',
    gameContext: ''
  });
  const [selectedNpcId, setSelectedNpcId] = useState('');
  const conversationRef = useRef(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  // Function to speak text using ElevenLabs
  const speakText = async (text) => {
    if (!isSpeechEnabled) return;
    
    try {
      setIsSpeaking(true);
      console.log('Sending text to speech:', text);  // Debug log
      
      // Get the current NPC ID from the context
      const npcId = npcContext.id || 'eldrin'; // Default to 'eldrin' if not set
      
      const response = await fetch(`http://localhost:3000/speak/${npcId}`, {
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

  // Fetch available NPCs on component mount
  useEffect(() => {
    const loadNpcs = async () => {
      // Skip if we already have NPCs loaded
      if (npcs.length > 0) return;
      
      try {
        const response = await fetch(`${BACKEND_URL}/npcs`);
        const data = await response.json();
        setNpcs(data);
        if (data.length > 0) {
          setSelectedNpcId(data[0].id);
        }
      } catch (err) {
        setError('Failed to load NPCs');
      }
    };
    loadNpcs();
  }, [npcs.length]); // Only re-run if npcs.length changes

  // Load NPC context when selected NPC changes
  useEffect(() => {
    const loadSelectedNpc = async () => {
      if (!selectedNpcId) return;
      
      try {
        const response = await fetch(`${BACKEND_URL}/context/${selectedNpcId}`);
        const data = await response.json();
        
        // Set both states with the NPC data
        setSelectedNpc(data);
        setNpcContext({
          id: data.id,
          name: data.name,
          description: data.description,
          personality: data.personality,
          currentScene: data.currentScene,
          gameContext: data.gameContext
        });
        
        // Load the conversation history for this NPC
        setConversationHistory(conversationHistories.current[selectedNpcId] || []);
        
        // Always try to use the local image first
        if (data.localImagePath) {
          const fullImageUrl = `${BACKEND_URL}${data.localImagePath}`;
          console.log(`Attempting to load local image from: ${fullImageUrl}`);
          setNpcImage(fullImageUrl);
        }
      } catch (err) {
        console.error('Error loading NPC context:', err);
        setError('Failed to load NPC context');
      }
    };

    loadSelectedNpc();
  }, [selectedNpcId]); // Only re-run when selectedNpcId changes

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
    if (e) e.preventDefault();
    if (!playerInput.trim() || !selectedNpc) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/dialogue/${selectedNpc.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: playerInput.trim(),
          conversationHistory
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Update both the current conversation history and the stored history
      setConversationHistory(data.conversationHistory);
      conversationHistories.current[selectedNpc.id] = data.conversationHistory;
      
      setPlayerInput('');
      
      // Speak the NPC's response if speech is enabled
      if (data.response && isSpeechEnabled) {
        speakText(data.response);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
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
      if (selectedNpc) {
        conversationHistories.current[selectedNpc.id] = [];
      }
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
      setNpcImage('/placeholder.png');
      
      // Don't automatically generate a new image - wait for explicit request
    }
  };

  // Function to generate a new NPC image
  const generateNpcImage = async (npcId, forceGenerate = false) => {
    // Clear any existing timeout
    if (imageGenerationTimeout.current) {
        clearTimeout(imageGenerationTimeout.current);
    }

    // Clear any existing errors
    setImageError(null);
    setRetryAfter(null);

    // Check cache first - always use cached image if available and not forcing generation
    if (imageCache.current[npcId] && !forceGenerate) {
        console.log(`Using cached image for: ${npcId}`);
        setNpcImage(imageCache.current[npcId]);
        return;
    }

    // Only proceed with API call if forceGenerate is true
    if (!forceGenerate) {
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/generate-image/${npcId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 429) {
                setImageError('Rate limit exceeded. Please wait before trying again.');
                setRetryAfter(errorData.retryAfter);
                // Retry after the specified time
                setTimeout(() => generateNpcImage(npcId, true), errorData.retryAfter * 1000);
            } else {
                throw new Error(errorData.error || 'Failed to generate image');
            }
            return;
        }

        const data = await response.json();
        console.log('Received new DALL-E image:', data.imageUrl);
        // Update cache correctly using .current
        imageCache.current[npcId] = data.imageUrl;
        setNpcImage(data.imageUrl);
    } catch (error) {
        console.error('Error loading image:', error);
        setImageError(error.message);
        setNpcImage(null);
    }
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

  // Add a new function to handle explicit image generation
  const handleGenerateImage = () => {
    if (selectedNpcId) {
        generateNpcImage(selectedNpcId, true);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>NPC Dialogue System</h1>
        <div className="header-controls">
          <select 
            value={selectedNpcId} 
            onChange={(e) => {
                setSelectedNpcId(e.target.value);
            }}
            className="npc-selector">
            {npcs.map(npc => (
              <option key={npc.id} value={npc.id}>{npc.name}</option>
            ))}
          </select>
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
          <div className="character-info">
            <div className="npc-image-container">
                {npcImage ? (
                    <img 
                        src={npcImage} 
                        alt={selectedNpc.name} 
                        className="npc-image"
                        onError={(e) => {
                            console.error('Failed to load image:', e);
                            setNpcImage(null);
                        }}
                    />
                ) : (
                    <div className="no-image-placeholder">
                        No image available
                    </div>
                )}
                {imageError && (
                    <div className="image-error">
                        {imageError}
                        {retryAfter && (
                            <div className="retry-message">
                                Retrying in {retryAfter} seconds...
                            </div>
                        )}
                    </div>
                )}
            </div>
          </div>
          <div className="npc-info">
            <h2 className="npc-name">{npcContext.name}</h2>
            <div className="npc-details">
              <p><strong>Description:</strong> {npcContext.description}</p>
              <p><strong>Personality:</strong> {npcContext.personality}</p>
              <p><strong>Current Scene:</strong> {npcContext.currentScene}</p>
            </div>
          </div>
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
              <button 
                type="button" 
                className="generate-image-button"
                onClick={handleGenerateImage}
              >
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
