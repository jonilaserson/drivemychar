import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Use the local network IP address for the backend URL
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : 'http://10.100.102.15:3000';  // Your computer's actual IP address

// Add a unique client ID to identify this instance in logs
const CLIENT_ID = `client_${Math.random().toString(36).substring(2, 9)}`;

// Add a console log to help debug the URL being used
console.log('Using backend URL:', BACKEND_URL);
console.log('Client ID:', CLIENT_ID);

// Helper function to get color based on value
function getAttributeColor(value) {
  if (value > 3) return '#4CAF50'; // Green
  if (value > 2) return '#FFC107'; // Yellow
  if (value > 1) return '#FF9800'; // Orange
  return '#F44336'; // Red
}

// Generic AttributePoints component to replace both PatiencePoints and InterestPoints
const AttributePoints = ({ points, maxPoints = 5, activeColor = '#4CAF50', className = 'patience-points' }) => {
  // Debug log to track rendering
  console.log(`DEBUGGING: AttributePoints rendering with class=${className}, points=${points}`);
  
  // Determine color based on total points
  let color = activeColor; 
  if (points <= 1) color = '#F44336'; // Red
  else if (points <= 2) color = '#FF9800'; // Orange
  else if (points <= 3) color = '#FFC107'; // Yellow
  
  // Force points to be a number between 0-5
  const safePoints = Math.max(0, Math.min(5, Number(points) || 0));
  console.log(`DEBUGGING: Safe points value: ${safePoints} (original: ${points})`);
  
  // Create array for the points
  const pointsArray = [...Array(maxPoints)];
  
  return (
    <div className={className}>
      {pointsArray.map((_, i) => {
        // Determine if this point is active
        const isActive = i < safePoints;
        const pointClass = className.replace('points', 'point');
        
        return (
          <div 
            key={i} 
            className={`${pointClass} ${isActive ? 'active' : ''}`}
            style={{ backgroundColor: isActive ? color : 'transparent' }}
          />
        );
      })}
    </div>
  );
};

// Use AttributePoints for both patience and interest
const PatiencePoints = (props) => <AttributePoints {...props} className="patience-points" activeColor="#4CAF50" />;
const InterestPoints = (props) => {
  console.log('DEBUGGING: Rendering InterestPoints with props', props);
  return <AttributePoints {...props} className="interest-points" activeColor="#FFD700" />;
};

// Patience meter icon component
const PatienceIcon = () => {
  console.log('Rendering PatienceIcon component');
  return (
    <img 
      src="/images/patience-icon.png" 
      alt="Patience" 
      className="patience-icon-img"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'contain'
      }}
    />
  );
};

// Interest meter icon component
const InterestIcon = () => {
  console.log('Rendering InterestIcon component');
  return (
    <img 
      src="/images/interest-icon.png" 
      alt="Interest" 
      className="interest-icon-img"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'contain'
      }}
    />
  );
};

// Generic AttributeTracker component
const AttributeTracker = ({ label, value, icon, onIncrement, onDecrement, isGmMode }) => {
  const color = getAttributeColor(value);
  
  return (
    <div className="attribute-tracker">
      <div className="attribute-icon">{icon}</div>
      <div className="attribute-points">
        {isGmMode && <button onClick={onDecrement}>-</button>}
        {Array.from({ length: 5 }, (_, i) => (
          <div 
            key={i} 
            className={`attribute-point ${i < value ? 'active' : ''}`}
            style={i < value ? { backgroundColor: color } : {}}
          />
        ))}
        {isGmMode && <button onClick={onIncrement}>+</button>}
      </div>
      <div className="attribute-label">{label}</div>
    </div>
  );
};

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
  const [lastUpdated, setLastUpdated] = useState(null); // Track last conversation update
  const sseSourceRef = useRef(null); // Reference to SSE connection
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
  const audioCache = useRef({}); // Cache for audio blobs by NPC ID and text
  const [patiencePoints, setPatiencePoints] = useState(5);
  const [interestPoints, setInterestPoints] = useState(3);

  // Function to load and set an image from a URL
  const loadAndSetImage = async (imageUrl, fallbackUrl = null) => {
    try {
      // Create a new image element to test the URL
      const img = new Image();
      img.src = imageUrl;
      
      // Return a promise that resolves when the image loads or fails
      return new Promise((resolve) => {
        img.onload = () => {
          setNpcImage(imageUrl);
          setImageError(null);
          resolve(true);
        };
        
        img.onerror = () => {
          if (fallbackUrl) {
            console.log('[IMAGE] Primary image not available, using fallback URL');
            setNpcImage(fallbackUrl);
            setImageError(null);
            resolve(true);
          } else {
            console.error('[IMAGE] Failed to load image:', imageUrl);
            setImageError('Image not available');
            resolve(false);
          }
        };
      });
    } catch (error) {
      console.error('[IMAGE] Error loading image:', error);
      if (fallbackUrl) {
        setNpcImage(fallbackUrl);
        setImageError(null);
        return true;
      }
      return false;
    }
  };

  // Function to speak text using ElevenLabs
  const speakText = async (text, npcId = null) => {
    if (!isSpeechEnabled) return;
    
    try {
      setIsSpeaking(true);
      
      // Use provided npcId or fall back to current NPC
      const currentNpcId = npcId || npcContext.id || 'eldrin';
      
      // Check cache first
      const cacheKey = `${currentNpcId}:${text}`;
      if (audioCache.current[cacheKey]) {
        console.log('Using cached audio');
        const audio = new Audio(audioCache.current[cacheKey]);
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = (e) => {
          console.error('Audio playback error:', e);
          setIsSpeaking(false);
        };
        await audio.play();
        return;
      }

      console.log('Fetching new audio from API');
      const response = await fetch(`${BACKEND_URL}/speak/${currentNpcId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate speech');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Cache the audio URL
      audioCache.current[cacheKey] = audioUrl;
      
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsSpeaking(false);
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
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

  // Function to fetch initial conversation data
  const fetchInitialConversation = async (npcId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/conversation/${npcId}?client=${CLIENT_ID}`);
      
      if (!response.ok) {
        console.error('Error fetching initial conversation:', response.statusText);
        return;
      }
      
      const data = await response.json();
      
      if (data.conversationHistory && data.conversationHistory.length > 0) {
        console.log(`Loaded initial conversation data (${data.messageCount} messages)`);
        setConversationHistory(data.conversationHistory);
        conversationHistories.current[npcId] = data.conversationHistory;
        setLastUpdated(data.lastUpdated);
      }
    } catch (error) {
      console.error('Error fetching initial conversation:', error);
    }
  };

  // Setup SSE connection when NPC is selected
  useEffect(() => {
    if (!selectedNpcId) return;
    
    console.log(`Setting up SSE connection for ${selectedNpcId}`);
    
    // Close any existing SSE connection
    if (sseSourceRef.current) {
      console.log('Closing previous SSE connection');
      sseSourceRef.current.close();
      sseSourceRef.current = null;
    }
    
    // Create a new SSE connection
    const timestamp = Date.now(); // Add timestamp to prevent caching
    const eventSource = new EventSource(`${BACKEND_URL}/api/events/${selectedNpcId}`);
    sseSourceRef.current = eventSource;
    
    // Listen for all event types
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE event received:', data);
        
        if (data.type === 'initialState') {
          setPatiencePoints(data.patience);
          setInterestPoints(data.interest);
        } else if (data.type === 'patienceUpdate') {
          setPatiencePoints(data.patience);
        } else if (data.type === 'interestUpdate') {
          setInterestPoints(data.interest);
        } else if (data.type === 'update' && data.conversationHistory) {
          setConversationHistory(data.conversationHistory);
          conversationHistories.current[selectedNpcId] = data.conversationHistory;
          setLastUpdated(data.lastUpdated);
        }
      } catch (error) {
        console.error('Error processing SSE event:', error);
      }
    };
    
    // Handle errors
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // Try to reconnect after 5 seconds if connection fails
      if (eventSource.readyState === EventSource.CLOSED) {
        setTimeout(() => {
          console.log('Attempting to reconnect SSE...');
          eventSource.close();
          sseSourceRef.current = new EventSource(`${BACKEND_URL}/api/events/${selectedNpcId}`);
        }, 5000);
      }
    };
    
    // Cleanup on unmount or when NPC changes
    return () => {
      console.log('Closing SSE connection due to unmount or NPC change');
      eventSource.close();
      sseSourceRef.current = null;
    };
  }, [selectedNpcId]);

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
        
        // Set patience from session if available
        if (data.session && data.session.patience !== undefined) {
          setPatiencePoints(data.session.patience);
        }
        
        // Use server-side conversation history if available
        if (data.conversationHistory && data.conversationHistory.length > 0) {
          console.log('Using server-side conversation history');
          setConversationHistory(data.conversationHistory);
          conversationHistories.current[selectedNpcId] = data.conversationHistory;
          if (data.session && data.session.lastUpdated) {
            setLastUpdated(data.session.lastUpdated);
          }
        } else {
          // Reset conversation history for this NPC if no server history
          if (!loadedNpcs.current.has(selectedNpcId)) {
              conversationHistories.current[selectedNpcId] = [];
              loadedNpcs.current.add(selectedNpcId);
          }
          setConversationHistory(conversationHistories.current[selectedNpcId] || []);
        }
        
        // Reset image state
        setNpcImage(null);
        setImageError(null);
        
        // Try loading local image first, fall back to URL if available
        if (data.localImagePath) {
          const fullImageUrl = `${BACKEND_URL}${data.localImagePath}`;
          const success = await loadAndSetImage(fullImageUrl, data.url);
          if (!success && !data.url) {
            setImageError('Image not available');
          }
        } else if (data.url) {
          await loadAndSetImage(data.url);
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
      const response = await fetch(`${BACKEND_URL}/chat/${selectedNpc.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: playerInput.trim(),
          conversationHistory,
          clientId: CLIENT_ID
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // The server will broadcast the update via SSE
      // but we'll also update locally for immediate feedback
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
    if (!selectedNpc) return;
    
    try {
      console.log('Clearing conversation history for', selectedNpc.id);
      
      // 1. Close any existing SSE connection to ensure we get a fresh one after clearing
      if (sseSourceRef.current) {
        console.log('Closing SSE connection before clearing history');
        sseSourceRef.current.close();
        sseSourceRef.current = null;
      }
      
      // 2. Update local state immediately for responsive UI
      setConversationHistory([]);
      conversationHistories.current[selectedNpc.id] = [];
      
      // 3. Send clear request to server
      const response = await fetch(`${BACKEND_URL}/clear-history/${selectedNpc.id}?client=${CLIENT_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear conversation history');
      }
      
      // 4. Reload the context and conversation just to be sure
      const contextResponse = await fetch(`${BACKEND_URL}/context/${selectedNpc.id}`);
      const contextData = await contextResponse.json();
      
      if (contextData.conversationHistory) {
        // This should be empty now
        setConversationHistory(contextData.conversationHistory);
        conversationHistories.current[selectedNpc.id] = contextData.conversationHistory;
      }
      
      // 5. Force a new SSE connection to get fresh updates
      const timestamp = Date.now();
      sseSourceRef.current = new EventSource(
        `${BACKEND_URL}/sse/conversation/${selectedNpc.id}?client=${CLIENT_ID}&t=${timestamp}`
      );
      
      // Set up event listeners again
      sseSourceRef.current.addEventListener('update', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`Fresh SSE: Received conversation update (${data.messageCount || 0} messages)`);
          setConversationHistory(data.conversationHistory || []);
          conversationHistories.current[selectedNpc.id] = data.conversationHistory || [];
          
          // Update patience points from percentage
          if (data.session && data.session.patience !== undefined) {
            setPatiencePoints(data.session.patience);
          }
        } catch (error) {
          console.error('Error processing SSE update after clear:', error);
        }
      });
      
      console.log('Conversation history cleared successfully');
    } catch (err) {
      console.error('Error clearing conversation history:', err);
      setError('Failed to clear conversation history');
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
      const fullImageUrl = `${BACKEND_URL}${data.localImagePath}`;
      
      // Force cache invalidation with timestamp
      const success = await loadAndSetImage(`${fullImageUrl}?t=${new Date().getTime()}`);
      if (!success) {
        setImageError('Generated image is not available');
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

  // Generic function to adjust attributes
  const adjustAttribute = (type, adjustment) => {
    if (!selectedNpc) return;
    
    // Get current value and setter based on attribute type
    const currentValue = type === 'patience' ? patiencePoints : interestPoints;
    const setter = type === 'patience' ? setPatiencePoints : setInterestPoints;
    
    // Calculate new value with bounds check
    const newValue = Math.max(0, Math.min(5, currentValue + adjustment));
    
    // Update state immediately for responsiveness
    setter(newValue);
    
    // Send request to server
    const endpoint = `${BACKEND_URL}/api/npc/${selectedNpc.id}/${type}`;
    console.log(`Adjusting ${type} by ${adjustment}, endpoint: ${endpoint}`);
    
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ adjustment })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Error adjusting ${type}`);
      }
      return response.json();
    })
    .then(data => {
      // Update with server value
      if (data[type] !== undefined) {
        setter(data[type]);
      }
    })
    .catch(error => {
      console.error(`Error adjusting ${type}:`, error);
      // Revert on error
      setter(currentValue);
    });
  };

  // Define simple wrapper functions for each attribute
  const adjustPatience = (adjustment) => adjustAttribute('patience', adjustment);
  const adjustInterest = (adjustment) => adjustAttribute('interest', adjustment);

  return (
    <div className="App">
      <header className="App-header">
        <h1>DriveMyChar</h1>
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
                Auto Voice
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
                
                <AttributeTracker
                  label="Patience"
                  value={patiencePoints}
                  icon={<PatienceIcon />}
                  onIncrement={() => adjustPatience(1)}
                  onDecrement={() => adjustPatience(-1)}
                  isGmMode={isGMMode}
                />
                
                <AttributeTracker
                  label="Interest"
                  value={interestPoints}
                  icon={<InterestIcon />}
                  onIncrement={() => adjustInterest(1)}
                  onDecrement={() => adjustInterest(-1)}
                  isGmMode={isGMMode}
                />
                
                <p className="npc-description">{selectedNpc.description}</p>
                <p className="npc-personality"><strong>Personality:</strong> {selectedNpc.personality}</p>
                <p className="npc-scene"><strong>Current Scene:</strong> {selectedNpc.currentScene}</p>
              </div>
            ) : (
              <div className="player-npc-name">
                <h2>{selectedNpc.name}</h2>
                
                <AttributeTracker
                  label="Patience"
                  value={patiencePoints}
                  icon={<PatienceIcon />}
                  onIncrement={() => adjustPatience(1)}
                  onDecrement={() => adjustPatience(-1)}
                  isGmMode={isGMMode}
                />
                
                <AttributeTracker
                  label="Interest"
                  value={interestPoints}
                  icon={<InterestIcon />}
                  onIncrement={() => adjustInterest(1)}
                  onDecrement={() => adjustInterest(-1)}
                  isGmMode={isGMMode}
                />
                
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
                <div className="message-header">
                  <h3>{message.role === 'user' ? 'You' : npcContext.name} says:</h3>
                  {message.role === 'assistant' && (
                    <button 
                      className="speak-message-button"
                      onClick={() => speakText(message.content)}
                      disabled={isSpeaking}
                      title="Play speech"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                    </button>
                  )}
                </div>
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
