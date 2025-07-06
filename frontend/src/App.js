import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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

// Move fetchWithAuth to top level
function fetchWithAuth(url, options = {}, authToken) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return fetch(url, { ...options, headers });
}

// Authentication state - moved inside components

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

// Google Login Button Component
const GoogleLoginButton = React.memo(({ onLogin }) => (
  <button 
    onClick={onLogin}
    style={{
      background: '#4285f4',
      color: 'white',
      border: 'none',
      padding: '10px 20px',
      borderRadius: '5px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '14px',
      fontWeight: '500'
    }}
  >
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    Sign in with Google
  </button>
));

// Character selector component
const CharacterSelector = React.memo(({ npcs, selectedNpcId, onCharacterChange, showCreateOption, onCreateNew }) => (
  <div className="character-selector-container">
    <select 
      value={selectedNpcId} 
      onChange={(e) => {
        if (e.target.value === '__create_new__') {
          onCreateNew();
        } else {
          onCharacterChange(e.target.value);
        }
      }}
      className="npc-selector">
      <option value="">Select a character...</option>
      {npcs.map(npc => (
        <option key={npc.id} value={npc.id}>{npc.name}</option>
      ))}
      {showCreateOption && (
        <option value="__create_new__">+ Create New Character</option>
      )}
    </select>
  </div>
));

// Character Preview Component
const CharacterPreview = React.memo(({ data, onEdit, onCreate, onBack, authToken }) => {
  const [editedData, setEditedData] = useState(data);
  const [isCreating, setIsCreating] = useState(false);

  const updateField = (field, value) => {
    const newData = { ...editedData, [field]: value };
    setEditedData(newData);
    onEdit(newData);
  };

  const updateArrayField = (field, index, value) => {
    const newArray = [...editedData[field]];
    newArray[index] = value;
    updateField(field, newArray);
  };

  const addArrayItem = (field) => {
    const newArray = [...editedData[field], ''];
    updateField(field, newArray);
  };

  const removeArrayItem = (field, index) => {
    const newArray = editedData[field].filter((_, i) => i !== index);
    updateField(field, newArray);
  };

  const handleCreate = async () => {
    setIsCreating(true);
    await onCreate();
  };

  return (
    <div className="character-preview">
      <h3>Character Preview</h3>
      <p className="preview-hint">Review and edit the parsed character data below:</p>
      
      <div className="preview-section">
        <label>Name:</label>
        <input
          type="text"
          value={editedData.name}
          onChange={(e) => updateField('name', e.target.value)}
        />
      </div>

      <div className="preview-section">
        <label>Description:</label>
        <textarea
          value={editedData.description}
          onChange={(e) => updateField('description', e.target.value)}
          rows="3"
        />
      </div>

      <div className="preview-section">
        <label>Personality:</label>
        <textarea
          value={editedData.personality}
          onChange={(e) => updateField('personality', e.target.value)}
          rows="3"
        />
      </div>

      <div className="preview-section">
        <label>Current Scene:</label>
        <textarea
          value={editedData.currentScene}
          onChange={(e) => updateField('currentScene', e.target.value)}
          rows="2"
        />
      </div>

      <div className="preview-section">
        <label>What They Know:</label>
        {editedData.whatTheyKnow.map((item, index) => (
          <div key={index} className="array-item">
            <input
              type="text"
              value={item}
              onChange={(e) => updateArrayField('whatTheyKnow', index, e.target.value)}
            />
            <button onClick={() => removeArrayItem('whatTheyKnow', index)}>×</button>
          </div>
        ))}
        <button onClick={() => addArrayItem('whatTheyKnow')} className="add-item">+ Add Knowledge</button>
      </div>

      <div className="preview-section">
        <label>Pitfalls:</label>
        {editedData.pitfalls.map((item, index) => (
          <div key={index} className="array-item">
            <input
              type="text"
              value={item}
              onChange={(e) => updateArrayField('pitfalls', index, e.target.value)}
            />
            <button onClick={() => removeArrayItem('pitfalls', index)}>×</button>
          </div>
        ))}
        <button onClick={() => addArrayItem('pitfalls')} className="add-item">+ Add Pitfall</button>
      </div>

      <div className="preview-section">
        <label>Motivations:</label>
        {editedData.motivations.map((item, index) => (
          <div key={index} className="array-item">
            <input
              type="text"
              value={item}
              onChange={(e) => updateArrayField('motivations', index, e.target.value)}
            />
            <button onClick={() => removeArrayItem('motivations', index)}>×</button>
          </div>
        ))}
        <button onClick={() => addArrayItem('motivations')} className="add-item">+ Add Motivation</button>
      </div>

      <div className="preview-actions">
        <button onClick={onBack} className="secondary-button">← Back to Input</button>
        <button 
          onClick={handleCreate} 
          disabled={isCreating || !editedData.name.trim()}
          className="primary-button"
        >
          {isCreating ? 'Creating Character...' : 'Create Character'}
        </button>
      </div>
    </div>
  );
});

// Character Editor Component (for editing existing characters)
const CharacterEditor = React.memo(({ data, onCharacterUpdated, onClose, authToken }) => {
  const [editedData, setEditedData] = useState(data);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);

  const updateField = (field, value) => {
    const newData = { ...editedData, [field]: value };
    setEditedData(newData);
  };

  const updateArrayField = (field, index, value) => {
    const newArray = [...editedData[field]];
    newArray[index] = value;
    updateField(field, newArray);
  };

  const addArrayItem = (field) => {
    const newArray = [...editedData[field], ''];
    updateField(field, newArray);
  };

  const removeArrayItem = (field, index) => {
    const newArray = editedData[field].filter((_, i) => i !== index);
    updateField(field, newArray);
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`${BACKEND_URL}/context/${editedData.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedData)
      }, authToken);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update character');
      }
      
      await onCharacterUpdated();
    } catch (error) {
      console.error('Error updating character:', error);
      setError(error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="character-creator-modal">
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="character-creator">
        <div className="creator-header">
          <h2>Edit Character: {data.name}</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <div className="character-preview">
          <p className="preview-hint">Edit the character data below:</p>
          
          <div className="preview-section">
            <label>Name:</label>
            <input
              type="text"
              value={editedData.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
          </div>

          <div className="preview-section">
            <label>Description:</label>
            <textarea
              value={editedData.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows="3"
            />
          </div>

          <div className="preview-section">
            <label>Personality:</label>
            <textarea
              value={editedData.personality}
              onChange={(e) => updateField('personality', e.target.value)}
              rows="3"
            />
          </div>

          <div className="preview-section">
            <label>Current Scene:</label>
            <textarea
              value={editedData.currentScene}
              onChange={(e) => updateField('currentScene', e.target.value)}
              rows="2"
            />
          </div>

          <div className="preview-section">
            <label>What They Know:</label>
            {editedData.whatTheyKnow.map((item, index) => (
              <div key={index} className="array-item">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => updateArrayField('whatTheyKnow', index, e.target.value)}
                />
                <button onClick={() => removeArrayItem('whatTheyKnow', index)}>×</button>
              </div>
            ))}
            <button onClick={() => addArrayItem('whatTheyKnow')} className="add-item">+ Add Knowledge</button>
          </div>

          <div className="preview-section">
            <label>Pitfalls:</label>
            {editedData.pitfalls.map((item, index) => (
              <div key={index} className="array-item">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => updateArrayField('pitfalls', index, e.target.value)}
                />
                <button onClick={() => removeArrayItem('pitfalls', index)}>×</button>
              </div>
            ))}
            <button onClick={() => addArrayItem('pitfalls')} className="add-item">+ Add Pitfall</button>
          </div>

          <div className="preview-section">
            <label>Motivations:</label>
            {editedData.motivations.map((item, index) => (
              <div key={index} className="array-item">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => updateArrayField('motivations', index, e.target.value)}
                />
                <button onClick={() => removeArrayItem('motivations', index)}>×</button>
              </div>
            ))}
            <button onClick={() => addArrayItem('motivations')} className="add-item">+ Add Motivation</button>
          </div>

          <div className="preview-actions">
            <button onClick={onClose} className="secondary-button">Cancel</button>
            <button 
              onClick={handleUpdate} 
              disabled={isUpdating || !editedData.name.trim()}
              className="primary-button"
            >
              {isUpdating ? 'Updating Character...' : 'Update Character'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// Character Creator Component
const CharacterCreator = React.memo(({ onCharacterCreated, onClose, authToken }) => {
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState('input'); // 'input', 'preview', 'creating'
  const [error, setError] = useState(null);

  const exampleTexts = [
    `Thorne Ironfoot is a dwarven merchant with a magnificent braided beard adorned with small gems. He operates the most successful trading post in the mountain pass, dealing in rare minerals and magical components. Despite his friendly demeanor, he's ruthlessly competitive and harbors resentment against the guild that expelled him years ago.`,
    
    `Lady Vex is an elegant tiefling noble with silver hair and violet eyes. She maintains a lavish estate outside the capital where she hosts elaborate parties for the political elite. Behind her charm lies a master manipulator who trades in secrets and influences policy through carefully placed bribes and blackmail.`,
    
    `Old Henrik is a weathered lighthouse keeper who's been tending the beacon for thirty years. His face is scarred from a kraken attack that cost him his left arm, but he refuses to abandon his post. He knows every ship captain and smuggling route along the coast, and keeps detailed logs of suspicious activities.`
  ];

  const handleExampleClick = useCallback((exampleText) => {
    setRawText(exampleText);
  }, []);

  const parseCharacter = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`${BACKEND_URL}/parse-character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText })
      }, authToken);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to parse character');
      }
      
      const data = await response.json();
      setParsedData(data);
      setStep('preview');
    } catch (error) {
      console.error('Error parsing character:', error);
      setError(error.message);
    }
    setIsLoading(false);
  };

  const createCharacter = async () => {
    setStep('creating');
    try {
      const response = await fetchWithAuth(`${BACKEND_URL}/npcs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedData)
      }, authToken);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create character');
      }
      
      const result = await response.json();
      onCharacterCreated(result.npc.id);
    } catch (error) {
      console.error('Error creating character:', error);
      setError(error.message);
      setStep('preview');
    }
  };

  return (
    <div className="character-creator-modal">
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="character-creator">
        <div className="creator-header">
          <h2>Create New Character</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {step === 'input' && (
          <div className="creator-input">
            <p>Describe your character in natural language. Include their appearance, personality, background, and role.</p>
            
            <div className="examples-section">
              <h4>Example descriptions:</h4>
              <div className="examples">
                {exampleTexts.map((example, index) => (
                  <div key={index} className="example-item">
                    <p>"{example.substring(0, 100)}..."</p>
                    <button onClick={() => handleExampleClick(example)} className="use-example">Use This Example</button>
                  </div>
                ))}
              </div>
            </div>

            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Example: Gareth is a grizzled old blacksmith with calloused hands and a perpetual scowl. He's been running the forge in this small town for 30 years and knows everyone's business. He's suspicious of outsiders but has a soft spot for genuine craftsmanship..."
              rows="8"
              className="character-input"
            />
            
            <div className="input-actions">
              <button onClick={onClose} className="secondary-button">Cancel</button>
              <button 
                onClick={parseCharacter} 
                disabled={!rawText.trim() || isLoading}
                className="primary-button"
              >
                {isLoading ? 'Parsing Character...' : 'Parse Character'}
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && parsedData && (
          <CharacterPreview 
            data={parsedData} 
            onEdit={setParsedData}
            onCreate={createCharacter}
            onBack={() => setStep('input')}
            authToken={authToken}
          />
        )}

        {step === 'creating' && (
          <div className="creating-character">
            <h3>Creating Character...</h3>
            <p>Setting up your new character and saving to the system...</p>
            <div className="loading-spinner"></div>
          </div>
        )}
      </div>
    </div>
  );
});

// Main app content component
function AppContent({ preSelectedNpcId = null }) {
  const navigate = useNavigate();
  
  // Authentication state
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState(localStorage.getItem('authToken'));
  
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
  const [showImageModal, setShowImageModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  
  // Character creation state
  const [showCharacterCreator, setShowCharacterCreator] = useState(false);
  
  // Character editing state
  const [showCharacterEditor, setShowCharacterEditor] = useState(false);
  const [editingCharacterData, setEditingCharacterData] = useState(null);
  
  // Refs
  const conversationHistories = useRef({});
  const sseSourceRef = useRef(null);
  const loadedNpcs = useRef(new Set());
  const autoSubmitTimeout = useRef(null);
  const inputRef = useRef(null);
  const conversationRef = useRef(null);
  const audioCache = useRef({});
  const [recognition, setRecognition] = useState(null);

  // Add authentication functions
  const loginWithGoogle = () => {
    window.location.href = `${BACKEND_URL}/auth/google`;
  };

  const logout = () => {
    setUser(null);
    setAuthToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem('authToken');
  };

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      setAuthToken(token);
      setIsAuthenticated(true);
      localStorage.setItem('authToken', token);
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Character management
  const handleCharacterChange = useCallback((newNpcId) => {
    setSelectedNpcId(newNpcId);
    if (newNpcId) {
      navigate(`/character/${newNpcId}`);
    } else {
      navigate('/');
    }
  }, [navigate]);

  // Character creation
  const handleCharacterCreated = useCallback(async (newNpcId) => {
    // Close the creator
    setShowCharacterCreator(false);
    
    // Refresh the NPCs list
    try {
      const response = await fetchWithAuth(`${BACKEND_URL}/npcs`, {}, authToken);
      const data = await response.json();
      setNpcs(data);
      
      // Navigate to the new character
      handleCharacterChange(newNpcId);
    } catch (err) {
      console.error('Error refreshing NPCs list:', err);
    }
  }, [handleCharacterChange]);

  const handleCreateNewCharacter = useCallback(() => {
    setShowCharacterCreator(true);
  }, []);

  // Character editing
  const handleEditCharacter = useCallback(() => {
    if (!selectedNpc) return;
    
    // Convert current NPC data to the format expected by CharacterPreview
    const editData = {
      id: selectedNpc.id,
      name: selectedNpc.name || '',
      description: selectedNpc.description || '',
      personality: selectedNpc.personality || '',
      currentScene: selectedNpc.currentScene || '',
      whatTheyKnow: selectedNpc.whatTheyKnow || [],
      pitfalls: selectedNpc.pitfalls || [],
      motivations: selectedNpc.motivations || [],
      imagePrompt: selectedNpc.imagePrompt || '',
      voice: selectedNpc.voice || {
        provider: "elevenlabs",
        voiceId: "ysswSXp8U9dFpzPJqFje",
        settings: {
          stability: 0.55,
          similarity_boost: 0.7,
          style: 0.3,
          use_speaker_boost: true
        }
      }
    };
    
    setEditingCharacterData(editData);
    setShowCharacterEditor(true);
  }, [selectedNpc]);

  const handleCharacterUpdated = useCallback(async () => {
    // Close the editor
    setShowCharacterEditor(false);
    
    // Refresh the NPCs list and current NPC context
    try {
      const response = await fetchWithAuth(`${BACKEND_URL}/npcs`, {}, authToken);
      const data = await response.json();
      setNpcs(data);
      
      // Reload the current NPC context
      if (selectedNpcId) {
        const contextResponse = await fetchWithAuth(`${BACKEND_URL}/context/${selectedNpcId}`, {}, authToken);
        const contextData = await contextResponse.json();
        setSelectedNpc(contextData);
        setNpcContext(contextData);
      }
    } catch (err) {
      console.error('Error refreshing data after edit:', err);
    }
  }, [selectedNpcId]);

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

      const response = await fetchWithAuth(`${BACKEND_URL}/speak/${currentNpcId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      }, authToken);

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
      const response = await fetchWithAuth(`${BACKEND_URL}/chat/${selectedNpc.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: playerInput.trim(),
          conversationHistory,
          clientId: CLIENT_ID
        }),
      }, authToken);

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
        const response = await fetchWithAuth(`${BACKEND_URL}/npcs`, {}, authToken);
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
        setIsLoadingImage(true);
        
        const response = await fetchWithAuth(`${BACKEND_URL}/context/${selectedNpcId}`, {}, authToken);
        const data = await response.json();
        
        setSelectedNpc(data);
        setNpcContext(data);
        
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
    
    fetchWithAuth(`${BACKEND_URL}/api/npc/${selectedNpc.id}/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adjustment })
    }, authToken).then(response => {
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
      
      await fetchWithAuth(`${BACKEND_URL}/clear-history/${selectedNpc.id}?client=${CLIENT_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, authToken);
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
          <div className="auth-section">
            {!isAuthenticated ? (
              <GoogleLoginButton onLogin={loginWithGoogle} />
            ) : (
              <div className="user-info">
                <span>Welcome, {user?.name || 'User'}!</span>
                <button onClick={logout} className="logout-button">
                  Logout
                </button>
              </div>
            )}
          </div>
          
          <CharacterSelector
            npcs={npcs}
            selectedNpcId={selectedNpcId}
            onCharacterChange={handleCharacterChange}
            showCreateOption={isGMMode}
            onCreateNew={handleCreateNewCharacter}
          />
          
          {isGMMode && (
            <button 
              onClick={handleCreateNewCharacter}
              className="create-character-button primary"
            >
              + Create Character
            </button>
          )}
          
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
            <div className="gm-controls">
              <div className="character-actions">
                <button 
                  className="edit-character-button primary-button"
                  onClick={handleEditCharacter}
                >
                  Edit Character Details
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
                  className="primary-button"
                >
                  {isGenerating ? 'Generating...' : 'Generate New Image'}
                </button>
                
                <button 
                  type="button" 
                  onClick={handleClearHistory}
                  className="secondary-button"
                >
                  Clear Conversation History
                </button>
              </div>
            </div>
          )}
          
          {!selectedNpc && (
            <p>Select an NPC to manage their details and conversation.</p>
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
        onAttitudeChange={(newAttitude) => setCurrentAttitude(newAttitude)}
        isGMMode={isGMMode}
      />

      {/* Character Creator Modal */}
      {showCharacterCreator && (
        <CharacterCreator
          onCharacterCreated={handleCharacterCreated}
          onClose={() => setShowCharacterCreator(false)}
          authToken={authToken}
        />
      )}

      {/* Character Editor Modal */}
      {showCharacterEditor && editingCharacterData && (
        <CharacterEditor
          data={editingCharacterData}
          onCharacterUpdated={handleCharacterUpdated}
          onClose={() => setShowCharacterEditor(false)}
          authToken={authToken}
        />
      )}
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
