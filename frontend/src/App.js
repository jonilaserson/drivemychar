import React, { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate, useLocation } from 'react-router-dom';
import './App.css';
import AttitudeSelector from './components/AttitudeSelector';

// Suppress Chrome extension errors
window.addEventListener('error', (event) => {
  if (event.message.includes('Receiving end does not exist')) {
    event.preventDefault();
    return false;
  }
}, true);

// Configuration
const BACKEND_PORT = process.env.REACT_APP_BACKEND_PORT || '3000';
const BACKEND_URL = process.env.REACT_APP_USE_LOCAL_BACKEND === 'true'
  ? `http://${window.location.hostname}:${BACKEND_PORT}`
  : 'https://drivemychar.onrender.com';
const CLIENT_ID = `client_${Math.random().toString(36).substring(2, 9)}`;

console.log('[CONFIG] Backend URL:', BACKEND_URL, 'Client ID:', CLIENT_ID);

// Utility functions
function getAttributeColor(value) {
  if (value > 3) return '#4CAF50';
  if (value > 2) return '#FFC107';
  if (value > 1) return '#FF9800';
  return '#F44336';
}

// Optimized icon components
const PatienceIcon = React.memo(() => (
  <img 
    src="/images/patience-icon.png" 
    alt="Patience" 
    className="patience-icon-img"
    style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
  />
));

const InterestIcon = React.memo(() => (
  <img 
    src="/images/interest-icon.png" 
    alt="Interest" 
    className="interest-icon-img"
    style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
  />
));

// Generic attribute components
const AttributePoints = React.memo(({ points, maxPoints = 5, activeColor = '#4CAF50', className = 'patience-points' }) => {
  let color = activeColor;
  if (points <= 1) color = '#F44336';
  else if (points <= 2) color = '#FF9800';
  else if (points <= 3) color = '#FFC107';
  
  const safePoints = Math.max(0, Math.min(5, Number(points) || 0));
  
  return (
    <div className={className}>
      {Array.from({ length: maxPoints }, (_, i) => {
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

// Character selector component
const CharacterSelector = React.memo(({ npcs, selectedNpcId, onCharacterChange }) => (
  <div className="character-selector-container">
    <select 
      value={selectedNpcId} 
      onChange={(e) => onCharacterChange(e.target.value)}
      className="npc-selector">
      <option value="">Select a character...</option>
      {npcs.map(npc => (
        <option key={npc.id} value={npc.id}>{npc.name}</option>
      ))}
    </select>
  </div>
));

// Main app content component
function AppContent({ preSelectedNpcId = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Core state
  const [npcs, setNpcs] = useState([]);
  const [selectedNpc, setSelectedNpc] = useState(null);
  const [selectedNpcId, setSelectedNpcId] = useState(preSelectedNpcId || '');
  const [conversationHistory, setConversationHistory] = useState([]);
  const [playerInput, setPlayerInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // UI state
  const [npcImage, setNpcImage] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [isGMMode, setIsGMMode] = useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [patiencePoints, setPatiencePoints] = useState(5);
  const [interestPoints, setInterestPoints] = useState(3);
  const [currentAttitude, setCurrentAttitude] = useState('neutral');
  
  // Context state
  const [npcContext, setNpcContext] = useState({
    id: '', name: '', description: '', personality: '', currentScene: '',
    whatTheyKnow: [], pitfalls: [], motivations: []
  });
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  
  // Refs
  const conversationHistories = useRef({});
  const sseSourceRef = useRef(null);
  const loadedNpcs = useRef(new Set());
  const autoSubmitTimeout = useRef(null);
  const inputRef = useRef(null);
  const conversationRef = useRef(null);
  const audioCache = useRef({});
  const [recognition, setRecognition] = useState(null);

  // Character management
  const handleCharacterChange = useCallback((newNpcId) => {
    setSelectedNpcId(newNpcId);
    if (newNpcId) {
      navigate(`/character/${newNpcId}`);
    } else {
      navigate('/');
    }
  }, [navigate]);

  // Speech functionality
  const speakText = useCallback(async (text, npcId = null) => {
    if (!isSpeechEnabled) return;
    
    try {
      setIsSpeaking(true);
      const currentNpcId = npcId || npcContext.id || 'eldrin';
      const cacheKey = `${currentNpcId}:${text}`;
      
      if (audioCache.current[cacheKey]) {
        const audio = new Audio(audioCache.current[cacheKey]);
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => setIsSpeaking(false);
        await audio.play();
        return;
      }

      const response = await fetch(`${BACKEND_URL}/speak/${currentNpcId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) throw new Error('Failed to generate speech');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      audioCache.current[cacheKey] = audioUrl;
      
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      await audio.play();
    } catch (error) {
      console.error('Error speaking text:', error);
      setIsSpeaking(false);
    }
  }, [isSpeechEnabled, npcContext.id]);

  // Chat functionality
  const handleSubmit = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!playerInput.trim() || !selectedNpc) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/chat/${selectedNpc.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: playerInput.trim(),
          conversationHistory,
          clientId: CLIENT_ID
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

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

  // Load NPCs on mount
  useEffect(() => {
    if (npcs.length > 0) return;
    
    const loadNpcs = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/npcs`);
        const data = await response.json();
        setNpcs(data);
        if (data.length > 0 && !preSelectedNpcId) {
          setSelectedNpcId(data[0].id);
        }
      } catch (err) {
        setError('Failed to load NPCs');
      }
    };
    loadNpcs();
  }, [npcs.length, preSelectedNpcId]);

  // Handle URL changes
  useEffect(() => {
    if (preSelectedNpcId) {
      setSelectedNpcId(preSelectedNpcId);
    }
  }, [preSelectedNpcId]);

  // Load NPC context when selection changes
  useEffect(() => {
    if (!selectedNpcId) return;
    
    const loadSelectedNpc = async () => {
      try {
        setIsLoadingContext(true);
        setIsLoadingImage(true);
        
        const response = await fetch(`${BACKEND_URL}/context/${selectedNpcId}`);
        const data = await response.json();
        
        setSelectedNpc(data);
        setNpcContext(data);
        
        // Set session data
        if (data.session) {
          if (data.session.attitude) setCurrentAttitude(data.session.attitude);
          if (data.session.patience !== undefined) setPatiencePoints(data.session.patience);
          if (data.session.interest !== undefined) setInterestPoints(data.session.interest);
        }
        
        // Handle conversation history
        if (data.conversationHistory?.length > 0) {
          setConversationHistory(data.conversationHistory);
          conversationHistories.current[selectedNpcId] = data.conversationHistory;
        } else {
          if (!loadedNpcs.current.has(selectedNpcId)) {
            conversationHistories.current[selectedNpcId] = [];
            loadedNpcs.current.add(selectedNpcId);
          }
          setConversationHistory(conversationHistories.current[selectedNpcId] || []);
        }
        
        // Handle image
        setNpcImage(null);
        setImageError(null);
        
        let imageUrl;
        if (data.localImagePath?.startsWith('http')) {
          imageUrl = data.localImagePath;
        } else if (data.localImagePath) {
          imageUrl = `${BACKEND_URL}${data.localImagePath}`;
        } else if (data.imageUrl) {
          imageUrl = data.imageUrl;
        }
        
        if (imageUrl) {
          const img = new Image();
          img.src = `${imageUrl}?t=${new Date().getTime()}`;
          img.onload = () => {
            setNpcImage(img.src);
            setImageError(null);
          };
          img.onerror = () => setImageError('Image not available');
        } else {
          setImageError('No image available');
        }
        
      } catch (err) {
        console.error('Error loading NPC context:', err);
        setError('Failed to load NPC context');
      } finally {
        setIsLoadingContext(false);
        setIsLoadingImage(false);
      }
    };

    loadSelectedNpc();
  }, [selectedNpcId]);

  // Attribute adjustment functions
  const adjustAttribute = useCallback((type, adjustment) => {
    if (!selectedNpc) return;
    
    const currentValue = type === 'patience' ? patiencePoints : interestPoints;
    const setter = type === 'patience' ? setPatiencePoints : setInterestPoints;
    const newValue = Math.max(0, Math.min(5, currentValue + adjustment));
    
    setter(newValue);
    
    fetch(`${BACKEND_URL}/api/npc/${selectedNpc.id}/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adjustment })
    }).then(response => {
      if (response.ok) return response.json();
      throw new Error(`Error adjusting ${type}`);
    }).then(data => {
      if (data[type] !== undefined) setter(data[type]);
    }).catch(error => {
      console.error(`Error adjusting ${type}:`, error);
      setter(currentValue);
    });
  }, [selectedNpc, patiencePoints, interestPoints]);

  // Clear conversation history
  const handleClearHistory = useCallback(async () => {
    if (!selectedNpc) return;
    
    try {
      if (sseSourceRef.current) {
        sseSourceRef.current.close();
        sseSourceRef.current = null;
      }
      
      setConversationHistory([]);
      conversationHistories.current[selectedNpc.id] = [];
      
      await fetch(`${BACKEND_URL}/clear-history/${selectedNpc.id}?client=${CLIENT_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      console.error('Error clearing conversation history:', err);
      setError('Failed to clear conversation history');
    }
  }, [selectedNpc]);

  // Speech recognition setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setPlayerInput(transcript);
      
      if (autoSubmitTimeout.current) clearTimeout(autoSubmitTimeout.current);
      setShowProgress(true);
      autoSubmitTimeout.current = setTimeout(() => {
        setShowProgress(false);
        handleSubmit({ preventDefault: () => {} });
      }, 3000);
    };

    setRecognition(recognition);

    return () => {
      if (autoSubmitTimeout.current) clearTimeout(autoSubmitTimeout.current);
    };
  }, [handleSubmit]);

  // Scroll conversation to bottom
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [conversationHistory]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Drive My Char</h1>
        {error && (
          <div className="error-message" style={{ 
            color: 'red', padding: '10px', margin: '10px 0',
            backgroundColor: 'rgba(255,0,0,0.1)', borderRadius: '4px'
          }}>
            Error: {error}
          </div>
        )}
        
        <div className="header-controls">
          <CharacterSelector
            npcs={npcs}
            selectedNpcId={selectedNpcId}
            onCharacterChange={handleCharacterChange}
          />
          
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
                          onClick={async () => {
                            if (!selectedNpc) return;
                            
                            try {
                              setIsGenerating(true);
                              const response = await fetch(`${BACKEND_URL}/generate-image/${selectedNpc.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' }
                              });
                              
                              const data = await response.json();
                              if (data.imageUrl) {
                                setNpcImage(data.imageUrl);
                                setImageError(null);
                              } else {
                                throw new Error(data.error || 'Failed to generate image');
                              }
                            } catch (error) {
                              console.error('Error generating image:', error);
                              setImageError('Failed to generate image');
                            } finally {
                              setIsGenerating(false);
                            }
                          }}
                          disabled={isGenerating}
                        >
                          {isGenerating ? 'Generating...' : 'Generate Image'}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="no-image-container">
                      <div className="no-image-placeholder">No image available</div>
                      {imageError && <div className="image-error">{imageError}</div>}
                      {isGMMode && (
                        <button
                          className="generate-image-button standalone"
                          onClick={async () => {
                            if (!selectedNpc) return;
                            
                            try {
                              setIsGenerating(true);
                              const response = await fetch(`${BACKEND_URL}/generate-image/${selectedNpc.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' }
                              });
                              
                              const data = await response.json();
                              if (data.imageUrl) {
                                setNpcImage(data.imageUrl);
                                setImageError(null);
                              } else {
                                throw new Error(data.error || 'Failed to generate image');
                              }
                            } catch (error) {
                              console.error('Error generating image:', error);
                              setImageError('Failed to generate image');
                            } finally {
                              setIsGenerating(false);
                            }
                          }}
                          disabled={isGenerating}
                        >
                          {isGenerating ? 'Generating...' : 'Generate Image'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className={isGMMode ? "npc-info" : "player-npc-name"}>
              <h2 className="npc-name">{selectedNpc.name}</h2>
              
              <AttributeTracker
                label="Patience"
                value={patiencePoints}
                icon={<PatienceIcon />}
                onIncrement={() => adjustAttribute('patience', 1)}
                onDecrement={() => adjustAttribute('patience', -1)}
                isGmMode={isGMMode}
              />
              
              <AttributeTracker
                label="Interest"
                value={interestPoints}
                icon={<InterestIcon />}
                onIncrement={() => adjustAttribute('interest', 1)}
                onDecrement={() => adjustAttribute('interest', -1)}
                isGmMode={isGMMode}
              />
              
              {isGMMode && (
                <>
                  <p className="npc-description">{selectedNpc.description}</p>
                  <p className="npc-personality"><strong>Personality:</strong> {selectedNpc.personality}</p>
                  <p className="npc-scene"><strong>Current Scene:</strong> {selectedNpc.currentScene}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && npcImage && (
        <div className="modal-overlay" onClick={() => setShowImageModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setShowImageModal(false)}>×</button>
            <img className="modal-image" src={npcImage} alt={selectedNpc?.name || 'NPC'} />
          </div>
        </div>
      )}

      {/* Main Interface */}
      {isGMMode ? (
        <div className="gm-interface">
          <h2>Game Master Interface</h2>
          
          {selectedNpc && (
            <div className="context-form">
              <div className="form-group">
                <label htmlFor="npc-name">Name:</label>
                <input
                  id="npc-name"
                  type="text"
                  value={npcContext.name}
                  onChange={(e) => setNpcContext({...npcContext, name: e.target.value})}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="npc-description">Description:</label>
                <textarea
                  id="npc-description"
                  value={npcContext.description}
                  onChange={(e) => setNpcContext({...npcContext, description: e.target.value})}
                  rows="3"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="npc-personality">Personality:</label>
                <textarea
                  id="npc-personality"
                  value={npcContext.personality}
                  onChange={(e) => setNpcContext({...npcContext, personality: e.target.value})}
                  rows="3"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="npc-scene">Current Scene:</label>
                <textarea
                  id="npc-scene"
                  value={npcContext.currentScene}
                  onChange={(e) => setNpcContext({...npcContext, currentScene: e.target.value})}
                  rows="2"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="npc-knowledge">What They Know (one per line):</label>
                <textarea
                  id="npc-knowledge"
                  value={Array.isArray(npcContext.whatTheyKnow) ? npcContext.whatTheyKnow.join('\n') : ''}
                  onChange={(e) => setNpcContext({
                    ...npcContext, 
                    whatTheyKnow: e.target.value.split('\n').filter(item => item.trim())
                  })}
                  rows="4"
                  placeholder="Enter knowledge items, one per line"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="npc-pitfalls">Pitfalls (one per line):</label>
                <textarea
                  id="npc-pitfalls"
                  value={Array.isArray(npcContext.pitfalls) ? npcContext.pitfalls.join('\n') : ''}
                  onChange={(e) => setNpcContext({
                    ...npcContext, 
                    pitfalls: e.target.value.split('\n').filter(item => item.trim())
                  })}
                  rows="3"
                  placeholder="Enter pitfalls, one per line"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="npc-motivations">Motivations (one per line):</label>
                <textarea
                  id="npc-motivations"
                  value={Array.isArray(npcContext.motivations) ? npcContext.motivations.join('\n') : ''}
                  onChange={(e) => setNpcContext({
                    ...npcContext, 
                    motivations: e.target.value.split('\n').filter(item => item.trim())
                  })}
                  rows="3"
                  placeholder="Enter motivations, one per line"
                />
              </div>
              
              <div className="form-actions">
                <button 
                  type="button" 
                  onClick={async () => {
                    try {
                      const response = await fetch(`${BACKEND_URL}/context/${selectedNpc.id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(npcContext)
                      });
                      
                      if (response.ok) {
                        alert('NPC context updated successfully!');
                      } else {
                        throw new Error('Failed to update context');
                      }
                    } catch (error) {
                      console.error('Error updating context:', error);
                      alert('Error updating NPC context');
                    }
                  }}
                  disabled={isLoadingContext}
                >
                  {isLoadingContext ? 'Updating...' : 'Update NPC Context'}
                </button>
                
                <button 
                  type="button" 
                  onClick={async () => {
                    if (!selectedNpc) return;
                    
                    try {
                      setIsGenerating(true);
                      const response = await fetch(`${BACKEND_URL}/generate-image/${selectedNpc.id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      });
                      
                      const data = await response.json();
                      if (data.imageUrl) {
                        setNpcImage(data.imageUrl);
                        setImageError(null);
                        alert('Image generated successfully!');
                      } else {
                        throw new Error(data.error || 'Failed to generate image');
                      }
                    } catch (error) {
                      console.error('Error generating image:', error);
                      setImageError('Failed to generate image');
                      alert('Error generating image: ' + error.message);
                    } finally {
                      setIsGenerating(false);
                    }
                  }}
                  disabled={isGenerating}
                >
                  {isGenerating ? 'Generating...' : 'Generate New Image'}
                </button>
                
                <button type="button" onClick={handleClearHistory}>
                  Clear Conversation History
                </button>
              </div>
            </div>
          )}
          
          {!selectedNpc && (
            <p>Select an NPC to edit their context and manage the conversation.</p>
          )}
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
                placeholder="Speak to the NPC..."
              />
              {showProgress && <div className="auto-submit-progress" />}
            </div>
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send'}
            </button>
            {recognition && (
              <button 
                type="button" 
                className={`voice-input-button ${isListening ? 'listening' : ''}`}
                onClick={isListening ? () => recognition.stop() : () => recognition.start()}
                disabled={!recognition}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </button>
            )}
          </form>
        </div>
      )}

      <AttitudeSelector
        currentAttitude={currentAttitude}
        onAttitudeChange={() => {/* Attitude change logic */}}
        isGMMode={isGMMode}
      />
    </div>
  );
}

// Character page component for direct URLs
function CharacterPage() {
  const { npcId } = useParams();
  const navigate = useNavigate();
  const [characterExists, setCharacterExists] = useState(null);
  
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/character/${npcId}/info`)
      .then(response => {
        if (response.ok) {
          setCharacterExists(true);
        } else {
          setCharacterExists(false);
        }
      })
      .catch(() => setCharacterExists(false));
  }, [npcId]);
  
  if (characterExists === null) {
    return <div className="loading">Loading character...</div>;
  }
  
  if (characterExists === false) {
    return (
      <div className="character-not-found">
        <h2>Character Not Found</h2>
        <p>The character "{npcId}" does not exist.</p>
        <button onClick={() => navigate('/')}>Go to Character Selection</button>
      </div>
    );
  }
  
  return <AppContent preSelectedNpcId={npcId} />;
}

// Main App component with routing
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="/character/:npcId" element={<CharacterPage />} />
      </Routes>
    </Router>
  );
}

export default App;
