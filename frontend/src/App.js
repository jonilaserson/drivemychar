import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Use the current host's IP address for the backend URL
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000'
  : `http://${window.location.hostname}:3000`;

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
  const [showImageModal, setShowImageModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  // Function to speak text using ElevenLabs
  const speakText = async (text) => {
    if (!isSpeechEnabled) return;
    
    try {
      setIsSpeaking(true);
      console.log('Sending text to speech:', text);  // Debug log
      
      // Get the current NPC ID from the context
      const npcId = npcContext.id || 'eldrin'; // Default to 'eldrin' if not set
      
      const response = await fetch(`${BACKEND_URL}/speak/${npcId}`, {
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
    // Check for both standard and webkit prefixed version
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log('Speech recognition started');
        setIsListening(true);
        setShowProgress(false); // Reset progress when starting new recognition
      };

      recognition.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
      };

      recognition.onresult = (event) => {
        console.log('Speech recognition result received');
        const transcript = event.results[0][0].transcript;
        setPlayerInput(transcript);
        
        // Clear any existing timeout
        if (autoSubmitTimeout.current) {
          clearTimeout(autoSubmitTimeout.current);
        }

        // Start auto-submit countdown
        setShowProgress(true);
        autoSubmitTimeout.current = setTimeout(() => {
          console.log('Auto-submitting transcript:', transcript);
          setShowProgress(false);
          // Create a synthetic event for handleSubmit
          const syntheticEvent = { preventDefault: () => {} };
          handleSubmit(syntheticEvent);
        }, 3000);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setShowProgress(false);
        if (event.error === 'not-allowed') {
          alert('Please enable microphone access to use voice input.');
        }
      };

      setRecognition(recognition);
    } else {
      console.log('Speech recognition not supported');
      // Disable the microphone button if speech recognition is not supported
      setIsSpeechEnabled(false);
    }

    // Cleanup function
    return () => {
      if (autoSubmitTimeout.current) {
        clearTimeout(autoSubmitTimeout.current);
      }
    };
  }, []); // Empty dependency array since we only want to initialize once

  const startListening = () => {
    if (recognition) {
      try {
        recognition.start();
        console.log('Starting speech recognition');
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        // If recognition is already started, stop it and start again
        if (error.name === 'InvalidStateError') {
          recognition.stop();
          setTimeout(() => recognition.start(), 100);
        }
      }
    } else {
      console.log('Speech recognition not available');
      alert('Speech recognition is not supported in your browser.');
    }
  };

  const stopListening = () => {
    if (recognition) {
      recognition.stop();
      console.log('Stopping speech recognition');
    }
  };

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
        setIsLoadingContext(true);
        setIsLoadingImage(true);
        const response = await fetch(`${BACKEND_URL}/context/${selectedNpcId}`);
        const data = await response.json();
        setSelectedNpc(data);
        setNpcContext(data);
        
        // Reset conversation history for this NPC if we haven't loaded it before
        if (!loadedNpcs.current.has(selectedNpcId)) {
            conversationHistories.current[selectedNpcId] = [];
            loadedNpcs.current.add(selectedNpcId);
        }
        setConversationHistory(conversationHistories.current[selectedNpcId] || []);
        
        // Reset image state
        setNpcImage(null);
        setImageError(null);
        
        // Try loading local image first
        if (data.localImagePath) {
            const fullImageUrl = `${BACKEND_URL}${data.localImagePath}`;
            try {
                const imgResponse = await fetch(fullImageUrl);
                if (imgResponse.ok) {
                    const blob = await imgResponse.blob();
                    if (blob.size > 0) {
                        setNpcImage(fullImageUrl);
                    } else {
                        console.log('[IMAGE] Image file is empty, falling back to URL');
                        if (data.url) setNpcImage(data.url);
                    }
                } else {
                    console.log('[IMAGE] Local image not found, falling back to URL');
                    if (data.url) setNpcImage(data.url);
                }
            } catch (error) {
                console.log('[IMAGE] Error loading local image, falling back to URL:', error);
                if (data.url) setNpcImage(data.url);
            }
        } else if (data.url) {
            // No local image, use URL directly
            console.log('[IMAGE] No local image, using URL:', data.url);
            setNpcImage(data.url);
        }
        
        setIsLoadingContext(false);
        setIsLoadingImage(false);
      } catch (err) {
        console.error('Error loading NPC context:', err);
        setError('Failed to load NPC context');
        setIsLoadingContext(false);
        setIsLoadingImage(false);
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
    setIsLoadingContext(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/context/${npcContext.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(npcContext),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update NPC context');
      }

      const data = await response.json();
      
      // Update both the selected NPC and NPCs list with new data
      setSelectedNpc(data);
      setNpcs(prevNpcs => prevNpcs.map(npc => 
        npc.id === data.id ? { ...npc, ...data } : npc
      ));

      alert('NPC context updated successfully!');
    } catch (error) {
      console.error('Error updating context:', error);
      setError(error.message || 'Failed to update NPC context');
      alert('Failed to update NPC context: ' + error.message);
    } finally {
      setIsLoadingContext(false);
    }
  };

  // Function to generate a new NPC image
  const generateNpcImage = async () => {
    if (!selectedNpc) return;
    
    setIsGenerating(true);
    try {
      const response = await fetch(`${BACKEND_URL}/generate-image/${selectedNpc.id}`, {
        method: 'POST'
      });

      if (!response.ok) {
        if (response.status === 429) {
          const data = await response.json();
          setImageError('Rate limit exceeded. Please try again later.');
          setRetryAfter(data.retryAfter);
          setTimeout(() => {
            setImageError(null);
            setRetryAfter(null);
          }, data.retryAfter * 1000);
        } else {
          setImageError('Failed to generate image');
        }
        return;
      }

      const data = await response.json();
      
      // Load the new image immediately
      const fullImageUrl = `${BACKEND_URL}${data.localImagePath}`;
      try {
        const imgResponse = await fetch(fullImageUrl);
        if (imgResponse.ok) {
          const blob = await imgResponse.blob();
          if (blob.size > 0) {
            // Force image reload by adding a timestamp
            setNpcImage(`${fullImageUrl}?t=${new Date().getTime()}`);
            setImageError(null);
          } else {
            setImageError('Generated image is empty');
          }
        } else {
          setImageError('Failed to load generated image');
        }
      } catch (error) {
        console.error('Error loading generated image:', error);
        setImageError('Failed to load generated image');
      }
    } catch (error) {
      console.error('Error generating image:', error);
      setImageError('Failed to generate image');
    } finally {
      setIsGenerating(false);
    }
  };

  // Add effect to scroll to bottom when conversation history changes
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [conversationHistory]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>SpokeNPC</h1>
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
          <div className="controls-row">
            <div className="voice-controls">
              <label>
                <input
                  type="checkbox"
                  checked={isSpeechEnabled}
                  onChange={(e) => setIsSpeechEnabled(e.target.checked)}
                />
                Enable Voice
              </label>
              {isSpeaking && <span className="speaking-indicator">Speaking...</span>}
            </div>
            <button 
              onClick={() => setIsGMMode(!isGMMode)}
              className="mode-toggle-button">
              {isGMMode ? 'Switch to Player' : 'Switch to GM'}
            </button>
          </div>
        </div>
      </header>

      {selectedNpc && (
        <div className="npc-profile">
          <div className="npc-image">
            <div className="npc-image-container">
              {isLoadingImage ? (
                <div className="loading-image">Loading image...</div>
              ) : (
                <>
                  {npcImage && (
                    <img
                      className="npc-image"
                      src={npcImage}
                      alt={selectedNpc.name}
                      onClick={() => setShowImageModal(true)}
                    />
                  )}
                  {isGMMode && (
                    <button
                      className="generate-image-button"
                      onClick={generateNpcImage}
                      disabled={isGenerating}
                    >
                      {isGenerating ? 'Generating...' : 'Generate Image'}
                    </button>
                  )}
                  {imageError && <div className="image-error">{imageError}</div>}
                </>
              )}
            </div>
            {isGMMode ? (
              <div className="npc-info">
                <h2 className="npc-name">{selectedNpc.name}</h2>
                <p className="npc-description">{selectedNpc.description}</p>
                <p className="npc-personality"><strong>Personality:</strong> {selectedNpc.personality}</p>
                <p className="npc-scene"><strong>Current Scene:</strong> {selectedNpc.currentScene}</p>
              </div>
            ) : (
              <div className="player-npc-name">
                <h2>{selectedNpc.name}</h2>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && npcImage && (
          <div className="modal-overlay" onClick={() => setShowImageModal(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                  <button 
                      className="close-modal" 
                      onClick={() => setShowImageModal(false)}
                      aria-label="Close modal"
                  >
                      ×
                  </button>
                  <img
                      className="modal-image"
                      src={npcImage}
                      alt={selectedNpc?.name || 'NPC'}
                  />
              </div>
          </div>
      )}

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
              <button 
                type="submit"
                disabled={isLoadingContext}
              >
                {isLoadingContext ? 'Updating...' : 'Update NPC Context'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="player-interface">
          <div className="dialogue-container" ref={conversationRef}>
            <div className="controls">
              <button onClick={handleClearHistory} className="clear-history">
                Clear Conversation History
              </button>
            </div>
            {conversationHistory.map((message, index) => (
              <div key={index} className={`message ${message.role}`}>
                <h3>{message.role === 'user' ? 'You' : npcContext.name} says:</h3>
                <p>{message.content}</p>
              </div>
            ))}
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
              disabled={!recognition}>
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
