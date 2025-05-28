import React, { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import './App.css';
import AttitudeSelector from './components/AttitudeSelector';

// Suppress Chrome extension errors
window.addEventListener('error', (event) => {
  if (event.message.includes('Receiving end does not exist')) {
    event.preventDefault(); // Prevent the error from appearing in console
    return false;
  }
}, true);

// Get backend port from environment variable or default to 3000
const BACKEND_PORT = process.env.REACT_APP_BACKEND_PORT || '3000';

// Use environment variable to control backend URL, default to deployed
const BACKEND_URL = process.env.REACT_APP_USE_LOCAL_BACKEND === 'true'
  ? `http://${window.location.hostname}:${BACKEND_PORT}`  // Use the server's IP address
  : 'https://drivemychar.onrender.com';  // Deployed backend URL

// Add a unique client ID to identify this instance in logs
const CLIENT_ID = `client_${Math.random().toString(36).substring(2, 9)}`;

// Add a console log to help debug the URL being used
console.log('[CONFIG] Frontend running on:', window.location.origin);
console.log('[CONFIG] Backend port:', BACKEND_PORT);
console.log('[CONFIG] Using backend URL:', BACKEND_URL);
console.log('[CONFIG] Client ID:', CLIENT_ID);

// Helper function to get color based on value
function getAttributeColor(value) {
  if (value > 3) return '#4CAF50'; // Green
  if (value > 2) return '#FFC107'; // Yellow
  if (value > 1) return '#FF9800'; // Orange
  return '#F44336'; // Red
}

// Move icon components outside App and optimize them with React.memo
const PatienceIcon = React.memo(() => {
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
});
PatienceIcon.displayName = 'PatienceIcon';

const InterestIcon = React.memo(() => {
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
});
InterestIcon.displayName = 'InterestIcon';

// Generic AttributePoints component to replace both PatiencePoints and InterestPoints
const AttributePoints = React.memo(({ points, maxPoints = 5, activeColor = '#4CAF50', className = 'patience-points' }) => {
  // Determine color based on total points
  let color = activeColor; 
  if (points <= 1) color = '#F44336'; // Red
  else if (points <= 2) color = '#FF9800'; // Orange
  else if (points <= 3) color = '#FFC107'; // Yellow
  
  // Force points to be a number between 0-5
  const safePoints = Math.max(0, Math.min(5, Number(points) || 0));
  
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
});
AttributePoints.displayName = 'AttributePoints';

// Use AttributePoints for both patience and interest
const PatiencePoints = React.memo((props) => <AttributePoints {...props} className="patience-points" activeColor="#4CAF50" />);
PatiencePoints.displayName = 'PatiencePoints';

const InterestPoints = React.memo((props) => {
  const [isCelebrating, setIsCelebrating] = useState(false);

  // Add to component's scope
  useEffect(() => {
    if (isCelebrating) {
      const timer = setTimeout(() => setIsCelebrating(false), 600); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isCelebrating]);

  return (
    <AttributePoints 
      {...props} 
      className={`interest-points ${isCelebrating ? 'celebrating' : ''}`} 
      activeColor="#FFD700" 
    />
  );
});
InterestPoints.displayName = 'InterestPoints';

// Generic AttributeTracker component
const AttributeTracker = React.memo(({ label, value, icon, onIncrement, onDecrement, isGmMode }) => {
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
});
AttributeTracker.displayName = 'AttributeTracker';

// Create memoized icon instances to prevent recreation
const PATIENCE_ICON = <PatienceIcon />;
const INTEREST_ICON = <InterestIcon />;

function App() {
  // State declarations
  const [npcs, setNpcs] = useState([]);
  const [selectedNpc, setSelectedNpc] = useState(null);
  const [playerInput, setPlayerInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [npcImage, setNpcImage] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [isGMMode, setIsGMMode] = useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [showProgress, setShowProgress] = useState(false);
  // These states are used in the InterestPoints component and image generation
  // eslint-disable-next-line no-unused-vars
  const [isCelebrating, setIsCelebrating] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [retryAfter, setRetryAfter] = useState(null);
  
  // Refs
  const conversationHistories = useRef({});
  const sseSourceRef = useRef(null);
  const loadedNpcs = useRef(new Set());
  const autoSubmitTimeout = useRef(null);
  const inputRef = useRef(null);
  const conversationRef = useRef(null);
  const audioCache = useRef({});
  
  // NPC state
  const [npcContext, setNpcContext] = useState({
    id: '',
    name: '',
    description: '',
    personality: '',
    currentScene: '',
    whatTheyKnow: [],
    pitfalls: [],
    motivations: []
  });
  const [selectedNpcId, setSelectedNpcId] = useState('');
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [patiencePoints, setPatiencePoints] = useState(5);
  const [interestPoints, setInterestPoints] = useState(3);
  const [currentAttitude, setCurrentAttitude] = useState('neutral');

  // Define speakText first since it's used in handleSubmit
  const speakText = useCallback(async (text, npcId = null) => {
    if (!isSpeechEnabled) return;
    
    try {
      setIsSpeaking(true);
      const currentNpcId = npcId || npcContext.id || 'eldrin';
      
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
      audioCache.current[cacheKey] = audioUrl;
      
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setIsSpeaking(false);
      };

      await audio.play();
    } catch (error) {
      console.error('Error speaking text:', error);
      setIsSpeaking(false);
    }
  }, [isSpeechEnabled, npcContext.id]);

  // Define handleSubmit before it's used in any hooks
  const handleSubmit = useCallback(async (e) => {
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

      setConversationHistory(data.conversationHistory);
      conversationHistories.current[selectedNpc.id] = data.conversationHistory;
      
      setPlayerInput('');
      
      if (data.response && isSpeechEnabled) {
        speakText(data.response);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [playerInput, selectedNpc, conversationHistory, isSpeechEnabled, speakText]);

  // Input handlers
  const handleInputFocus = useCallback(() => {
    if (autoSubmitTimeout.current) {
      clearTimeout(autoSubmitTimeout.current);
      setShowProgress(false);
    }
  }, []);

  // Speech recognition handlers
  const startListening = useCallback(() => {
    if (recognition) {
      try {
        recognition.start();
        console.log('Starting speech recognition');
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        if (error.name === 'InvalidStateError') {
          recognition.stop();
          setTimeout(() => recognition.start(), 100);
        }
      }
    } else {
      console.log('Speech recognition not available');
      alert('Speech recognition is not supported in your browser.');
    }
  }, [recognition]);

  const stopListening = useCallback(() => {
    if (recognition) {
      recognition.stop();
      console.log('Stopping speech recognition');
    }
  }, [recognition]);

  // Now you can use handleSubmit in your useEffect hooks
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
        setShowProgress(false);
      };

      recognition.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
      };

      recognition.onresult = (event) => {
        console.log('Speech recognition result received');
        const transcript = event.results[0][0].transcript;
        setPlayerInput(transcript);
        
        if (autoSubmitTimeout.current) {
          clearTimeout(autoSubmitTimeout.current);
        }

        setShowProgress(true);
        autoSubmitTimeout.current = setTimeout(() => {
          console.log('Auto-submitting transcript:', transcript);
          setShowProgress(false);
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
      setIsSpeechEnabled(false);
    }

    return () => {
      if (autoSubmitTimeout.current) {
        clearTimeout(autoSubmitTimeout.current);
      }
    };
  }, [handleSubmit]);

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

  // Function to set up SSE event listeners
  const setupSSEListeners = useCallback((eventSource) => {
    console.log('[SSE] Setting up event listeners');
    
    // Add generic message handler to catch ALL events
    eventSource.onmessage = (event) => {
      console.log('[SSE] Generic onmessage received:', {
        type: event.type,
        data: event.data,
        lastEventId: event.lastEventId,
        origin: event.origin
      });
      
      // Try to parse and log the data
      try {
        const parsed = JSON.parse(event.data);
        console.log('[SSE] Parsed generic message data:', parsed);
      } catch (e) {
        console.log('[SSE] Non-JSON generic message data:', event.data);
      }
    };
    
    eventSource.addEventListener('connected', (event) => {
      console.log('[SSE] Connected event received:', event.data);
    });

    eventSource.addEventListener('attributeUpdate', (event) => {
      try {
        console.log('[SSE] attributeUpdate event received:', event);
        const data = JSON.parse(event.data);
        console.log('[SSE] Parsed attributeUpdate data:', data);
        
        // Batch state updates using React.startTransition for better performance
        startTransition(() => {
          if (data.type === 'interest') {
            console.log('[STATE] Interest update received:', data);
            setInterestPoints(prevPoints => {
              const newPoints = data.value;
              console.log('[STATE] Updating interest points:', {
                previous: prevPoints,
                new: newPoints,
                npcId: selectedNpcId
              });
              // If interest increased, trigger celebration
              if (newPoints > prevPoints) {
                console.log('[ANIMATION] Triggering interest celebration');
                setIsCelebrating(true);
              }
              return newPoints;
            });
          } else if (data.type === 'patience') {
            setPatiencePoints(prevPoints => {
              const newPoints = data.value;
              console.log('[STATE] Updating patience points:', {
                previous: prevPoints,
                new: newPoints,
                npcId: selectedNpcId
              });
              return newPoints;
            });
          }
        });
      } catch (error) {
        console.error('[SSE] Error processing attributeUpdate:', error);
      }
    });

    eventSource.addEventListener('sound', (event) => {
      try {
        console.log('[SSE] sound event received:', event);
        const data = JSON.parse(event.data);
        console.log('[SSE] Parsed sound data:', data);
        if (data.effect) {
          const soundUrl = `${window.location.origin}/sounds/${data.effect}.mp3`;
          console.log('[SOUND] Attempting to play sound from:', soundUrl);
          
          const audio = new Audio(soundUrl);
          audio.volume = 0.5;
          
          audio.addEventListener('canplaythrough', () => {
            console.log('[SOUND] Audio loaded, attempting to play');
            audio.play()
              .then(() => console.log('[SOUND] Audio playing successfully'))
              .catch(err => {
                console.error('[SOUND] Error playing audio:', err);
                // Try playing again with user interaction
                const playOnClick = () => {
                  audio.play()
                    .then(() => {
                      console.log('[SOUND] Audio played after user interaction');
                      document.removeEventListener('click', playOnClick);
                    })
                    .catch(err => console.error('[SOUND] Error playing audio after user interaction:', err));
                };
                document.addEventListener('click', playOnClick, { once: true });
              });
          });
          
          audio.addEventListener('error', (err) => {
            console.error('[SOUND] Audio loading error:', err, 'URL was:', soundUrl);
          });
          
          audio.load();
        }
      } catch (error) {
        console.error('[SSE] Error processing sound event:', error);
      }
    });

    eventSource.addEventListener('update', (event) => {
      try {
        console.log('[SSE] Received update event:', event);
        const data = JSON.parse(event.data);
        console.log('[SSE] Parsed update data:', data);
        
        // Batch all state updates together for better performance
        startTransition(() => {
          if (data.session) {
            if (data.session.interest !== undefined) {
              setInterestPoints(currentInterest => {
                if (currentInterest !== data.session.interest) {
                  console.log('[STATE] Interest update from session:', {
                    previous: currentInterest,
                    new: data.session.interest,
                    npcId: selectedNpcId
                  });
                }
                return data.session.interest;
              });
            }
            if (data.session.patience !== undefined) {
              setPatiencePoints(currentPatience => {
                if (currentPatience !== data.session.patience) {
                  console.log('[STATE] Patience update from session:', {
                    previous: currentPatience,
                    new: data.session.patience,
                    npcId: selectedNpcId
                  });
                }
                return data.session.patience;
              });
            }
          }
          
          if (data.conversationHistory) {
            setConversationHistory(prevHistory => {
              if (prevHistory.length !== data.conversationHistory.length) {
                console.log('[STATE] Updating conversation history:', {
                  messageCount: data.conversationHistory.length,
                  npcId: selectedNpcId
                });
                conversationHistories.current[selectedNpcId] = data.conversationHistory;
              }
              return data.conversationHistory;
            });
          }
        });
      } catch (error) {
        console.error('[SSE] Error processing update event:', error);
      }
    });

    // Debug event stream state changes
    eventSource.addEventListener('open', (event) => {
      console.log('[SSE] Connection opened:', event);
    });

    eventSource.addEventListener('error', (event) => {
      console.error('[SSE] Error event received:', event);
    });
  }, [selectedNpcId]);

  // Setup SSE connection when NPC is selected
  useEffect(() => {
    if (!selectedNpcId) return;
    
    console.log(`[SSE] Setting up connection for NPC ${selectedNpcId}`);
    
    // Close any existing SSE connection
    if (sseSourceRef.current) {
      console.log('[SSE] Closing previous connection');
      sseSourceRef.current.close();
      sseSourceRef.current = null;
    }
    
    // Create a new SSE connection with error handling
    const connectSSE = () => {
      try {
        const eventSource = new EventSource(`${BACKEND_URL}/sse/conversation/${selectedNpcId}?client=${CLIENT_ID}`);
        console.log(`[SSE] Created new EventSource for ${selectedNpcId}`);
        sseSourceRef.current = eventSource;
        
        // Set up all event listeners
        setupSSEListeners(eventSource);
        
        // Add specific error handling
        eventSource.onerror = (error) => {
          console.warn('[SSE] Error event:', error);
          
          // Ignore Chrome extension errors
          if (error.message?.includes('Receiving end does not exist')) {
            return;
          }
          
          // Handle disconnection
          if (eventSource.readyState === EventSource.CLOSED) {
            console.log('[SSE] Connection closed, attempting to reconnect...');
            setTimeout(connectSSE, 1000); // Reconnect after 1 second
          }
        };
      } catch (error) {
        console.error('[SSE] Setup error:', error);
        // Attempt to reconnect on setup error
        setTimeout(connectSSE, 1000);
      }
    };
    
    // Initial connection
    connectSSE();
    
    // Cleanup on unmount or when NPC changes
    return () => {
      console.log('[SSE] Cleaning up connection for', selectedNpcId);
      if (sseSourceRef.current) {
        sseSourceRef.current.close();
        sseSourceRef.current = null;
      }
    };
  }, [selectedNpcId, setupSSEListeners]);

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
        
        // Set attitude and attributes from session if available
        if (data.session) {
          if (data.session.attitude) {
            setCurrentAttitude(data.session.attitude);
          }
          if (data.session.patience !== undefined) {
            setPatiencePoints(data.session.patience);
          }
          if (data.session.interest !== undefined) {
            setInterestPoints(data.session.interest);
          }
        }
        
        // Use server-side conversation history if available
        if (data.conversationHistory && data.conversationHistory.length > 0) {
          console.log('Using server-side conversation history');
          setConversationHistory(data.conversationHistory);
          conversationHistories.current[selectedNpcId] = data.conversationHistory;
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
        
        // Handle image URL - check if it's already a full URL (Cloudinary)
        let imageUrl;
        if (data.localImagePath && data.localImagePath.startsWith('http')) {
          // Already a full URL (Cloudinary), use as-is
          imageUrl = data.localImagePath;
        } else if (data.localImagePath) {
          // Local path, prepend backend URL
          imageUrl = `${BACKEND_URL}${data.localImagePath}`;
        } else if (data.imageUrl) {
          // Use imageUrl as fallback
          imageUrl = data.imageUrl;
        }
        
        if (imageUrl) {
          // Force cache invalidation with timestamp
          const success = await loadAndSetImage(`${imageUrl}?t=${new Date().getTime()}`);
          if (!success) {
            setImageError('Generated image is not available');
          }
        } else {
          setImageError('No image URL returned from server');
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
  }, [selectedNpcId]); // Dependencies

  const handleContextChange = (e) => {
    const { name, value } = e.target;
    setNpcContext(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleContextSubmit = async (e) => {
    e.preventDefault();
    if (!selectedNpc) return;
    
    setIsLoadingContext(true);
    try {
      const response = await fetch(`${BACKEND_URL}/context/${selectedNpc.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(npcContext)
      });

      if (!response.ok) {
        throw new Error('Failed to update NPC context');
      }

      const data = await response.json();
      setNpcContext(data);
      setSelectedNpc(data);
    } catch (error) {
      console.error('Error updating NPC context:', error);
      setError('Failed to update NPC context');
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
      
      // Handle image URL - check if it's already a full URL (Cloudinary)
      let imageUrl;
      if (data.localImagePath && data.localImagePath.startsWith('http')) {
        // Already a full URL (Cloudinary), use as-is
        imageUrl = data.localImagePath;
      } else if (data.localImagePath) {
        // Local path, prepend backend URL
        imageUrl = `${BACKEND_URL}${data.localImagePath}`;
      } else if (data.imageUrl) {
        // Use imageUrl as fallback
        imageUrl = data.imageUrl;
      }
      
      if (imageUrl) {
        // Force cache invalidation with timestamp
        const success = await loadAndSetImage(`${imageUrl}?t=${new Date().getTime()}`);
        if (!success) {
          setImageError('Generated image is not available');
        }
      } else {
        setImageError('No image URL returned from server');
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

  // Add handler for attitude changes
  const handleAttitudeChange = async (newAttitude) => {
    if (!selectedNpc) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/npc/${selectedNpc.id}/attitude`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attitude: newAttitude })
      });

      if (!response.ok) {
        throw new Error('Failed to update attitude');
      }

      const data = await response.json();
      setCurrentAttitude(data.attitude);
      setPatiencePoints(data.patience);
      setInterestPoints(data.interest);
    } catch (error) {
      console.error('Error updating attitude:', error);
      setError('Failed to update NPC attitude');
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

  return (
    <div className="App">
      <header className="App-header">
        <h1>DriveMyChar</h1>
        {error && (
          <div className="error-message" style={{ 
            color: 'red', 
            padding: '10px', 
            margin: '10px 0',
            backgroundColor: 'rgba(255,0,0,0.1)',
            borderRadius: '4px'
          }}>
            Error: {error}
          </div>
        )}
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
                  {npcImage ? (
                    <>
                      <img
                        className="npc-image"
                        src={npcImage}
                        alt={selectedNpc.name}
                        onClick={() => setShowImageModal(true)}
                      />
                      {isGMMode && (
                        <button
                          className="generate-image-button"
                          onClick={generateNpcImage}
                          disabled={isGenerating}
                        >
                          {isGenerating ? 'Generating...' : 'Generate Image'}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="no-image-container">
                      <div className="no-image-placeholder">No image available</div>
                      {isGMMode && (
                        <button
                          className="generate-image-button standalone"
                          onClick={generateNpcImage}
                          disabled={isGenerating}
                        >
                          {isGenerating ? 'Generating...' : 'Generate Image'}
                        </button>
                      )}
                    </div>
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
                  icon={PATIENCE_ICON}
                  onIncrement={() => adjustPatience(1)}
                  onDecrement={() => adjustPatience(-1)}
                  isGmMode={isGMMode}
                />
                
                <AttributeTracker
                  label="Interest"
                  value={interestPoints}
                  icon={INTEREST_ICON}
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
                  icon={PATIENCE_ICON}
                  onIncrement={() => adjustPatience(1)}
                  onDecrement={() => adjustPatience(-1)}
                  isGmMode={isGMMode}
                />
                
                <AttributeTracker
                  label="Interest"
                  value={interestPoints}
                  icon={INTEREST_ICON}
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
              <label>What They Know:</label>
              <textarea
                name="whatTheyKnow"
                value={npcContext.whatTheyKnow.join('\n')}
                onChange={(e) => handleContextChange({
                  target: {
                    name: 'whatTheyKnow',
                    value: e.target.value.split('\n').filter(line => line.trim())
                  }
                })}
                placeholder="Enter each piece of knowledge on a new line"
              />
            </div>
            <div className="form-group">
              <label>Pitfalls:</label>
              <textarea
                name="pitfalls"
                value={npcContext.pitfalls.join('\n')}
                onChange={(e) => handleContextChange({
                  target: {
                    name: 'pitfalls',
                    value: e.target.value.split('\n').filter(line => line.trim())
                  }
                })}
                placeholder="Enter each pitfall on a new line"
              />
            </div>
            <div className="form-group">
              <label>Motivations:</label>
              <textarea
                name="motivations"
                value={npcContext.motivations.join('\n')}
                onChange={(e) => handleContextChange({
                  target: {
                    name: 'motivations',
                    value: e.target.value.split('\n').filter(line => line.trim())
                  }
                })}
                placeholder="Enter each motivation on a new line"
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
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send'}
            </button>
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

      {/* Add AttitudeSelector before the existing interface */}
      <AttitudeSelector
        currentAttitude={currentAttitude}
        onAttitudeChange={handleAttitudeChange}
        isGMMode={isGMMode}
      />
    </div>
  );
}

export default App;
