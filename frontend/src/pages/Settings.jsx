import { useState, useEffect, useRef, useCallback } from 'react';
import { configAPI, systemAPI, routerAPI, musicAPI, videoAPI, personaAPI, databaseAPI, usersAPI } from '../services/api';
import { useRouterConfig } from '../hooks/useRouterConfig';
import { useAIModels } from '../hooks/useAIModels';
import { FolderPicker, FilePicker } from '../components/FolderPicker';
import { ConversionProgressModal } from '../components/ConversionProgressModal';
import { VideoConversionModal } from '../components/VideoConversionModal';
import { CoverArtModal } from '../components/CoverArtModal';
import { PersonaImageUpload } from '../components/PersonaImageUpload';

function UserManagementPanel({ onNavigate }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editingPassCode, setEditingPassCode] = useState({});

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await usersAPI.getUsers();
      if (result.success) {
        console.log('Loaded users:', result.users);
        result.users.forEach(user => {
          console.log(`User ${user.id} (${user.name}): pass_code =`, user.pass_code, 'type:', typeof user.pass_code);
        });
        setUsers(result.users);
      } else {
        setError('Failed to load users');
      }
    } catch (err) {
      console.error('Error loading users:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (userId, currentAdminStatus) => {
    try {
      setError(null);
      const result = await usersAPI.updateUser(userId, { is_admin: !currentAdminStatus });
      if (result.success) {
        setSuccess(`User ${result.user.is_admin ? 'promoted to admin' : 'removed from admin'}`);
        await loadUsers();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Failed to update user');
      }
    } catch (err) {
      console.error('Error updating user:', err);
      setError(err.message);
    }
  };

  const handlePassCodeChange = (userId, value) => {
    setEditingPassCode({ ...editingPassCode, [userId]: value });
  };

  const handlePassCodeBlur = async (userId) => {
    const newPassCode = editingPassCode[userId];
    const user = users.find(u => u.id === userId);
    const currentPassCode = user?.pass_code || '';
    
    // Only update if the value has changed
    if (newPassCode !== undefined && newPassCode !== currentPassCode) {
      try {
        setError(null);
        // Use FormData to match backend expectations
        const formData = new FormData();
        // Send the pass_code value, or null if empty string
        formData.append('pass_code', newPassCode || '');
        
        const response = await fetch(`/api/users/${userId}`, {
          method: 'PUT',
          body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          const errorMsg = result.detail || result.error || `HTTP ${response.status}`;
          throw new Error(errorMsg);
        }
        
        if (result.success) {
          console.log('Update successful, response:', result);
          console.log('Updated user pass_code:', result.user?.pass_code);
          setSuccess('Pass code updated');
          // Clear editing state first
          const newEditing = { ...editingPassCode };
          delete newEditing[userId];
          setEditingPassCode(newEditing);
          // Update the user in the local state immediately with the response data
          if (result.user) {
            setUsers(prevUsers => prevUsers.map(u => 
              u.id === userId ? { ...u, pass_code: result.user.pass_code } : u
            ));
          }
          // Then reload users to get the updated data from server
          await loadUsers();
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError(result.error || result.detail || 'Failed to update pass code');
        }
      } catch (err) {
        console.error('Error updating pass code:', err);
        setError(err.message || 'Failed to update pass code');
      }
    } else {
      // Clear editing state if no change
      const newEditing = { ...editingPassCode };
      delete newEditing[userId];
      setEditingPassCode(newEditing);
    }
  };

  const handlePassCodeKeyDown = (e, userId) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      // Cancel editing
      const newEditing = { ...editingPassCode };
      delete newEditing[userId];
      setEditingPassCode(newEditing);
      // Reset to original value
      const user = users.find(u => u.id === userId);
      if (user) {
        setEditingPassCode({ ...editingPassCode, [userId]: user.pass_code || '' });
      }
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h3>User Management</h3>
        <button
          onClick={() => onNavigate?.('users')}
          className="save-button"
        >
          Go to Users Page
        </button>
      </div>
      <div className="settings-panel-content">
        {error && (
          <div className="settings-message error" style={{ marginBottom: '16px' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="settings-message success" style={{ marginBottom: '16px' }}>
            {success}
          </div>
        )}
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9da7b8' }}>
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9da7b8' }}>
            No users found. Go to Users page to add users.
          </div>
        ) : (
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.85rem', fontWeight: '600', color: '#9da7b8', textTransform: 'uppercase' }}>Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.85rem', fontWeight: '600', color: '#9da7b8', textTransform: 'uppercase' }}>Pass Code</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.85rem', fontWeight: '600', color: '#9da7b8', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#9da7b8', textTransform: 'uppercase' }}>Admin</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isEditing = editingPassCode.hasOwnProperty(user.id);
                  // Get the current pass_code value - handle null, undefined, and empty string
                  const currentPassCode = (user.pass_code != null && user.pass_code !== undefined) ? String(user.pass_code) : '';
                  const displayValue = isEditing ? (editingPassCode[user.id] !== undefined ? editingPassCode[user.id] : currentPassCode) : currentPassCode;
                  
                  // Debug: log user data for all users
                  console.log(`User ${user.id} (${user.name}): pass_code =`, user.pass_code, 'type:', typeof user.pass_code, 'truthy:', !!user.pass_code);
                  
                  return (
                    <tr key={user.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '16px', color: '#fff', fontSize: '0.95rem' }}>{user.name}</td>
                      <td style={{ padding: '16px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={displayValue}
                            onChange={(e) => handlePassCodeChange(user.id, e.target.value)}
                            onBlur={() => handlePassCodeBlur(user.id)}
                            onKeyDown={(e) => handlePassCodeKeyDown(e, user.id)}
                            autoFocus
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              background: 'rgba(255, 255, 255, 0.1)',
                              border: '1px solid rgba(102, 126, 234, 0.5)',
                              borderRadius: '4px',
                              color: '#fff',
                              fontSize: '0.85rem',
                              outline: 'none'
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => {
                              console.log('Clicking pass_code for user', user.id, 'current value:', user.pass_code);
                              setEditingPassCode({ ...editingPassCode, [user.id]: (user.pass_code || '') });
                            }}
                            style={{
                              color: (user.pass_code && String(user.pass_code).trim()) ? '#fff' : '#9da7b8',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              transition: 'background 0.2s ease',
                              minHeight: '24px',
                              display: 'flex',
                              alignItems: 'center',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                            title={user.pass_code ? `Pass code: ${user.pass_code}` : 'Click to set pass code'}
                          >
                            {(() => {
                              const code = user.pass_code;
                              console.log('Rendering pass_code for user', user.id, 'value:', code, 'type:', typeof code, 'truthy:', !!code);
                              if (code != null && code !== undefined && String(code).trim()) {
                                return String(code);
                              }
                              return '-';
                            })()}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        {user.is_admin ? (
                          <span style={{ padding: '4px 8px', background: 'rgba(76, 175, 80, 0.2)', color: '#4caf50', borderRadius: '4px', fontSize: '0.85rem' }}>Admin</span>
                        ) : (
                          <span style={{ color: '#9da7b8', fontSize: '0.85rem' }}>User</span>
                        )}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={user.is_admin}
                            onChange={() => handleToggleAdmin(user.id, user.is_admin)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '0.85rem', color: '#9da7b8' }}>Admin</span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsPage({ onNavigate }) {
  const [activeTab, setActiveTab] = useState('system');
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [personaConfig, setPersonaConfig] = useState('');
  const [personaFields, setPersonaFields] = useState({});
  const [newPersonaName, setNewPersonaName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(null);
  const [isCreatingVoice, setIsCreatingVoice] = useState(false);
  const [newVoiceFields, setNewVoiceFields] = useState({
    persona_name: '',
    fish_audio_id: '',
    voice_engine: 's1'
  });
  const [newPersonaFields, setNewPersonaFields] = useState({
    title: '',
    model: 'claude-sonnet-4-5-20250929',
    context: '# === System message ===\nYou are an AI assistant.\n\nCRITICAL: Your responses must consist solely of natural, spoken words and basic punctuation. Do NOT use any markdown formatting.\n\n# === Response guidelines ===\n- Be clear and concise\n- Use plain text only\n- Avoid formatting symbols',
    temperature: 0.6,
    top_p: 0.9,
    max_tokens: 650,
    voice_id: '',
    voice_engine: 's1'
  });
  const { models: aiModels, loading: modelsLoading } = useAIModels();
  const [locationConfig, setLocationConfig] = useState('');
  const [apiKeysConfig, setApiKeysConfig] = useState('');
  const [apiKeysFields, setApiKeysFields] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingTableData, setLoadingTableData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState('');
  const [activeRouterTab, setActiveRouterTab] = useState('router');
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicMessage, setMusicMessage] = useState('');
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoMessage, setVideoMessage] = useState('');
  const [videoConversionScanning, setVideoConversionScanning] = useState(false);
  const [showVideoConversionModal, setShowVideoConversionModal] = useState(false);
  const [videoConversionScanData, setVideoConversionScanData] = useState(null);
  const [systemConfig, setSystemConfig] = useState('');
  const [systemFields, setSystemFields] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [courseSettings, setCourseSettings] = useState({
    outline_prompt: '',
    lesson_prompt: '',
    outline_max_tokens: 2048,
    lesson_max_tokens: 4096
  });
  const [locationFields, setLocationFields] = useState({});
  const [fillerWords, setFillerWords] = useState([]);
  const [newFillerText, setNewFillerText] = useState('');
  const [creatingFiller, setCreatingFiller] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [databaseTables, setDatabaseTables] = useState([]);
  const [conversionDirectory, setConversionDirectory] = useState('');
  const [converting, setConverting] = useState(false);
  const [conversionStatus, setConversionStatus] = useState(null);
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [conversionScanData, setConversionScanData] = useState(null);
  const [coverScanDirectory, setCoverScanDirectory] = useState('');
  const [scanningCovers, setScanningCovers] = useState(false);
  const [coverScanData, setCoverScanData] = useState(null);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [downloadingCovers, setDownloadingCovers] = useState(false);
  const [coverDownloadProgress, setCoverDownloadProgress] = useState({ current: 0, total: 0, downloaded: 0, errors: 0 });
  const [coverDownloadItem, setCoverDownloadItem] = useState('');
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [tablePage, setTablePage] = useState(1);
  const [tableLimit] = useState(15);
  const [editingCell, setEditingCell] = useState(null);
  const [editedRow, setEditedRow] = useState({});
  const [scraperSources, setScraperSources] = useState([]);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperClearing, setScraperClearing] = useState(false);
  const [scraperMessage, setScraperMessage] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceName, setNewSourceName] = useState('');
  const [scrapingSourceId, setScrapingSourceId] = useState(null);
  const [showScraperProgress, setShowScraperProgress] = useState(false);
  const [scrapingSource, setScrapingSource] = useState(null);
  const loadingTableRef = useRef(null);
  const {
    model,
    temperature,
    topP,
    maxTokens,
    basePrompt,
    rules,
    setModel,
    setTemperature,
    setTopP,
    setMaxTokens,
    setBasePrompt,
    loading: routerLoading,
    error: routerError,
    saving: routerSaving,
    success: routerSuccess,
    saveRouter,
    addRule,
    updateRule,
    removeRule,
  } = useRouterConfig(activeRouterTab === 'router');

  const loadTableData = useCallback(async (tableName, page = 1) => {
    if (!tableName) {
      return;
    }
    
    // Prevent multiple simultaneous loads for the same table/page
    const loadKey = `${tableName}-${page}`;
    if (loadingTableRef.current === loadKey) {
      console.log('Already loading this table/page, skipping');
      return;
    }
    
    console.log('loadTableData called:', tableName, page);
    loadingTableRef.current = loadKey;
    
    try {
      setLoadingTableData(true);
      setError(null);
      const result = await databaseAPI.getTableData(tableName, page, tableLimit);
      console.log('Table data result:', result);
      
      if (result && result.success) {
        console.log('Setting table data:', result.data?.length, 'rows');
        console.log('Table data structure:', { success: result.success, columns: result.columns?.length, data: result.data?.length });
        console.log('BEFORE setTableData - result:', result);
        setTableData(result);
        console.log('AFTER setTableData called');
        setError(null);
        // Force a re-render check
        setTimeout(() => {
          console.log('After setTableData - current tableData state should be set now');
        }, 100);
      } else {
        console.error('Table data result not successful:', result);
        setError('Failed to load table data');
      }
    } catch (err) {
      console.error('Error loading table data:', err);
      console.error('Error details:', err.response?.data || err.message);
      setError(err.response?.data?.detail || err.message || 'Failed to load table data');
    } finally {
      setLoadingTableData(false);
      loadingTableRef.current = null;
      console.log('loadTableData finished');
    }
  }, [tableLimit]);

  useEffect(() => {
    loadPersonas();
    loadVoices();
    loadLocationConfig();
    loadApiKeysConfig();
    loadSystemConfig();
    if (activeTab === 'database') {
      loadDatabaseTables();
    }
    // Users tab doesn't need to load data here - it's handled by UsersPage
  }, [activeTab]);
  
  useEffect(() => {
    console.log('useEffect fired - selectedTable:', selectedTable, 'activeTab:', activeTab, 'tablePage:', tablePage);
    if (selectedTable && activeTab === 'database') {
      console.log('useEffect triggered - Loading table data:', selectedTable, 'page:', tablePage);
      loadTableData(selectedTable, tablePage);
    } else if (activeTab !== 'database') {
      // Clear table data when switching away from database tab
      console.log('Clearing table data - activeTab is not database');
      setTableData(null);
      setSelectedTable(null);
      setTablePage(1);
      loadingTableRef.current = null;
    }
  }, [selectedTable, tablePage, activeTab, loadTableData]);

  // Load scraper sources when scraper tab is active
  useEffect(() => {
    if (activeTab === 'scraper') {
      loadScraperSources();
    }
  }, [activeTab]);

  const loadPersonas = async () => {
    try {
      const data = await configAPI.getPersonas();
      setPersonas(data.personas || []);
    } catch (err) {
      console.error('Error loading personas:', err);
      setError('Failed to load personas');
    }
  };

  const loadPersonaConfig = async (personaName) => {
    setLoading(true);
    setError(null);
    try {
      const data = await configAPI.getPersonaConfig(personaName);
      setPersonaConfig(JSON.stringify(data, null, 2));
      setPersonaFields(data);
      setSelectedPersona(personaName);
      
      // Set selected voice if persona has one linked
      if (data._voice) {
        setSelectedVoiceId(data._voice.id);
      } else {
        setSelectedVoiceId(null);
      }
      
      // Load filler words
      await loadFillerWords(personaName);
    } catch (err) {
      console.error('Error loading persona config:', err);
      setError(`Failed to load config for ${personaName}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Reload personas when image is uploaded
  useEffect(() => {
    if (activeTab === 'personas') {
      loadPersonas();
    }
  }, [activeTab]);
  
  const loadVoices = async () => {
    try {
      const result = await personaAPI.getVoices();
      if (result.success) {
        setVoices(result.voices || []);
      }
    } catch (err) {
      console.error('Error loading voices:', err);
    }
  };

  const handleVoiceChange = async (voiceId) => {
    if (!selectedPersona) return;
    
    setSelectedVoiceId(voiceId);
    try {
      await personaAPI.setPersonaVoice(selectedPersona, voiceId);
      setSuccess(`Voice updated for ${selectedPersona}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error setting persona voice:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to set voice');
      // Revert selection on error
      const data = await configAPI.getPersonaConfig(selectedPersona);
      if (data._voice) {
        setSelectedVoiceId(data._voice.id);
      } else {
        setSelectedVoiceId(null);
      }
    }
  };

  const loadFillerWords = async (personaName) => {
    if (!personaName) {
      setFillerWords([]);
      return;
    }
    
    try {
      console.log('Loading filler words for persona:', personaName);
      const result = await personaAPI.getFillerWords(personaName);
      console.log('Filler words result:', result);
      
      if (result && result.success) {
        const words = result.filler_words || [];
        console.log(`Found ${words.length} filler words:`, words);
        setFillerWords(words);
      } else {
        console.warn('Filler words request not successful:', result);
        setFillerWords([]);
      }
    } catch (err) {
      console.error('Error loading filler words:', err);
      console.error('Error details:', err.response?.data || err.message);
      setFillerWords([]);
      // Don't set error here as it might be expected if no filler words exist
      // Only log for debugging
    }
  };

  const handlePlayFillerWord = async (personaName, filename) => {
    try {
      setPlayingAudio(filename);
      const audioUrl = personaAPI.getFillerWordAudio(personaName, filename);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setPlayingAudio(null);
      };
      
      audio.onerror = () => {
        setPlayingAudio(null);
        setError('Failed to play audio');
      };
      
      await audio.play();
    } catch (err) {
      console.error('Error playing filler word:', err);
      setPlayingAudio(null);
      setError('Failed to play audio');
    }
  };

  const handleDeleteFillerWord = async (personaName, filename) => {
    if (!confirm(`Delete filler word "${filename}"?`)) {
      return;
    }
    
    try {
      await personaAPI.deleteFillerWord(personaName, filename);
      await loadFillerWords(personaName);
      setSuccess('Filler word deleted');
    } catch (err) {
      console.error('Error deleting filler word:', err);
      setError('Failed to delete filler word');
    }
  };

  const handleCreateFillerWord = async () => {
    if (!newFillerText.trim() || !selectedPersona) {
      setError('Please enter text for the filler word');
      return;
    }
    
    setCreatingFiller(true);
    setError(null);
    
    try {
      await personaAPI.createFillerWord(selectedPersona, newFillerText.trim());
      setNewFillerText('');
      await loadFillerWords(selectedPersona);
      setSuccess('Filler word created successfully');
    } catch (err) {
      console.error('Error creating filler word:', err);
      setError(err.response?.data?.detail || 'Failed to create filler word');
    } finally {
      setCreatingFiller(false);
    }
  };

  const loadDatabaseTables = async () => {
    try {
      setLoading(true);
      const result = await databaseAPI.getTables();
      if (result.success) {
        setDatabaseTables(result.tables || []);
      }
    } catch (err) {
      console.error('Error loading database tables:', err);
      setError('Failed to load database tables');
    } finally {
      setLoading(false);
    }
  };

  const loadScraperSources = async () => {
    try {
      const response = await fetch('/api/scraper/sources');
      const result = await response.json();
      if (result.success) {
        setScraperSources(result.sources || []);
      }
    } catch (err) {
      console.error('Error loading scraper sources:', err);
      setScraperMessage('Failed to load sources');
    }
  };

  const handleCellEdit = (rowId, column, value) => {
    setEditingCell({ rowId, column });
    setEditedRow(prev => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        [column]: value
      }
    }));
  };

  const handleSaveRow = async (rowId, rowData) => {
    try {
      setSaving(true);
      await databaseAPI.updateTableRow(selectedTable, rowId, rowData);
      setSuccess('Row updated successfully');
      setEditingCell(null);
      setEditedRow(prev => {
        const newState = { ...prev };
        delete newState[rowId];
        return newState;
      });
      await loadTableData(selectedTable, tablePage);
    } catch (err) {
      console.error('Error updating row:', err);
      setError(err.response?.data?.detail || 'Failed to update row');
    } finally {
      setSaving(false);
    }
  };

  const loadLocationConfig = async () => {
    try {
      const data = await configAPI.getLocationConfig();
      setLocationConfig(JSON.stringify(data, null, 2));
      setLocationFields(data);
    } catch (err) {
      console.error('Error loading location config:', err);
    }
  };

  const loadApiKeysConfig = async () => {
    try {
      const data = await configAPI.getApiKeysConfig();
      setApiKeysConfig(JSON.stringify(data, null, 2));
      setApiKeysFields(data);
    } catch (err) {
      console.error('Error loading API keys config:', err);
    }
  };

  const loadSystemConfig = async () => {
    try {
      const data = await configAPI.getSystemConfig();
      setSystemConfig(JSON.stringify(data, null, 2));
      setSystemFields(data);
      
      // Load course settings if they exist, otherwise use defaults
      if (data.course_settings) {
        setCourseSettings({
          outline_prompt: data.course_settings.outline_prompt || '',
          lesson_prompt: data.course_settings.lesson_prompt || '',
          outline_max_tokens: data.course_settings.outline_max_tokens || 2048,
          lesson_max_tokens: data.course_settings.lesson_max_tokens || 4096
        });
      } else {
        // Set defaults if no settings exist yet
        const defaultOutlinePrompt = `You are an educational course designer. Your task is to generate a structured online course outline based on a learning request.

TASK: Generate a complete course outline with a title and learning sections.

USER LEARNING REQUEST:
{prompt}

YOUR RESPONSE MUST BE VALID JSON ONLY. No markdown, no code fences, no explanations, just pure JSON.

Generate:
1. A clear, descriptive course title (maximum 60 characters)
2. An ordered list of 5-10 learning sections, each with:
   - A section title (20-50 characters)
   - A brief summary (1-3 sentences) describing what this section should teach and what students will learn
   - A list of 3-8 subsections, each with:
     - A subsection title (10-40 characters)
     - A short summary (1-2 sentences) describing what that subsection will cover

REQUIREMENTS:
- Sections must be beginner-friendly and build progressively upon each other
- Section titles should be clear and descriptive (20-50 characters each)
- Section summaries should explain what concepts will be covered and what students will achieve
- Subsections must be tightly scoped and represent the internal teaching flow of the section
- Start with foundational concepts and progress to more advanced topics
- Do NOT include full lesson content, only titles and summaries
- Ensure sections are comprehensive enough to cover the learning request
- Number of sections should be appropriate for the topic complexity (typically 5-10 sections)

REQUIRED JSON FORMAT (you must return exactly this structure):
{
  "title": "Course Title Here",
  "sections": [
    {
      "title": "Section 1 Title",
      "summary": "What this section teaches and what students will learn (1-3 sentences).",
      "subsections": [
        {
          "title": "Subsection 1 Title",
          "summary": "What this subsection covers (1-2 sentences)."
        },
        {
          "title": "Subsection 2 Title",
          "summary": "What this subsection covers (1-2 sentences)."
        }
      ]
    },
    {
      "title": "Section 2 Title",
      "summary": "What this section teaches and what students will learn (1-3 sentences).",
      "subsections": [
        {
          "title": "Subsection 1 Title",
          "summary": "What this subsection covers (1-2 sentences)."
        }
      ]
    }
  ]
}

IMPORTANT: Return ONLY the JSON object above. Do not include any markdown code fences, explanations, or additional text. The response must start with { and end with }.`;

        const defaultLessonPrompt = `You are an expert educator creating a comprehensive, beginner-friendly lesson that teaches concepts in depth. Your goal is to help students understand the material thoroughly, not just list facts.

Course: {course_title}
Section: {section_title}
Section Summary (What this section should teach): {section_summary}

CRITICAL TEACHING REQUIREMENTS (NON-NEGOTIABLE):

1. EXPLAIN, DON'T JUST LIST:
   - For every concept you introduce, provide a clear explanation of WHAT it is, WHY it matters, and HOW it works
   - Use analogies and real-world examples to make abstract concepts concrete
   - Explain the reasoning behind concepts, not just the facts
   - Break down complex ideas into simpler parts that build on each other
   - Show the connections between different concepts

2. PROGRESSIVE KNOWLEDGE BUILDING:
   - Start with foundational concepts and gradually build complexity
   - Introduce concepts in logical order, where each new idea builds on previous ones
   - Use "scaffolding": introduce simple examples first, then gradually increase complexity
   - Explain prerequisites before introducing advanced concepts
   - Connect new information to what students should already know from earlier sections

3. DETAILED EXPLANATIONS:
   - Each major concept should have at least 2-3 paragraphs of explanation
   - Don't just say "Language models predict words" - explain HOW they predict, WHAT patterns they look for, WHY certain words are more likely than others
   - Provide step-by-step breakdowns of processes or mechanisms
   - Explain cause-and-effect relationships
   - Describe the "why" behind every important concept

4. PRACTICAL EXAMPLES AND CONTEXT:
   - Include concrete examples for every abstract concept
   - Use scenarios and use cases to show practical applications
   - Provide before/after comparisons or "what if" scenarios
   - Use examples that students can relate to
   - Show how concepts apply in real-world situations

5. ZERO-LIST RULE (STRICT):
   - DO NOT use bullet points or numbered lists anywhere in the lesson
   - Convert all lists into full sentences and paragraphs
   - If you must enumerate, do it in prose (e.g., "First..., Second..., Third...") within paragraphs

LESSON STRUCTURE (PROSE-ONLY):

Format the lesson in Markdown with:
- A main heading (H1) for the section title: # {section_title}
- Multiple subsections (3-5) using H2 headings (##) for each major topic
- Each subsection must be substantial (300-500 words minimum) with detailed explanations
- Use H3 subheadings (###) to organize concepts within subsections
- Each subsection must contain at least 3 paragraphs
- Do not use bullets, numbered lists, or list-like formatting
- Include code examples, diagrams descriptions, or practical demonstrations when applicable

Example of GOOD structure:
# {section_title}

## Introduction: Understanding the Fundamentals
[2-3 paragraphs explaining what this section will teach and why it matters, connecting to previous knowledge]

## Core Concept 1: [Detailed Explanation]
[3-4 paragraphs explaining what this concept is, why it exists, how it works, with examples and analogies]
[Then maybe a bullet point summary of key takeaways]

## Core Concept 2: [Building on Concept 1]
[3-4 paragraphs that reference Concept 1, show how Concept 2 relates to it, explain Concept 2 in detail]
[Practical examples and applications]

## Progressive Development: [How concepts build]
[2-3 paragraphs showing how all concepts work together, building complexity]

## Practical Applications and Examples
[Real-world scenarios, detailed examples showing concepts in action]

BAD EXAMPLE (what to avoid):
- Just listing items: "Key characteristics: predict, understand, generate..."
- No explanations: Just naming things without saying what they are or why they matter
- Shallow coverage: Mentioning many topics but explaining none

GOOD EXAMPLE:
"Language models fundamentally work by analyzing probability distributions of words. But what does that actually mean? Think of it like this: when you're reading a sentence and see the word 'The', your brain immediately expects certain words to follow - probably a noun like 'cat' or 'book', not a verb like 'jumped'. This is because your brain has learned from millions of sentences that 'The' is typically followed by nouns. Language models do something similar, but using mathematical probabilities..."

Return ONLY the Markdown content, no additional text or JSON wrapper.`;

        setCourseSettings({
          outline_prompt: defaultOutlinePrompt,
          lesson_prompt: defaultLessonPrompt,
          outline_max_tokens: 2048,
          lesson_max_tokens: 4096
        });
      }
      
      // Expand pre-context section by default
      setExpandedSections(prev => ({
        ...prev,
        'pre-context': true
      }));
    } catch (err) {
      console.error('Error loading system config:', err);
    }
  };

  const savePersonaConfig = async () => {
    if (!selectedPersona) return;
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      await configAPI.savePersonaConfig(selectedPersona, personaFields);
      setSuccess(`Saved ${selectedPersona} config successfully`);
      await loadPersonas();
    } catch (err) {
      console.error('Error saving persona config:', err);
      setError(err.message || 'Failed to save config.');
    } finally {
      setSaving(false);
    }
  };

  const deletePersonaConfig = async () => {
    if (!selectedPersona) return;
    
    if (!confirm(`Are you sure you want to delete the persona "${selectedPersona}"? This action cannot be undone.`)) {
      return;
    }
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      await configAPI.deletePersona(selectedPersona);
      setSuccess(`Deleted ${selectedPersona} successfully`);
      setSelectedPersona(null);
      setPersonaConfig('');
      setPersonaFields({});
      await loadPersonas();
    } catch (err) {
      console.error('Error deleting persona:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to delete persona.');
    } finally {
      setSaving(false);
    }
  };

  const createNewPersona = async () => {
    if (!newPersonaName.trim()) {
      setError('Persona name is required');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Create persona config from form fields
      const personaConfig = {
        "title": newPersonaFields.title || newPersonaName.charAt(0).toUpperCase() + newPersonaName.slice(1),
        "anthropic": {
          "anthropic_model": newPersonaFields.model,
          "prompt_context": newPersonaFields.context,
          "temperature": parseFloat(newPersonaFields.temperature),
          "top_p": parseFloat(newPersonaFields.top_p),
          "max_tokens": parseInt(newPersonaFields.max_tokens)
        },
        "filler": {
          "answer_question": "let_me_check_my_data_stores.mp3",
          "wake_word_confirmation": "yes.mp3",
          "translating": "translating.mp3"
        }
      };

      // Add Fish Audio config only if voice_id is provided
      if (newPersonaFields.voice_id && newPersonaFields.voice_id.trim()) {
        personaConfig.fish_audio = {
          "voice_id": newPersonaFields.voice_id.trim(),
          "voice_engine": newPersonaFields.voice_engine || "s1"
        };
      }

      await configAPI.createPersona(newPersonaName, personaConfig);
      setSuccess(`Created persona ${newPersonaName} successfully`);
      setNewPersonaName('');
      setNewPersonaFields({
        title: '',
        model: 'claude-sonnet-4-5-20250929',
        context: '# === System message ===\nYou are an AI assistant.\n\nCRITICAL: Your responses must consist solely of natural, spoken words and basic punctuation. Do NOT use any markdown formatting.\n\n# === Response guidelines ===\n- Be clear and concise\n- Use plain text only\n- Avoid formatting symbols',
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 650,
        voice_id: '',
        voice_engine: 's1'
      });
      setIsCreating(false);
      await loadPersonas();
      await loadPersonaConfig(newPersonaName);
    } catch (err) {
      console.error('Error creating persona:', err);
      setError(err.message || 'Failed to create persona');
    } finally {
      setSaving(false);
    }
  };

  const saveLocationConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const config = JSON.parse(locationConfig);
      await configAPI.saveLocationConfig(config);
      setSuccess('Location config saved successfully');
    } catch (err) {
      console.error('Error saving location config:', err);
      setError(err.message || 'Failed to save config. Check JSON syntax.');
    } finally {
      setSaving(false);
    }
  };

  const saveApiKeysConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      await configAPI.saveApiKeysConfig(apiKeysFields);
      setSuccess('API keys config saved successfully');
    } catch (err) {
      console.error('Error saving API keys config:', err);
      setError(err.message || 'Failed to save config.');
    } finally {
      setSaving(false);
    }
  };

  const saveSystemConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Include course settings in system config
      const configToSave = {
        ...systemFields,
        course_settings: courseSettings
      };
      await configAPI.saveSystemConfig(configToSave);
      setSuccess('System config saved successfully');
    } catch (err) {
      console.error('Error saving system config:', err);
      setError(err.message || 'Failed to save config.');
    } finally {
      setSaving(false);
    }
  };

  const saveCourseSettings = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const configToSave = {
        ...systemFields,
        course_settings: courseSettings
      };
      await configAPI.saveSystemConfig(configToSave);
      setSuccess('Course settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving course settings:', err);
      setError(err.message || 'Failed to save course settings.');
    } finally {
      setSaving(false);
    }
  };

  const updatePersonaField = (path, value) => {
    const keys = path.split('.');
    const updated = { ...personaFields };
    let current = updated;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    
    // Try to parse numbers
    const numValue = parseFloat(value);
    current[keys[keys.length - 1]] = !isNaN(numValue) && value !== '' ? numValue : value;
    
    setPersonaFields(updated);
  };

  const updateApiKeyField = (path, value) => {
    const keys = path.split('.');
    const updated = { ...apiKeysFields };
    let current = updated;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    setApiKeysFields(updated);
  };

  const updateSystemField = (path, value) => {
    const keys = path.split('.');
    const updated = { ...systemFields };
    let current = updated;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    
    // Try to parse numbers for numeric fields
    const numValue = parseFloat(value);
    current[keys[keys.length - 1]] = !isNaN(numValue) && value !== '' && typeof systemFields[keys[0]]?.[keys[1]] === 'number' ? numValue : value;
    
    setSystemFields(updated);
  };

  const updateLocationField = (field, value) => {
    setLocationFields(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleRestart = async () => {
    setRestarting(true);
    setRestartMsg('');
    try {
      const res = await systemAPI.restart();
      setRestartMsg(res?.message || 'Restart scheduled');
      // Clear caches/local storage to avoid stale assets
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      localStorage.clear();
      sessionStorage.clear();
      // Give the server a moment to exit, then reload
      setTimeout(() => {
        window.location.reload(true);
      }, 1000);
    } catch (err) {
      console.error('Failed to restart server:', err);
      setRestartMsg('Failed to restart server');
    } finally {
      setRestarting(false);
    }
  };

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const handleMusicScan = async () => {
    setMusicLoading(true);
    setMusicMessage('');
    try {
      console.log('Music scan: starting request to /api/music/scan');
      const res = await musicAPI.scanMusic();
      console.log('Music scan: response', res);
      if (res?.success) {
        setMusicMessage('Music library scanned successfully.');
      } else {
        setMusicMessage(res?.error || 'Music scan failed.');
      }
    } catch (err) {
      console.error('Music scan failed:', err);
      setMusicMessage(err?.message || 'Music scan failed.');
    } finally {
      setMusicLoading(false);
    }
  };

  const handleClearMusic = async () => {
    if (!confirm('Are you sure you want to clear all music data? This will delete all artists, albums, songs, and playlists from the database.')) {
      return;
    }
    
    setMusicLoading(true);
    setMusicMessage('');
    try {
      console.log('Music clear: starting request to /api/music/clear');
      const res = await musicAPI.clearMusic();
      console.log('Music clear: response', res);
      if (res?.success) {
        setMusicMessage('Music library cleared successfully. You can now scan to rebuild it.');
      } else {
        setMusicMessage(res?.error || 'Music clear failed.');
      }
    } catch (err) {
      console.error('Music clear failed:', err);
      setMusicMessage(err?.message || 'Music clear failed.');
    } finally {
      setMusicLoading(false);
    }
  };

  const handleConvertAndCleanup = async () => {
    if (!conversionDirectory.trim()) {
      setMusicMessage('Please select a directory first.');
      return;
    }
    
    setConverting(true);
    setMusicMessage('');
    
    try {
      // First, scan the directory to get the list of files
      const scanRes = await musicAPI.scanConversion(conversionDirectory);
      if (scanRes?.success) {
        setConversionScanData(scanRes);
        setShowConversionModal(true);
      } else {
        setMusicMessage(`Error scanning directory: ${scanRes?.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Scan error:', err);
      setMusicMessage(`Error: ${err.message || 'Failed to scan directory'}`);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <h2>Settings</h2>
        </div>

        <div className="settings-tabs">
          <button
            className={activeTab === 'personas' ? 'active' : ''}
            onClick={() => setActiveTab('personas')}
          >
            Personas
          </button>
          <button
            className={activeTab === 'location' ? 'active' : ''}
            onClick={() => setActiveTab('location')}
          >
            Location
          </button>
          <button
            className={activeTab === 'api_keys' ? 'active' : ''}
            onClick={() => setActiveTab('api_keys')}
          >
            API Keys
          </button>
          <button
            className={activeTab === 'music' ? 'active' : ''}
            onClick={() => setActiveTab('music')}
          >
            Music
          </button>
          <button
            className={activeTab === 'videos' ? 'active' : ''}
            onClick={() => setActiveTab('videos')}
          >
            Videos
          </button>
          <button
            className={activeTab === 'scraper' ? 'active' : ''}
            onClick={() => setActiveTab('scraper')}
          >
            Web Scraper
          </button>
          <button
            className={activeTab === 'router' ? 'active' : ''}
            onClick={() => setActiveTab('router')}
          >
            Router
          </button>
          <button
            className={activeTab === 'system' ? 'active' : ''}
            onClick={() => setActiveTab('system')}
          >
            System
          </button>
          <button
            className={activeTab === 'database' ? 'active' : ''}
            onClick={() => setActiveTab('database')}
          >
            Database
          </button>
          <button
            className={activeTab === 'users' ? 'active' : ''}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          <button
            className={activeTab === 'courses' ? 'active' : ''}
            onClick={() => setActiveTab('courses')}
          >
            Courses
          </button>
        </div>

        <div className="settings-content">
          {error && (
            <div className="settings-message error">
              {error}
            </div>
          )}
          {success && (
            <div className="settings-message success">
              {success}
            </div>
          )}

          {activeTab === 'router' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>Router Configuration</h3>
                <div className="settings-panel-actions">
                  <button onClick={addRule} className="save-button" disabled={routerLoading || routerSaving}>
                    + Add Rule
                  </button>
                  <button onClick={saveRouter} className="save-button" disabled={routerSaving || routerLoading}>
                    {routerSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
              {routerError && <div className="settings-message error">{routerError}</div>}
              {routerSuccess && <div className="settings-message success">{routerSuccess}</div>}
              {routerLoading ? (
                <div className="loading">Loading router config...</div>
              ) : (
                <>
              <div className="form-grid">
                <div className="form-group">
                  <label>Model</label>
                  <input value={model} onChange={(e) => setModel(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Temperature</label>
                  <input value={temperature} onChange={(e) => setTemperature(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Top P</label>
                  <input value={topP} onChange={(e) => setTopP(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Max Tokens</label>
                  <input value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>System Prompt (base)</label>
                <textarea
                  value={basePrompt}
                  onChange={(e) => setBasePrompt(e.target.value)}
                  className="config-textarea"
                  rows={6}
                />
              </div>

              <div className="rules-actions">
                <button onClick={addRule} className="save-button" disabled={routerLoading || routerSaving}>
                  + Add Rule
                </button>
              </div>

              <div className="rules-list">
                <div className="rules-header">
                  <span>#</span>
                  <span>Trigger</span>
                  <span>Type</span>
                  <span>Value</span>
                  <span>Reason</span>
                  <span />
                </div>
                {rules.map((rule, idx) => (
                  <div key={idx} className="rule-row">
                    <div className="rule-index">#{idx + 1}</div>
                    <input
                      placeholder="trigger"
                      value={rule.trigger}
                      onChange={(e) => updateRule(idx, 'trigger', e.target.value)}
                    />
                    <input
                      placeholder="type (task|question)"
                      value={rule.type}
                      onChange={(e) => updateRule(idx, 'type', e.target.value)}
                    />
                    <input
                      placeholder="value"
                      value={rule.value}
                      onChange={(e) => updateRule(idx, 'value', e.target.value)}
                    />
                    <input
                      placeholder="reason (why this route applies)"
                      value={rule.reason || ''}
                      onChange={(e) => updateRule(idx, 'reason', e.target.value)}
                    />
                    <button
                      className="delete-button"
                      onClick={() => removeRule(idx)}
                      disabled={rules.length <= 1}
                      title="Remove rule"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="rules-actions bottom">
                <button onClick={saveRouter} className="save-button" disabled={routerSaving || routerLoading}>
                  {routerSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

          {activeTab === 'personas' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>Persona Configurations</h3>
                <button
                  className="create-button"
                  onClick={() => setIsCreating(!isCreating)}
                >
                  {isCreating ? 'Cancel' : '+ New Persona'}
                </button>
              </div>

              {isCreating && (
                <div style={{ 
                  background: 'rgba(255,255,255,0.03)', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: '8px', 
                  padding: '24px', 
                  marginBottom: '24px',
                  maxWidth: '1200px'
                }}>
                  <h4 style={{ color: '#fff', marginBottom: '24px', fontSize: '1.2em', fontWeight: 600 }}>Create New Persona</h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                    <div className="form-group">
                      <label>Persona Name (lowercase, underscores for spaces)</label>
                      <input
                        type="text"
                        placeholder="e.g., my_assistant"
                        value={newPersonaName}
                        onChange={(e) => setNewPersonaName(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                      />
                      <span className="form-help">Internal name for the persona file</span>
                    </div>

                    <div className="form-group">
                      <label>Display Title</label>
                      <input
                        type="text"
                        placeholder="e.g., My Assistant"
                        value={newPersonaFields.title}
                        onChange={(e) => setNewPersonaFields(prev => ({ ...prev, title: e.target.value }))}
                      />
                      <span className="form-help">Display name shown in the UI (optional)</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    <div className="form-group">
                      <label>AI Model</label>
                      <select
                        value={newPersonaFields.model}
                        onChange={(e) => setNewPersonaFields(prev => ({ ...prev, model: e.target.value }))}
                        disabled={modelsLoading}
                      >
                        {modelsLoading ? (
                          <option>Loading models...</option>
                        ) : (
                          aiModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))
                        )}
                      </select>
                      {aiModels.length > 0 && aiModels.find(m => m.id === newPersonaFields.model) && (
                        <span className="form-help">
                          {aiModels.find(m => m.id === newPersonaFields.model).context_window 
                            ? `Context: ${aiModels.find(m => m.id === newPersonaFields.model).context_window.toLocaleString()} tokens`
                            : ''
                          }
                        </span>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Temperature</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={newPersonaFields.temperature}
                        onChange={(e) => setNewPersonaFields(prev => ({ ...prev, temperature: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Top P</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={newPersonaFields.top_p}
                        onChange={(e) => setNewPersonaFields(prev => ({ ...prev, top_p: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Max Tokens</label>
                      <input
                        type="number"
                        value={newPersonaFields.max_tokens}
                        onChange={(e) => setNewPersonaFields(prev => ({ ...prev, max_tokens: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label>System Prompt / Context</label>
                    <textarea
                      value={newPersonaFields.context}
                      onChange={(e) => setNewPersonaFields(prev => ({ ...prev, context: e.target.value }))}
                      className="config-textarea"
                      rows={6}
                      placeholder="Enter the system prompt that defines this persona's behavior..."
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ 
                    marginTop: '24px', 
                    paddingTop: '24px', 
                    borderTop: '1px solid rgba(255,255,255,0.1)' 
                  }}>
                    <h5 style={{ color: '#fff', marginBottom: '16px', fontSize: '1em', fontWeight: 600 }}>
                      Voice Configuration (Optional)
                    </h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label>Fish Audio Voice ID</label>
                        <input
                          type="text"
                          value={newPersonaFields.voice_id}
                          onChange={(e) => setNewPersonaFields(prev => ({ ...prev, voice_id: e.target.value }))}
                          placeholder="Optional - leave empty for text-only"
                        />
                        <span className="form-help">Optional: Fish Audio voice ID for text-to-speech</span>
                      </div>
                      <div className="form-group">
                        <label>Voice Engine</label>
                        <input
                          type="text"
                          value={newPersonaFields.voice_engine}
                          onChange={(e) => setNewPersonaFields(prev => ({ ...prev, voice_engine: e.target.value }))}
                          placeholder="s1"
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    gap: '12px', 
                    marginTop: '24px',
                    paddingTop: '24px',
                    borderTop: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <button
                      onClick={createNewPersona}
                      disabled={saving || !newPersonaName.trim()}
                      className="save-button"
                      style={{ minWidth: '150px' }}
                    >
                      {saving ? 'Creating...' : 'Create Persona'}
                    </button>
                    <button
                      onClick={() => {
                        setIsCreating(false);
                        setNewPersonaName('');
                        setNewPersonaFields({
                          title: '',
                          model: 'claude-sonnet-4-5-20250929',
                          context: '# === System message ===\nYou are an AI assistant.\n\nCRITICAL: Your responses must consist solely of natural, spoken words and basic punctuation. Do NOT use any markdown formatting.\n\n# === Response guidelines ===\n- Be clear and concise\n- Use plain text only\n- Avoid formatting symbols',
                          temperature: 0.6,
                          top_p: 0.9,
                          max_tokens: 650,
                          voice_id: '',
                          voice_engine: 's1'
                        });
                      }}
                      className="save-button"
                      style={{ background: 'rgba(255,255,255,0.1)', minWidth: '100px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="persona-list-settings">
                <select
                  value={selectedPersona || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      loadPersonaConfig(e.target.value);
                    } else {
                      setSelectedPersona(null);
                      setPersonaConfig('');
                    }
                  }}
                  className="persona-select"
                >
                  <option value="">Select a persona to edit...</option>
                  {personas.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.title || p.name}
                    </option>
                  ))}
                </select>
                
                {/* Create New Voice Section */}
                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Create New Voice</h4>
                    <button
                      onClick={() => setIsCreatingVoice(!isCreatingVoice)}
                      className="save-button"
                      style={{ 
                        background: isCreatingVoice ? '#666' : 'rgba(59, 130, 246, 0.8)',
                        padding: '4px 12px',
                        fontSize: '12px'
                      }}
                    >
                      {isCreatingVoice ? 'Cancel' : '+ New Voice'}
                    </button>
                  </div>
                  
                  {isCreatingVoice && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '12px' }}>Persona Name</label>
                        <input
                          type="text"
                          value={newVoiceFields.persona_name}
                          onChange={(e) => setNewVoiceFields(prev => ({ ...prev, persona_name: e.target.value }))}
                          placeholder="e.g., new_voice"
                          style={{ fontSize: '12px', padding: '6px' }}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '12px' }}>Fish Audio ID</label>
                        <input
                          type="text"
                          value={newVoiceFields.fish_audio_id}
                          onChange={(e) => setNewVoiceFields(prev => ({ ...prev, fish_audio_id: e.target.value }))}
                          placeholder="Enter Fish Audio voice ID"
                          style={{ fontSize: '12px', padding: '6px' }}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '12px' }}>Voice Engine</label>
                        <select
                          value={newVoiceFields.voice_engine}
                          onChange={(e) => setNewVoiceFields(prev => ({ ...prev, voice_engine: e.target.value }))}
                          style={{ fontSize: '12px', padding: '6px' }}
                        >
                          <option value="s1">s1 (Standard)</option>
                          <option value="s1-mini">s1-mini (Fast)</option>
                        </select>
                      </div>
                      <button
                        onClick={async () => {
                          if (!newVoiceFields.persona_name.trim() || !newVoiceFields.fish_audio_id.trim()) {
                            setError('Persona name and Fish Audio ID are required');
                            return;
                          }
                          setSaving(true);
                          setError(null);
                          try {
                            await personaAPI.createVoice(newVoiceFields);
                            setSuccess('Voice created successfully');
                            setNewVoiceFields({ persona_name: '', fish_audio_id: '', voice_engine: 's1' });
                            setIsCreatingVoice(false);
                            await loadVoices();
                            setTimeout(() => setSuccess(null), 3000);
                          } catch (err) {
                            setError(err.response?.data?.detail || err.message || 'Failed to create voice');
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving || !newVoiceFields.persona_name.trim() || !newVoiceFields.fish_audio_id.trim()}
                        className="save-button"
                        style={{ 
                          background: (saving || !newVoiceFields.persona_name.trim() || !newVoiceFields.fish_audio_id.trim()) ? '#666' : '#10b981',
                          padding: '6px 12px',
                          fontSize: '12px',
                          marginTop: '4px'
                        }}
                      >
                        {saving ? 'Creating...' : 'Create Voice'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {selectedPersona && (
                <div className="config-editor">
                  <div className="config-editor-header">
                    <span>Editing: {selectedPersona}.config</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={savePersonaConfig}
                        disabled={saving || loading}
                        className="save-button"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={deletePersonaConfig}
                        disabled={saving || loading || selectedPersona === 'default'}
                        className="save-button"
                        style={{ 
                          background: selectedPersona === 'default' ? '#666' : '#dc3545',
                          cursor: selectedPersona === 'default' ? 'not-allowed' : 'pointer'
                        }}
                        title={selectedPersona === 'default' ? 'Cannot delete default persona' : 'Delete this persona'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {loading ? (
                    <div className="loading">Loading config...</div>
                  ) : (
                    <div className="config-form-container">
                      {/* General Section */}
                      <div className="config-section">
                        <h4 className="config-section-title">General</h4>
                        <div className="form-group">
                          <label>Display Title</label>
                          <input
                            type="text"
                            value={personaFields.title || ''}
                            onChange={(e) => updatePersonaField('title', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Persona Image</label>
                          <PersonaImageUpload 
                            personaName={selectedPersona}
                            currentImagePath={personaFields._image_path}
                            onImageUploaded={async () => {
                              // Reload persona config to get updated image_path
                              await loadPersonaConfig(selectedPersona);
                            }}
                          />
                          <span className="form-help">Upload a JPG, JPEG, or PNG image for this persona (max 5MB)</span>
                        </div>
                      </div>

                      {/* Anthropic AI Section */}
                      {personaFields.anthropic && (
                        <div className="config-section">
                          <h4
                            className="config-section-title collapsible"
                            onClick={() => toggleSection('persona-anthropic')}
                          >
                            <span className="collapse-icon">{expandedSections['persona-anthropic'] ? '▼' : '▶'}</span>
                            AI Configuration (Anthropic)
                          </h4>
                          {expandedSections['persona-anthropic'] && (
                          <div>
                          <div className="form-grid">
                            <div className="form-group">
                              <label>Model</label>
                              <select
                                value={personaFields.anthropic.anthropic_model || ''}
                                onChange={(e) => updatePersonaField('anthropic.anthropic_model', e.target.value)}
                                disabled={modelsLoading}
                              >
                                {modelsLoading ? (
                                  <option>Loading models...</option>
                                ) : (
                                  aiModels.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {model.name}
                                    </option>
                                  ))
                                )}
                              </select>
                            </div>
                            <div className="form-group">
                              <label>Temperature</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="2"
                                value={personaFields.anthropic.temperature || 0}
                                onChange={(e) => updatePersonaField('anthropic.temperature', e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label>Top P</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="1"
                                value={personaFields.anthropic.top_p || 0}
                                onChange={(e) => updatePersonaField('anthropic.top_p', e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label>Max Tokens</label>
                              <input
                                type="number"
                                value={personaFields.anthropic.max_tokens || 0}
                                onChange={(e) => updatePersonaField('anthropic.max_tokens', e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label>System Prompt</label>
                            <textarea
                              value={personaFields.anthropic.prompt_context || ''}
                              onChange={(e) => updatePersonaField('anthropic.prompt_context', e.target.value)}
                              className="config-textarea"
                              rows={8}
                            />
                          </div>
                          </div>
                          )}
                        </div>
                      )}

                      {/* Voice Selection Section */}
                      <div className="config-section">
                        <h4 className="config-section-title">Voice Selection</h4>
                        <div>
                          <div className="form-group">
                            <label>Select Voice</label>
                            <select
                              value={selectedVoiceId || ''}
                              onChange={(e) => handleVoiceChange(e.target.value ? parseInt(e.target.value) : null)}
                              className="persona-select"
                            >
                              <option value="">No voice selected</option>
                              {voices.map((voice) => (
                                <option key={voice.id} value={voice.id}>
                                  {voice.persona_name} ({voice.fish_audio_id.substring(0, 8)}...)
                                </option>
                              ))}
                            </select>
                            <span className="field-hint">
                              Select a voice from the voices table. This will link the persona to a voice configuration.
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Filler Audio Section */}
                      {personaFields.filler && (
                        <div className="config-section">
                          <h4 
                            className="config-section-title collapsible" 
                            onClick={() => toggleSection('persona-filler')}
                          >
                            <span className="collapse-icon">{expandedSections['persona-filler'] ? '▼' : '▶'}</span>
                            Filler Audio Files
                          </h4>
                          {expandedSections['persona-filler'] && (
                          <div>
                          {/* Filler Words List */}
                          <div className="filler-words-section" style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <h5 style={{ color: '#fff', marginBottom: '16px', fontSize: '1em', fontWeight: 600 }}>Filler Words</h5>
                            
                            {/* Add New Filler Word */}
                            <div className="form-group" style={{ marginBottom: '20px' }}>
                              <label>Add New Filler Word</label>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                  type="text"
                                  value={newFillerText}
                                  onChange={(e) => setNewFillerText(e.target.value)}
                                  placeholder="Enter text for filler word (e.g., 'let me think')"
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter' && !creatingFiller) {
                                      handleCreateFillerWord();
                                    }
                                  }}
                                  style={{ flex: 1 }}
                                />
                                <button
                                  onClick={handleCreateFillerWord}
                                  disabled={creatingFiller || !newFillerText.trim()}
                                  className="save-button"
                                  style={{ minWidth: '100px' }}
                                >
                                  {creatingFiller ? 'Creating...' : 'Create'}
                                </button>
                              </div>
                              <span className="form-help">Text will be converted to speech using this persona's voice</span>
                            </div>
                            
                            {/* Filler Words List */}
                            {fillerWords.length === 0 ? (
                              <div style={{ color: 'rgba(255,255,255,0.5)', padding: '20px', textAlign: 'center' }}>
                                No filler words yet. Add one above.
                              </div>
                            ) : (
                              <div className="filler-words-list">
                                {fillerWords.map((word, idx) => (
                                  <div key={idx} className="filler-word-item" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    marginBottom: '8px'
                                  }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ color: '#fff', fontWeight: 500, marginBottom: '4px' }}>
                                        {word.text}
                                      </div>
                                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85em' }}>
                                        {word.filename}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      <button
                                        onClick={() => handlePlayFillerWord(selectedPersona, word.filename)}
                                        disabled={playingAudio === word.filename}
                                        className="save-button"
                                        style={{
                                          padding: '6px 12px',
                                          fontSize: '0.9em',
                                          background: playingAudio === word.filename ? '#2563eb' : '#3b82f6',
                                          minWidth: '70px'
                                        }}
                                      >
                                        {playingAudio === word.filename ? 'Playing...' : '▶ Play'}
                                      </button>
                                      <button
                                        onClick={() => handleDeleteFillerWord(selectedPersona, word.filename)}
                                        className="save-button"
                                        style={{
                                          padding: '6px 12px',
                                          fontSize: '0.9em',
                                          background: '#dc3545',
                                          minWidth: '70px'
                                        }}
                                      >
                                        🗑️ Delete
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'location' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>Location Configuration</h3>
                <button
                  onClick={saveLocationConfig}
                  disabled={saving}
                  className="save-button"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
              {success && <div className="settings-message success">{success}</div>}
              {error && <div className="settings-message error">{error}</div>}
              
              <div className="config-form-container">
                <div className="config-section">
                  <h4 className="config-section-title">Location Details</h4>
                  <div className="form-group">
                    <label>City</label>
                    <input
                      type="text"
                      value={locationFields.city || ''}
                      onChange={(e) => updateLocationField('city', e.target.value)}
                      placeholder="e.g., London"
                    />
                    <span className="form-help">Your city or town name</span>
                  </div>
                  <div className="form-group">
                    <label>Region</label>
                    <input
                      type="text"
                      value={locationFields.region || ''}
                      onChange={(e) => updateLocationField('region', e.target.value)}
                      placeholder="e.g., Greater London"
                    />
                    <span className="form-help">County, state, or region</span>
                  </div>
                  <div className="form-group">
                    <label>Postcode</label>
                    <input
                      type="text"
                      value={locationFields.postcode || ''}
                      onChange={(e) => updateLocationField('postcode', e.target.value)}
                      placeholder="e.g., SW1A 1AA"
                    />
                    <span className="form-help">Your postcode or ZIP code</span>
                  </div>
                  <div className="form-group">
                    <label>BBC Weather Location ID (Optional)</label>
                    <input
                      type="text"
                      value={locationFields.location_id || ''}
                      onChange={(e) => updateLocationField('location_id', e.target.value)}
                      placeholder="e.g., 2643743"
                    />
                    <span className="form-help">BBC Weather location ID for weather data. Leave empty to auto-detect from postcode.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api_keys' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>API Keys Configuration</h3>
                <button
                  onClick={saveApiKeysConfig}
                  disabled={saving}
                  className="save-button"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
              <div className="config-form-container">
                {/* Anthropic Section */}
                <div className="config-section">
                  <h4 
                    className="config-section-title collapsible" 
                    onClick={() => toggleSection('api-anthropic')}
                  >
                    <span className="collapse-icon">{expandedSections['api-anthropic'] ? '▼' : '▶'}</span>
                    Anthropic (Claude AI)
                  </h4>
                  {expandedSections['api-anthropic'] && (
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="password"
                      value={apiKeysFields.anthropic?.api_key || ''}
                      onChange={(e) => updateApiKeyField('anthropic.api_key', e.target.value)}
                      placeholder="sk-ant-..."
                    />
                  </div>
                  )}
                </div>

                {/* Perplexity Section */}
                <div className="config-section">
                  <h4 
                    className="config-section-title collapsible" 
                    onClick={() => toggleSection('api-perplexity')}
                  >
                    <span className="collapse-icon">{expandedSections['api-perplexity'] ? '▼' : '▶'}</span>
                    Perplexity AI
                  </h4>
                  {expandedSections['api-perplexity'] && (
                  <div>
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="password"
                      value={apiKeysFields.perplexity?.api_key || ''}
                      onChange={(e) => updateApiKeyField('perplexity.api_key', e.target.value)}
                      placeholder="pplx-..."
                    />
                  </div>
                  </div>
                  )}
                </div>

                {/* Fish Audio Section */}
                <div className="config-section">
                  <h4 
                    className="config-section-title collapsible" 
                    onClick={() => toggleSection('api-fish')}
                  >
                    <span className="collapse-icon">{expandedSections['api-fish'] ? '▼' : '▶'}</span>
                    Fish Audio (Text-to-Speech)
                  </h4>
                  {expandedSections['api-fish'] && (
                  <div>
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="password"
                      value={apiKeysFields.fish_audio?.api_key || ''}
                      onChange={(e) => updateApiKeyField('fish_audio.api_key', e.target.value)}
                      placeholder="Enter Fish Audio API key"
                    />
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Voice ID</label>
                      <input
                        type="text"
                        value={apiKeysFields.fish_audio?.voice_id || ''}
                        onChange={(e) => updateApiKeyField('fish_audio.voice_id', e.target.value)}
                        placeholder="Voice ID"
                      />
                    </div>
                    <div className="form-group">
                      <label>Voice Engine</label>
                      <input
                        type="text"
                        value={apiKeysFields.fish_audio?.voice_engine || ''}
                        onChange={(e) => updateApiKeyField('fish_audio.voice_engine', e.target.value)}
                        placeholder="s1"
                      />
                    </div>
                  </div>
                  </div>
                  )}
                </div>

                {/* TMDB Section */}
                <div className="config-section">
                  <h4
                    className="config-section-title collapsible"
                    onClick={() => toggleSection('api-tmdb')}
                  >
                    <span className="collapse-icon">{expandedSections['api-tmdb'] ? '▼' : '▶'}</span>
                    TMDB (The Movie Database)
                  </h4>
                  {expandedSections['api-tmdb'] && (
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="password"
                      value={apiKeysFields.tmdb?.api_key || ''}
                      onChange={(e) => updateApiKeyField('tmdb.api_key', e.target.value)}
                      placeholder="Enter TMDB API key"
                    />
                    <span className="form-help">Get your API key from <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" style={{color: '#4a9eff'}}>themoviedb.org</a>. Used for fetching movie and TV show metadata including posters and descriptions.</span>
                  </div>
                  )}
                </div>

                {/* BBC Weather Section */}
                <div className="config-section">
                  <h4
                    className="config-section-title collapsible"
                    onClick={() => toggleSection('api-weather')}
                  >
                    <span className="collapse-icon">{expandedSections['api-weather'] ? '▼' : '▶'}</span>
                    BBC Weather
                  </h4>
                  {expandedSections['api-weather'] && (
                  <div>
                  <div className="form-group">
                    <label>Location ID</label>
                    <input
                      type="text"
                      value={apiKeysFields.bbc_weather?.location_id || ''}
                      onChange={(e) => updateApiKeyField('bbc_weather.location_id', e.target.value)}
                      placeholder="2637891"
                    />
                  </div>
                  </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'music' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>Music Configuration</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={saveSystemConfig}
                    disabled={saving}
                    className="save-button"
                  >
                    {saving ? 'Saving...' : 'Save Config'}
                  </button>
                  <button
                    onClick={handleMusicScan}
                    disabled={musicLoading}
                    className="save-button"
                  >
                    {musicLoading ? 'Scanning…' : 'Scan Library'}
                  </button>
                  <button
                    onClick={handleClearMusic}
                    disabled={musicLoading}
                    className="save-button"
                    style={{ background: '#dc3545' }}
                  >
                    Clear Library
                  </button>
                </div>
              </div>
              {musicMessage && <div className="settings-message info">{musicMessage}</div>}
              
              <div className="config-form-container">
                {/* Music Directory Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Music Library Path</h4>
                  <FolderPicker
                    value={systemFields.paths?.music_directory || ''}
                    onChange={(value) => updateSystemField('paths.music_directory', value)}
                    placeholder="/Users/username/Music"
                    label="Music Directory"
                    helpText="Path to your music library folder. Save config before scanning."
                  />
                </div>

                {/* Library Scanning Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Library Management</h4>
                  <p className="settings-help">
                    Scan your music directory for artists, albums, and songs to update the library metadata.
                  </p>
                  <div className="form-group" style={{ marginTop: '12px' }}>
                    <button
                      onClick={async () => {
                        setMusicLoading(true);
                        setMusicMessage('');
                        try {
                          const res = await musicAPI.cleanupInvalidArtists();
                          if (res?.success) {
                            if (res.count > 0) {
                              setMusicMessage(`Cleaned up ${res.count} invalid artist(s): ${res.deleted.join(', ')}`);
                            } else {
                              setMusicMessage('No invalid artists found.');
                            }
                          } else {
                            setMusicMessage(res?.error || 'Cleanup failed.');
                          }
                        } catch (err) {
                          setMusicMessage(err?.message || 'Cleanup failed.');
                        } finally {
                          setMusicLoading(false);
                        }
                      }}
                      disabled={musicLoading}
                      className="save-button"
                      style={{ background: musicLoading ? '#666' : '#f59e0b', marginRight: '12px' }}
                    >
                      {musicLoading ? 'Processing...' : '🧹 Cleanup Invalid Artists'}
                    </button>
                    <span className="form-help" style={{ display: 'inline', marginLeft: '8px' }}>
                      Removes system directories (Music, Downloads, etc.) if accidentally added as artists
                    </span>
                  </div>
                </div>

                {/* Music Conversion Section */}
                <div className="config-section">
                  <h4 className="config-section-title">FLAC to MP3 Conversion & Cleanup</h4>
                  <FolderPicker
                    value={conversionDirectory}
                    onChange={setConversionDirectory}
                    placeholder="/Users/username/Music or C:\Users\username\Music"
                    label="Directory Path"
                    helpText="Enter the full path to the directory containing FLAC files. The tool will recursively convert all .flac files to .mp3 (320kbps) and delete non-image/non-mp3 files. Original FLAC files will be deleted after successful conversion."
                    disabled={converting}
                  />
                  <div className="form-group" style={{ marginTop: '12px' }}>
                    <button
                      onClick={handleConvertAndCleanup}
                      disabled={converting || !conversionDirectory || !conversionDirectory.trim()}
                      className="save-button"
                      style={{ 
                        background: (converting || !conversionDirectory || !conversionDirectory.trim()) ? '#666' : '#3b82f6',
                        minWidth: '200px'
                      }}
                    >
                      {converting ? 'Scanning...' : '🔄 Convert & Cleanup'}
                    </button>
                  </div>
                  {conversionStatus && (
                    <div style={{ 
                      marginTop: '16px', 
                      padding: '12px', 
                      background: 'rgba(59, 130, 246, 0.1)', 
                      borderRadius: '8px',
                      border: '1px solid rgba(59, 130, 246, 0.3)'
                    }}>
                      <div style={{ color: '#fff', marginBottom: '8px', fontWeight: 600 }}>
                        Conversion Results:
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9em' }}>
                        <div>✅ Converted: {conversionStatus.converted} files</div>
                        <div>🗑️ Deleted: {conversionStatus.deleted} files</div>
                        {conversionStatus.errors > 0 && (
                          <div style={{ color: '#fbbf24', marginTop: '8px' }}>
                            ⚠️ Errors: {conversionStatus.errors}
                            {conversionStatus.errorMessages.length > 0 && (
                              <ul style={{ marginTop: '4px', marginLeft: '20px', fontSize: '0.85em' }}>
                                {conversionStatus.errorMessages.map((msg, idx) => (
                                  <li key={idx}>{msg}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cover Art Scanner Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Cover Art Scanner</h4>
                  <FolderPicker
                    value={coverScanDirectory}
                    onChange={setCoverScanDirectory}
                    placeholder="/Users/username/Music or C:\Users\username\Music"
                    label="Music Directory Path"
                    helpText="Enter the path to your music directory. Expected structure: ArtistName/AlbumName/. The scanner will download cover.jpg files for all artists (in ArtistName/) and albums (in ArtistName/AlbumName/), replacing any existing covers."
                    disabled={scanningCovers || downloadingCovers}
                  />
                  <div className="form-group" style={{ marginTop: '12px' }}>
                    <button
                      onClick={async () => {
                        if (!coverScanDirectory.trim()) {
                          setMusicMessage('Please select a directory first.');
                          return;
                        }
                        setScanningCovers(true);
                        setMusicMessage('');
                        try {
                          const scanRes = await musicAPI.scanMissingCovers(coverScanDirectory);
                          if (scanRes?.success) {
                            setCoverScanData(scanRes);
                            setShowCoverModal(true);
                          } else {
                            setMusicMessage(`Error scanning: ${scanRes?.error || 'Unknown error'}`);
                          }
                        } catch (err) {
                          console.error('Scan error:', err);
                          setMusicMessage(`Error: ${err.message || 'Failed to scan directory'}`);
                        } finally {
                          setScanningCovers(false);
                        }
                      }}
                      disabled={scanningCovers || downloadingCovers || !coverScanDirectory || !coverScanDirectory.trim()}
                      className="save-button"
                      style={{ 
                        background: (scanningCovers || downloadingCovers || !coverScanDirectory || !coverScanDirectory.trim()) ? '#666' : '#3b82f6',
                        minWidth: '200px'
                      }}
                    >
                      {scanningCovers ? 'Scanning...' : '🔍 Scan for Missing Covers'}
                    </button>
                  </div>
                </div>

                {/* Music Tools Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Music Tools</h4>
                  <div className="form-group">
                    <button
                      onClick={() => {
                        if (onNavigate) onNavigate('music-editor');
                      }}
                      className="save-button"
                      style={{ marginRight: '12px' }}
                    >
                      🎵 Open Music Editor
                    </button>
                    <button
                      onClick={() => {
                        if (onNavigate) onNavigate('analytics');
                      }}
                      className="save-button"
                    >
                      📊 View Analytics
                    </button>
                  </div>
                  <p className="settings-help">
                    Use the Music Editor to modify artist names, album titles, song titles, and other metadata.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'videos' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>Video Configuration</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={saveSystemConfig}
                    disabled={saving}
                    className="save-button"
                  >
                    {saving ? 'Saving...' : 'Save Config'}
                  </button>
                  <button
                    onClick={async () => {
                      setVideoLoading(true);
                      setVideoMessage('');
                      try {
                        const res = await videoAPI.scanVideos();
                        if (res?.success) {
                          const { results } = res;
                          let message = `Video library scanned successfully! ` +
                            `Movies: ${results.movies}, TV Shows: ${results.tv_shows}, ` +
                            `Seasons: ${results.seasons}, Episodes: ${results.episodes}`;
                          
                          if (results.errors?.length > 0) {
                            message += `\n\nErrors (${results.errors.length}):\n` + results.errors.join('\n');
                          }
                          
                          setVideoMessage(message);
                        } else {
                          setVideoMessage(res?.error || 'Video scan failed.');
                        }
                      } catch (err) {
                        setVideoMessage(err?.response?.data?.detail || err?.message || 'Video scan failed.');
                      } finally {
                        setVideoLoading(false);
                      }
                    }}
                    disabled={videoLoading || !systemFields.paths?.video_directory}
                    className="save-button"
                    style={{ 
                      background: (videoLoading || !systemFields.paths?.video_directory) ? '#666' : '#10b981'
                    }}
                  >
                    {videoLoading ? 'Scanning…' : '🎬 Scan Library'}
                  </button>
                  <button
                    onClick={async () => {
                      if (!systemFields.paths?.video_directory) {
                        setVideoMessage('Please set video directory first.');
                        return;
                      }
                      
                      setVideoConversionScanning(true);
                      setVideoMessage('');
                      
                      try {
                        // First, scan the directory to get the list of files
                        const scanRes = await videoAPI.scanVideoConversion(systemFields.paths.video_directory);
                        if (scanRes?.success) {
                          setVideoConversionScanData(scanRes);
                          setShowVideoConversionModal(true);
                        } else {
                          setVideoMessage(`Error scanning videos: ${scanRes?.error || 'Unknown error'}`);
                        }
                      } catch (err) {
                        console.error('Video scan error:', err);
                        setVideoMessage(`Error: ${err.message || 'Failed to scan videos'}`);
                      } finally {
                        setVideoConversionScanning(false);
                      }
                    }}
                    disabled={videoConversionScanning || !systemFields.paths?.video_directory}
                    className="save-button"
                    style={{ 
                      background: (videoConversionScanning || !systemFields.paths?.video_directory) ? '#666' : '#f59e0b',
                      marginLeft: '10px'
                    }}
                  >
                    {videoConversionScanning ? 'Scanning…' : '🔄 Convert to MP4'}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('Are you sure you want to clear all video data? This will delete all movies, TV shows, seasons, and episodes from the database.')) {
                        return;
                      }
                      setVideoLoading(true);
                      setVideoMessage('');
                      try {
                        const res = await videoAPI.clearVideos();
                        if (res?.success) {
                          setVideoMessage('Video library cleared successfully. You can now scan to rebuild it.');
                        } else {
                          setVideoMessage(res?.error || 'Video clear failed.');
                        }
                      } catch (err) {
                        setVideoMessage(err?.message || 'Video clear failed.');
                      } finally {
                        setVideoLoading(false);
                      }
                    }}
                    disabled={videoLoading}
                    className="save-button"
                    style={{ background: '#dc3545', marginLeft: '10px' }}
                  >
                    Clear Library
                  </button>
                </div>
              </div>
              {videoMessage && <div className="settings-message info">{videoMessage}</div>}
              
              <div className="config-form-container">
                {/* Video Directory Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Video Library Path</h4>
                  <FolderPicker
                    value={systemFields.paths?.video_directory || ''}
                    onChange={(value) => updateSystemField('paths.video_directory', value)}
                    placeholder="/Users/username/Videos"
                    label="Video Directory"
                    helpText="Path to your video library folder containing Movies and Tv subdirectories. Save config before scanning."
                  />
                </div>

                {/* Library Scanning Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Library Structure</h4>
                  <p className="settings-help">
                    Your video directory should contain two subdirectories:
                  </p>
                  <ul className="settings-help" style={{ marginLeft: '20px', marginTop: '8px' }}>
                    <li><strong>Movies/</strong> - Contains movie files (e.g., "The Matrix (1999).mkv")</li>
                    <li><strong>Tv/</strong> - Contains TV show directories:
                      <ul style={{ marginLeft: '20px', marginTop: '4px' }}>
                        <li>ShowName/Season 1/S01E01.mkv</li>
                        <li>ShowName/Season 2/S02E01.mkv</li>
                      </ul>
                    </li>
                  </ul>
                  <p className="settings-help" style={{ marginTop: '12px' }}>
                    Supported formats: MP4, MKV, AVI, MOV, M4V, WMV, FLV, WebM, MPEG, MPG
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scraper' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>Web Scraper</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={saveSystemConfig}
                    disabled={saving}
                    className="save-button"
                  >
                    {saving ? 'Saving...' : 'Save Config'}
                  </button>
                  <button
                    onClick={async () => {
                      setScraperLoading(true);
                      setScraperMessage('');
                      try {
                        const response = await fetch('/api/scraper/run', { method: 'POST' });
                        const result = await response.json();
                        if (result.success) {
                          setScraperMessage(`✓ ${result.message}`);
                          loadScraperSources();
                          // Notify Tech News page to reload articles
                          window.dispatchEvent(new CustomEvent('scraperCompleted', { 
                            detail: { articlesSaved: result.results?.articles_saved || 0 }
                          }));
                        } else {
                          setScraperMessage(`✗ ${result.error || 'Scraping failed'}`);
                        }
                      } catch (err) {
                        setScraperMessage(`✗ Error: ${err.message}`);
                      } finally {
                        setScraperLoading(false);
                      }
                    }}
                    disabled={scraperLoading || scraperClearing}
                    className="save-button"
                  >
                    {scraperLoading ? 'Scraping...' : 'Run Scraper'}
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm('⚠️ This will permanently delete ALL scraped articles from the database. Are you sure?')) {
                        return;
                      }
                      
                      setScraperClearing(true);
                      setScraperMessage('');
                      
                      try {
                        const response = await fetch('/api/scraper/articles', {
                          method: 'DELETE'
                        });
                        const result = await response.json();
                        
                        if (result.success) {
                          setScraperMessage(`✓ ${result.message}`);
                        } else {
                          setScraperMessage(`✗ ${result.error || 'Failed to clear articles'}`);
                        }
                      } catch (err) {
                        setScraperMessage(`✗ Error: ${err.message}`);
                      } finally {
                        setScraperClearing(false);
                      }
                    }}
                    disabled={scraperLoading || scraperClearing}
                    className="save-button"
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      color: '#ef4444'
                    }}
                    onMouseEnter={(e) => {
                      if (!scraperClearing && !scraperLoading) {
                        e.target.style.background = 'rgba(239, 68, 68, 0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'rgba(239, 68, 68, 0.2)';
                    }}
                  >
                    {scraperClearing ? 'Clearing...' : '🗑️ Clear All Articles'}
                  </button>
                </div>
              </div>
              {scraperMessage && <div className="settings-message info">{scraperMessage}</div>}
              
              <div className="config-form-container">
                {/* Images Directory Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Images Directory</h4>
                  <FolderPicker
                    value={systemFields.paths?.scraper_images_directory || ''}
                    onChange={(value) => updateSystemField('paths.scraper_images_directory', value)}
                    placeholder="/Users/username/ScrapedImages"
                    label="Scraper Images Directory"
                    helpText="Path where scraped article images will be saved. Save config before running scraper."
                  />
                </div>

                {/* Sources Management Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Scraper Sources</h4>
                  <p className="settings-help">
                    Add URLs of category/archive pages to scrape. The scraper will find articles on these pages and extract their content and images.
                  </p>
                  
                  {/* Add New Source Form */}
                  <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    <div className="form-group">
                      <label>Source URL</label>
                      <input
                        type="text"
                        value={newSourceUrl}
                        onChange={(e) => setNewSourceUrl(e.target.value)}
                        placeholder="https://example.com/news"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Name (Optional)</label>
                      <input
                        type="text"
                        value={newSourceName}
                        onChange={(e) => setNewSourceName(e.target.value)}
                        placeholder="Example News"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <button
                      onClick={async () => {
                        if (!newSourceUrl.trim()) {
                          setScraperMessage('✗ Please enter a URL');
                          return;
                        }
                        
                        try {
                          const response = await fetch('/api/scraper/sources', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              url: newSourceUrl.trim(),
                              name: newSourceName.trim() || null
                            })
                          });
                          const result = await response.json();
                          
                          if (result.success) {
                            setScraperMessage('✓ Source added successfully');
                            setNewSourceUrl('');
                            setNewSourceName('');
                            loadScraperSources();
                          } else {
                            setScraperMessage(`✗ ${result.error || 'Failed to add source'}`);
                          }
                        } catch (err) {
                          setScraperMessage(`✗ Error: ${err.message}`);
                        }
                      }}
                      className="save-button"
                      style={{ marginTop: '8px' }}
                    >
                      Add Source
                    </button>
                  </div>
                  
                  {/* Sources List */}
                  <div style={{ marginTop: '16px' }}>
                    {scraperSources.length === 0 ? (
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                        No sources added yet. Add a source above to get started.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {scraperSources.map((source) => (
                          <div
                            key={source.id}
                            style={{
                              padding: '12px',
                              background: 'rgba(255,255,255,0.05)',
                              borderRadius: '8px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                                {source.name || 'Unnamed Source'}
                              </div>
                              <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>
                                {source.url}
                              </div>
                              {source.last_scraped && (
                                <div style={{ fontSize: '0.75em', color: 'rgba(255,255,255,0.4)' }}>
                                  Last scraped: {new Date(source.last_scraped).toLocaleString()}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <button
                                onClick={() => {
                                  setScrapingSource(source);
                                  setShowScraperProgress(true);
                                  setScrapingSourceId(source.id);
                                }}
                                disabled={scrapingSourceId === source.id || scraperLoading || !source.is_active}
                                className="save-button"
                                style={{ 
                                  padding: '4px 12px', 
                                  fontSize: '0.85em',
                                  background: (scrapingSourceId === source.id || !source.is_active) ? '#666' : '#10b981'
                                }}
                                title={!source.is_active ? 'Source must be active to scrape' : 'Scrape all articles from this source'}
                              >
                                {scrapingSourceId === source.id ? 'Scraping...' : 'Scrape'}
                              </button>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={source.is_active}
                                  onChange={async (e) => {
                                    try {
                                      const response = await fetch(`/api/scraper/sources/${source.id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ is_active: e.target.checked })
                                      });
                                      const result = await response.json();
                                      if (result.success) {
                                        loadScraperSources();
                                      }
                                    } catch (err) {
                                      console.error('Error toggling source:', err);
                                    }
                                  }}
                                />
                                <span style={{ fontSize: '0.85em' }}>Active</span>
                              </label>
                              <button
                                onClick={async () => {
                                  if (!confirm(`Delete source: ${source.name || source.url}?`)) return;
                                  
                                  try {
                                    const response = await fetch(`/api/scraper/sources/${source.id}`, {
                                      method: 'DELETE'
                                    });
                                    const result = await response.json();
                                    
                                    if (result.success) {
                                      setScraperMessage('✓ Source deleted');
                                      loadScraperSources();
                                    } else {
                                      setScraperMessage(`✗ ${result.error || 'Failed to delete source'}`);
                                    }
                                  } catch (err) {
                                    setScraperMessage(`✗ Error: ${err.message}`);
                                  }
                                }}
                                className="save-button secondary"
                                style={{ padding: '4px 12px', fontSize: '0.85em' }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>System Configuration</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={saveSystemConfig}
                    disabled={saving}
                    className="save-button"
                  >
                    {saving ? 'Saving...' : 'Save Config'}
                  </button>
                  <button
                    className="save-button secondary"
                    onClick={handleRestart}
                    disabled={restarting}
                    title="Restart server and clear caches"
                  >
                    {restarting ? 'Restarting…' : 'Restart Server'}
                  </button>
                </div>
              </div>
              {restartMsg && <div className="settings-message info">{restartMsg}</div>}
              
              <div className="config-form-container">
                {/* Paths Section */}
                <div className="config-section">
                  <h4 
                    className="config-section-title collapsible" 
                    onClick={() => toggleSection('paths')}
                  >
                    <span className="collapse-icon">{expandedSections['paths'] ? '▼' : '▶'}</span>
                    Directory Paths
                  </h4>
                  {expandedSections['paths'] && (
                  <div>
                  <FolderPicker
                    value={systemFields.paths?.audio_directory || ''}
                    onChange={(value) => updateSystemField('paths.audio_directory', value)}
                    placeholder="data/audio"
                    label="Audio Output Directory"
                    helpText="Where generated audio files are stored"
                  />
                  <FolderPicker
                    value={systemFields.paths?.data_directory || ''}
                    onChange={(value) => updateSystemField('paths.data_directory', value)}
                    placeholder="data"
                    label="Data Directory"
                    helpText="Base directory for application data"
                  />
                  </div>
                  )}
                </div>

                {/* Alarm Settings Section */}
                <div className="config-section">
                  <h4 
                    className="config-section-title collapsible" 
                    onClick={() => toggleSection('alarm')}
                  >
                    <span className="collapse-icon">{expandedSections['alarm'] ? '▼' : '▶'}</span>
                    Alarm Settings
                  </h4>
                  {expandedSections['alarm'] && (
                  <div>
                  <FilePicker
                    value={systemFields.alarm_audio_file || ''}
                    onChange={(value) => updateSystemField('alarm_audio_file', value)}
                    placeholder="/path/to/alarm.mp3"
                    label="Default Alarm Audio File"
                    helpText="Path to audio file to play when alarms trigger. Leave empty to use default beep sound."
                    accept="audio/*"
                  />
                  </div>
                  )}
                </div>

                {/* Server Settings Section */}
                <div className="config-section">
                  <h4 
                    className="config-section-title collapsible" 
                    onClick={() => toggleSection('server')}
                  >
                    <span className="collapse-icon">{expandedSections['server'] ? '▼' : '▶'}</span>
                    Server Settings
                  </h4>
                  {expandedSections['server'] && (
                  <div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Host</label>
                      <input
                        type="text"
                        value={systemFields.server?.host || ''}
                        onChange={(e) => updateSystemField('server.host', e.target.value)}
                        placeholder="0.0.0.0"
                      />
                    </div>
                    <div className="form-group">
                      <label>Port</label>
                      <input
                        type="number"
                        value={systemFields.server?.port || ''}
                        onChange={(e) => updateSystemField('server.port', e.target.value)}
                        placeholder="1337"
                      />
                    </div>
                    <div className="form-group">
                      <label>WebSocket Port</label>
                      <input
                        type="number"
                        value={systemFields.server?.websocket_port || ''}
                        onChange={(e) => updateSystemField('server.websocket_port', e.target.value)}
                        placeholder="8765"
                      />
                    </div>
                    <div className="form-group">
                      <label>Log Level</label>
                      <select
                        value={systemFields.server?.log_level || 'INFO'}
                        onChange={(e) => updateSystemField('server.log_level', e.target.value)}
                      >
                        <option value="DEBUG">DEBUG</option>
                        <option value="INFO">INFO</option>
                        <option value="WARNING">WARNING</option>
                        <option value="ERROR">ERROR</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Database URL</label>
                    <input
                      type="text"
                      value={systemFields.server?.database_url || ''}
                      onChange={(e) => updateSystemField('server.database_url', e.target.value)}
                      placeholder="postgresql+asyncpg://user:pass@localhost:5432/dragonfly"
                    />
                    <span className="form-help">PostgreSQL or SQLite database connection string</span>
                  </div>
                  </div>
                  )}
                </div>

                {/* Pre-Context Prompt Section */}
                <div className="config-section">
                  <h4 
                    className="config-section-title collapsible" 
                    onClick={() => toggleSection('pre-context')}
                  >
                    <span className="collapse-icon">{expandedSections['pre-context'] ? '▼' : '▶'}</span>
                    Pre-Context System Prompt (All Personas)
                  </h4>
                  {expandedSections['pre-context'] && (
                  <div>
                  <div className="form-group">
                    <label>
                      Pre-Context Prompt (Optional)
                      <span className="field-hint">
                        This prompt is added before the main system prompt for ALL personas. Use {"{user_name}"} as a placeholder for the user's name.
                      </span>
                    </label>
                    <textarea
                      value={systemFields.pre_context_prompt || ''}
                      onChange={(e) => updateSystemField('pre_context_prompt', e.target.value)}
                      className="config-textarea"
                      rows={6}
                      placeholder="Example: You are chatting with {user_name}. Address them by name when appropriate."
                    />
                    <span className="form-help">
                      This prompt will be prepended to all persona system prompts. The {"{user_name}"} placeholder will be automatically replaced with the actual user's name from the database.
                    </span>
                  </div>
                  <div className="form-group">
                    <label>
                      Max Tokens (for AI Focus Mode and Test Persona)
                      <span className="field-hint">
                        Maximum number of tokens for AI responses in AI Focus Mode and Test Persona modal. Default: 1024
                      </span>
                    </label>
                    <input
                      type="number"
                      value={systemFields.max_tokens || ''}
                      onChange={(e) => updateSystemField('max_tokens', parseInt(e.target.value) || 1024)}
                      className="config-input"
                      min="1"
                      max="4096"
                      placeholder="1024"
                    />
                    <span className="form-help">
                      Controls the maximum length of AI responses in AI Focus Mode and Test Persona modal.
                    </span>
                  </div>
                  </div>
                  )}
                </div>

                {/* AI/Processing Section */}
                <div className="config-section">
                  <h4 
                    className="config-section-title collapsible" 
                    onClick={() => toggleSection('ai')}
                  >
                    <span className="collapse-icon">{expandedSections['ai'] ? '▼' : '▶'}</span>
                    AI & Processing
                  </h4>
                  {expandedSections['ai'] && (
                  <div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Default AI Model</label>
                      <input
                        type="text"
                        value={systemFields.ai?.default_model || ''}
                        onChange={(e) => updateSystemField('ai.default_model', e.target.value)}
                        placeholder="claude-sonnet-4-5-20250929"
                      />
                    </div>
                    <div className="form-group">
                      <label>Max Concurrent Jobs</label>
                      <input
                        type="number"
                        value={systemFields.processing?.max_concurrent_jobs || ''}
                        onChange={(e) => updateSystemField('processing.max_concurrent_jobs', e.target.value)}
                        placeholder="10"
                      />
                    </div>
                    <div className="form-group">
                      <label>Job Timeout (seconds)</label>
                      <input
                        type="number"
                        value={systemFields.processing?.job_timeout || ''}
                        onChange={(e) => updateSystemField('processing.job_timeout', e.target.value)}
                        placeholder="300"
                      />
                    </div>
                  </div>
                  </div>
                  )}
                </div>

                {/* Music Settings Section */}
                <div className="config-section">
                  <h4 
                    className="config-section-title collapsible" 
                    onClick={() => toggleSection('music')}
                  >
                    <span className="collapse-icon">{expandedSections['music'] ? '▼' : '▶'}</span>
                    Music Player Settings
                  </h4>
                  {expandedSections['music'] && (
                  <div>
                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={systemFields.music?.auto_scan_on_startup || false}
                        onChange={(e) => updateSystemField('music.auto_scan_on_startup', e.target.checked)}
                      />
                      <span style={{ marginLeft: '8px' }}>Auto-scan music library on startup</span>
                    </label>
                  </div>
                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={systemFields.music?.cache_album_covers || true}
                        onChange={(e) => updateSystemField('music.cache_album_covers', e.target.checked)}
                      />
                      <span style={{ marginLeft: '8px' }}>Cache album cover images</span>
                    </label>
                  </div>
                </div>
                  )}
                </div>

                {/* Octopus Energy Section */}
                <div className="config-section">
                  <h4 
                    className="config-section-title collapsible" 
                    onClick={() => toggleSection('octopus')}
                  >
                    <span className="collapse-icon">{expandedSections['octopus'] ? '▼' : '▶'}</span>
                    Octopus Energy
                  </h4>
                  {expandedSections['octopus'] && (
                  <div>
                  <div className="form-group">
                    <label>Account Number (Optional - for auto-detection)</label>
                    <input
                      type="text"
                      value={systemFields.octopus?.account_number || ''}
                      onChange={(e) => updateSystemField('octopus.account_number', e.target.value)}
                      placeholder="A-12345678"
                    />
                    <span className="form-help">Your Octopus Energy account number. If provided, tariff codes and meter details will be auto-detected from the account endpoint.</span>
                  </div>
                  <div className="form-group">
                    <label>Meter Point (MPAN)</label>
                    <input
                      type="text"
                      value={systemFields.octopus?.meter_point || ''}
                      onChange={(e) => updateSystemField('octopus.meter_point', e.target.value)}
                      placeholder="2343383923410"
                    />
                    <span className="form-help">Your electricity meter point administration number</span>
                  </div>
                  <div className="form-group">
                    <label>Meter Serial Number</label>
                    <input
                      type="text"
                      value={systemFields.octopus?.meter_serial || ''}
                      onChange={(e) => updateSystemField('octopus.meter_serial', e.target.value)}
                      placeholder="22L4381884"
                    />
                  </div>
                  <div className="form-group">
                    <label>Tariff Code (Optional)</label>
                    <input
                      type="text"
                      value={systemFields.octopus?.tariff_code || ''}
                      onChange={(e) => updateSystemField('octopus.tariff_code', e.target.value)}
                      placeholder="PREPAY-TWIN2-VAR-25-07-01"
                    />
                    <span className="form-help">Leave empty to auto-detect from account endpoint or agreements API, or enter manually if auto-detection fails</span>
                  </div>
                  <div className="form-group">
                    <label>Unit Rate Override (pence per kWh)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={systemFields.octopus?.unit_rate_override || ''}
                      onChange={(e) => updateSystemField('octopus.unit_rate_override', e.target.value ? parseFloat(e.target.value) : '')}
                      placeholder=""
                    />
                    <span className="form-help">If set, this rate will be used instead of fetching from API. Leave empty to use API rate.</span>
                  </div>
                  </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'database' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>Database Management</h3>
              </div>
              {error && <div className="settings-message error">{error}</div>}
              {success && <div className="settings-message success">{success}</div>}
              
              {loading && !tableData && (
                <div className="database-loading-message">
                  Loading tables...
                </div>
              )}
              {!loading && databaseTables.length === 0 && (
                <div className="database-loading-message">
                  No tables found
                </div>
              )}
              {!loading && databaseTables.length > 0 && (
                <div className="database-viewer-layout">
                  {/* Left Column - Table Names */}
                  <div className="database-tables-sidebar">
                    <div className="database-tables-sidebar-header">Tables</div>
                    <div className="database-tables-sidebar-list">
                      {databaseTables.map((table) => (
                        <div
                          key={table.name}
                          onClick={() => {
                            setTablePage(1);
                            setSelectedTable(table.name);
                          }}
                          className={`database-table-item ${selectedTable === table.name ? 'active' : ''}`}
                        >
                          <div className="database-table-item-name">{table.name}</div>
                          <div className="database-table-item-info">
                            {table.row_count} rows
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Column - Table Data */}
                  <div className="database-table-content">
                    {!selectedTable ? (
                      <div className="database-no-selection">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, marginBottom: '16px' }}>
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                          <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                        <div style={{ fontSize: '16px', color: '#666' }}>Select a table to view its data</div>
                      </div>
                    ) : (
                      <div className="database-table-data-container">

                              {loadingTableData && !tableData && (
                                <div className="database-loading-data">
                                  Loading data...
                                </div>
                              )}

                              {!loadingTableData && !tableData && (
                                <div className="database-loading-data">
                                  {error ? `Error: ${error}` : 'No data available'}
                                </div>
                              )}

                              {tableData && (
                                <>
                        {/* Data Table */}
                        {tableData.data && tableData.data.length === 0 ? (
                          <div className="database-loading-data">
                            No data in this table
                          </div>
                        ) : tableData.data && tableData.data.length > 0 ? (
                          <>
                            <div className="database-table-scroll-container">
                              <table className="database-table">
                                <thead>
                                  <tr style={{ borderBottom: '2px solid rgb(32 32 41)' }}>
                                    {tableData.columns.map((col) => (
                                      <th
                                        key={col}
                                        style={{
                                          padding: '12px',
                                          textAlign: 'left',
                                          color: '#fff',
                                          fontWeight: 600,
                                          background: '#1a1a2a'
                                        }}
                                      >
                                        {col}
                                      </th>
                                    ))}
                                    <th style={{ padding: '12px', width: '100px', background: '#1a1a2a' }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tableData.data.map((row, idx) => {
                                    // Find primary key column
                                    const tableInfo = databaseTables.find(t => t.name === selectedTable);
                                    const pkColumn = tableInfo?.columns.find(c => c.primary_key);
                                    const rowId = pkColumn ? row[pkColumn.name] : row[tableData.columns[0]];
                                    const editedRowData = editedRow[rowId] || {};
                                    return (
                                      <tr
                                        key={idx}
                                        className={editingCell?.rowId === rowId ? 'editing' : ''}
                                      >
                                        {tableData.columns.map((col) => {
                                          const isEditing = editingCell?.rowId === rowId && editingCell?.column === col;
                                          const value = editedRowData[col] !== undefined ? editedRowData[col] : row[col];
                                          return (
                                            <td key={col}>
                                              {isEditing ? (
                                                <input
                                                  type="text"
                                                  value={value || ''}
                                                  onChange={(e) => handleCellEdit(rowId, col, e.target.value)}
                                                  onBlur={() => {
                                                    if (editedRowData[col] !== undefined && editedRowData[col] !== row[col]) {
                                                      handleSaveRow(rowId, { [col]: editedRowData[col] });
                                                    } else {
                                                      setEditingCell(null);
                                                    }
                                                  }}
                                                  onKeyPress={(e) => {
                                                    if (e.key === 'Enter') {
                                                      if (editedRowData[col] !== undefined && editedRowData[col] !== row[col]) {
                                                        handleSaveRow(rowId, { [col]: editedRowData[col] });
                                                      } else {
                                                        setEditingCell(null);
                                                      }
                                                    } else if (e.key === 'Escape') {
                                                      setEditingCell(null);
                                                      setEditedRow(prev => {
                                                        const newState = { ...prev };
                                                        if (newState[rowId]) {
                                                          delete newState[rowId][col];
                                                          if (Object.keys(newState[rowId]).length === 0) {
                                                            delete newState[rowId];
                                                          }
                                                        }
                                                        return newState;
                                                      });
                                                    }
                                                  }}
                                                  autoFocus
                                                  style={{
                                                    width: '100%',
                                                    padding: '4px 8px',
                                                    background: 'rgba(255,255,255,0.1)',
                                                    border: '1px solid rgba(59, 130, 246, 0.5)',
                                                    borderRadius: '4px',
                                                    color: '#fff'
                                                  }}
                                                />
                                              ) : (
                                                <div
                                                  onClick={() => {
                                                    const tableInfo = databaseTables.find(t => t.name === selectedTable);
                                                    const colInfo = tableInfo?.columns.find(c => c.name === col);
                                                    if (!colInfo?.primary_key) {
                                                      handleCellEdit(rowId, col, row[col]);
                                                    }
                                                  }}
                                                  style={{
                                                    cursor: (() => {
                                                      const tableInfo = databaseTables.find(t => t.name === selectedTable);
                                                      const colInfo = tableInfo?.columns.find(c => c.name === col);
                                                      return colInfo?.primary_key ? 'default' : 'pointer';
                                                    })(),
                                                    padding: '4px',
                                                    borderRadius: '4px',
                                                    transition: 'background 0.2s'
                                                  }}
                                                  onMouseEnter={(e) => {
                                                    const tableInfo = databaseTables.find(t => t.name === selectedTable);
                                                    const colInfo = tableInfo?.columns.find(c => c.name === col);
                                                    if (!colInfo?.primary_key) {
                                                      e.target.style.background = 'rgba(255,255,255,0.05)';
                                                    }
                                                  }}
                                                  onMouseLeave={(e) => {
                                                    e.target.style.background = 'transparent';
                                                  }}
                                                >
                                                  {value !== null && value !== undefined ? String(value).substring(0, 100) : 'NULL'}
                                                </div>
                                              )}
                                            </td>
                                          );
                                        })}
                                        <td style={{ padding: '8px' }}>
                                          {editingCell?.rowId === rowId ? (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                              <button
                                                onClick={() => {
                                                  const changes = editedRowData;
                                                  const hasChanges = Object.keys(changes).some(key => changes[key] !== row[key]);
                                                  if (hasChanges) {
                                                    handleSaveRow(rowId, changes);
                                                  } else {
                                                    setEditingCell(null);
                                                  }
                                                }}
                                                className="save-button"
                                                style={{ padding: '4px 8px', fontSize: '0.85em', minWidth: '50px' }}
                                                disabled={saving}
                                              >
                                                {saving ? 'Saving...' : 'Save'}
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setEditingCell(null);
                                                  setEditedRow(prev => {
                                                    const newState = { ...prev };
                                                    delete newState[rowId];
                                                    return newState;
                                                  });
                                                }}
                                                className="save-button"
                                                style={{ padding: '4px 8px', fontSize: '0.85em', minWidth: '50px', background: 'rgba(255,255,255,0.1)' }}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                // Start editing mode - click any non-PK cell to edit
                                                const firstEditableCol = tableData.columns.find(col => {
                                                  const colInfo = tableInfo?.columns.find(c => c.name === col);
                                                  return !colInfo?.primary_key;
                                                });
                                                if (firstEditableCol) {
                                                  handleCellEdit(rowId, firstEditableCol, row[firstEditableCol]);
                                                }
                                              }}
                                              className="save-button"
                                              style={{ padding: '4px 8px', fontSize: '0.85em', minWidth: '60px', background: 'rgba(255,255,255,0.1)' }}
                                            >
                                              Edit
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Pagination */}
                            {tableData.pagination && (
                              <div className="database-pagination">
                                <span className="database-pagination-info">
                                  Showing {((tableData.pagination.page - 1) * tableLimit) + 1} - {Math.min(tableData.pagination.page * tableLimit, tableData.pagination.total_rows)} of {tableData.pagination.total_rows} rows
                                </span>
                                <div className="database-pagination-controls">
                                  <button
                                    onClick={() => setTablePage(1)}
                                    disabled={tableData.pagination.page === 1}
                                    className="save-button database-pagination-button"
                                    title="First page"
                                  >
                                    ⟪
                                  </button>
                                  <button
                                    onClick={() => setTablePage(p => Math.max(1, p - 1))}
                                    disabled={tableData.pagination.page === 1}
                                    className="save-button database-pagination-button"
                                    title="Previous page"
                                  >
                                    ‹
                                  </button>
                                  <div className="database-pagination-page-input">
                                    <span>Page</span>
                                    <input
                                      type="number"
                                      min="1"
                                      max={tableData.pagination.total_pages}
                                      value={tableData.pagination.page}
                                      onChange={(e) => {
                                        const page = parseInt(e.target.value);
                                        if (page >= 1 && page <= tableData.pagination.total_pages) {
                                          setTablePage(page);
                                        }
                                      }}
                                      className="database-pagination-input"
                                    />
                                    <span>of {tableData.pagination.total_pages}</span>
                                  </div>
                                  <button
                                    onClick={() => setTablePage(p => Math.min(tableData.pagination.total_pages, p + 1))}
                                    disabled={tableData.pagination.page === tableData.pagination.total_pages}
                                    className="save-button database-pagination-button"
                                    title="Next page"
                                  >
                                    ›
                                  </button>
                                  <button
                                    onClick={() => setTablePage(tableData.pagination.total_pages)}
                                    disabled={tableData.pagination.page === tableData.pagination.total_pages}
                                    className="save-button database-pagination-button"
                                    title="Last page"
                                  >
                                    ⟫
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        ) : null}
                                </>
                              )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <UserManagementPanel onNavigate={onNavigate} />
          )}

          {activeTab === 'courses' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>Course Generation Settings</h3>
                <button
                  onClick={saveCourseSettings}
                  disabled={saving}
                  className="save-button"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>

              <div className="config-form-container">
                <div className="form-group">
                  <label>
                    Course Outline Generation Prompt
                    <span className="field-hint">
                      The prompt template used to generate course outlines. Use {"{prompt}"} for the user's learning request.
                    </span>
                  </label>
                  <textarea
                    value={courseSettings.outline_prompt || ''}
                    onChange={(e) => setCourseSettings({ ...courseSettings, outline_prompt: e.target.value })}
                    className="config-textarea"
                    rows={20}
                    placeholder="You are an educational course designer..."
                  />
                  <span className="form-help">
                    This prompt is sent to the AI to generate course outlines. The {"{prompt}"} placeholder will be replaced with the user's learning request.
                  </span>
                </div>

                <div className="form-group">
                  <label>
                    Lesson Generation Prompt
                    <span className="field-hint">
                      The prompt template used to generate lessons. Use {"{course_title}"}, {"{section_title}"}, and {"{section_summary}"} as placeholders.
                    </span>
                  </label>
                  <textarea
                    value={courseSettings.lesson_prompt || ''}
                    onChange={(e) => setCourseSettings({ ...courseSettings, lesson_prompt: e.target.value })}
                    className="config-textarea"
                    rows={20}
                    placeholder="Create a detailed, beginner-friendly lesson..."
                  />
                  <span className="form-help">
                    This prompt is sent to the AI to generate lessons. Available variables: {"{course_title}"}, {"{section_title}"}, {"{section_summary}"}.
                  </span>
                  <div style={{ marginTop: '8px', padding: '12px', background: 'rgba(102, 126, 234, 0.1)', borderRadius: '8px', fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.8)' }}>
                    <strong>Example usage:</strong><br/>
                    Course: {"{course_title}"}<br/>
                    Section: {"{section_title}"}<br/>
                    Summary: {"{section_summary}"}<br/>
                    <br/>
                    Generate a lesson based on the summary above...
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>
                      Outline Max Tokens
                      <span className="field-hint">
                        Maximum tokens for course outline generation (default: 2048)
                      </span>
                    </label>
                    <input
                      type="number"
                      value={courseSettings.outline_max_tokens || 2048}
                      onChange={(e) => setCourseSettings({ ...courseSettings, outline_max_tokens: parseInt(e.target.value) || 2048 })}
                      className="config-input"
                      min="256"
                      max="8192"
                      placeholder="2048"
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Lesson Max Tokens
                      <span className="field-hint">
                        Maximum tokens for lesson generation (default: 4096)
                      </span>
                    </label>
                    <input
                      type="number"
                      value={courseSettings.lesson_max_tokens || 4096}
                      onChange={(e) => setCourseSettings({ ...courseSettings, lesson_max_tokens: parseInt(e.target.value) || 4096 })}
                      className="config-input"
                      min="512"
                      max="16384"
                      placeholder="4096"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConversionProgressModal
        isOpen={showConversionModal}
        onClose={() => {
          setShowConversionModal(false);
          setConversionScanData(null);
        }}
        directoryPath={conversionDirectory}
        scanData={conversionScanData}
      />

      <VideoConversionModal
        isOpen={showVideoConversionModal}
        onClose={() => {
          setShowVideoConversionModal(false);
          setVideoConversionScanData(null);
        }}
        videoDirectory={systemFields.paths?.video_directory}
        scanData={videoConversionScanData}
      />

      <CoverArtModal
        isOpen={showCoverModal}
        onClose={() => {
          setShowCoverModal(false);
          setCoverScanData(null);
        }}
        directoryPath={coverScanDirectory}
        scanData={coverScanData}
      />
    </div>
  );
}
