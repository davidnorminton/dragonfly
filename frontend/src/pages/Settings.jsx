import { useState, useEffect, useRef, useCallback } from 'react';
import { configAPI, systemAPI, routerAPI, musicAPI, personaAPI, databaseAPI } from '../services/api';
import { useRouterConfig } from '../hooks/useRouterConfig';

export function SettingsPage({ onNavigate }) {
  const [activeTab, setActiveTab] = useState('personas');
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [personaConfig, setPersonaConfig] = useState('');
  const [personaFields, setPersonaFields] = useState({});
  const [newPersonaName, setNewPersonaName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
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
  const [systemConfig, setSystemConfig] = useState('');
  const [systemFields, setSystemFields] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [locationFields, setLocationFields] = useState({});
  const [fillerWords, setFillerWords] = useState([]);
  const [newFillerText, setNewFillerText] = useState('');
  const [creatingFiller, setCreatingFiller] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [databaseTables, setDatabaseTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [tablePage, setTablePage] = useState(1);
  const [tableLimit] = useState(15);
  const [editingCell, setEditingCell] = useState(null);
  const [editedRow, setEditedRow] = useState({});
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
    loadLocationConfig();
    loadApiKeysConfig();
    loadSystemConfig();
    if (activeTab === 'database') {
      loadDatabaseTables();
    }
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
      
      // Load filler words
      await loadFillerWords(personaName);
    } catch (err) {
      console.error('Error loading persona config:', err);
      setError(`Failed to load config for ${personaName}`);
    } finally {
      setLoading(false);
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

  const createNewPersona = async () => {
    if (!newPersonaName.trim()) {
      setError('Persona name is required');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Create a default persona config based on the structure
      const defaultConfig = {
        "title": newPersonaName.charAt(0).toUpperCase() + newPersonaName.slice(1),
        "anthropic": {
          "anthropic_model": "claude-3-5-haiku-20241022",
          "prompt_context": "# === System message ===\nYou are an AI assistant.\n\nCRITICAL: Your responses must consist solely of natural, spoken words and basic punctuation. Do NOT use any markdown formatting.\n\n# === Response guidelines ===\n- Be clear and concise\n- Use plain text only\n- Avoid formatting symbols",
          "temperature": 0.6,
          "top_p": 0.9,
          "max_tokens": 650
        },
        "fish_audio": {
          "voice_id": "f19179ec09af4963bb6c4f7359af8d1e",
          "voice_engine": "s1"
        },
        "filler": {
          "answer_question": "let_me_check_my_data_stores.mp3",
          "wake_word_confirmation": "yes.mp3",
          "translating": "translating.mp3"
        }
      };

      await configAPI.createPersona(newPersonaName, defaultConfig);
      setSuccess(`Created persona ${newPersonaName} successfully`);
      setNewPersonaName('');
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
      await configAPI.saveSystemConfig(systemFields);
      setSuccess('System config saved successfully');
    } catch (err) {
      console.error('Error saving system config:', err);
      setError(err.message || 'Failed to save config.');
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
                <div className="create-persona-form">
                  <input
                    type="text"
                    placeholder="Persona name (e.g., my_ai)"
                    value={newPersonaName}
                    onChange={(e) => setNewPersonaName(e.target.value)}
                    className="persona-name-input"
                  />
                  <button
                    onClick={createNewPersona}
                    disabled={saving || !newPersonaName.trim()}
                    className="save-button"
                  >
                    {saving ? 'Creating...' : 'Create Persona'}
                  </button>
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
              </div>

              {selectedPersona && (
                <div className="config-editor">
                  <div className="config-editor-header">
                    <span>Editing: {selectedPersona}.config</span>
                    <button
                      onClick={savePersonaConfig}
                      disabled={saving || loading}
                      className="save-button"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
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
                              <input
                                type="text"
                                value={personaFields.anthropic.anthropic_model || ''}
                                onChange={(e) => updatePersonaField('anthropic.anthropic_model', e.target.value)}
                              />
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

                      {/* Fish Audio Section */}
                      {personaFields.fish_audio && (
                        <div className="config-section">
                          <h4 
                            className="config-section-title collapsible" 
                            onClick={() => toggleSection('persona-fish')}
                          >
                            <span className="collapse-icon">{expandedSections['persona-fish'] ? '▼' : '▶'}</span>
                            Voice Configuration (Fish Audio)
                          </h4>
                          {expandedSections['persona-fish'] && (
                          <div>
                          <div className="form-grid">
                            <div className="form-group">
                              <label>Voice ID</label>
                              <input
                                type="text"
                                value={personaFields.fish_audio.voice_id || ''}
                                onChange={(e) => updatePersonaField('fish_audio.voice_id', e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label>Voice Engine</label>
                              <input
                                type="text"
                                value={personaFields.fish_audio.voice_engine || ''}
                                onChange={(e) => updatePersonaField('fish_audio.voice_engine', e.target.value)}
                              />
                            </div>
                          </div>
                          </div>
                          )}
                        </div>
                      )}

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
                  <div className="form-group">
                    <label>Music Directory</label>
                    <input
                      type="text"
                      value={systemFields.paths?.music_directory || ''}
                      onChange={(e) => updateSystemField('paths.music_directory', e.target.value)}
                      placeholder="/Users/username/Music"
                    />
                    <span className="form-help">Path to your music library folder. Save config before scanning.</span>
                  </div>
                </div>

                {/* Library Scanning Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Library Management</h4>
                  <p className="settings-help">
                    Scan your music directory for artists, albums, and songs to update the library metadata.
                  </p>
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
                  <div className="form-group">
                    <label>Audio Output Directory</label>
                    <input
                      type="text"
                      value={systemFields.paths?.audio_directory || ''}
                      onChange={(e) => updateSystemField('paths.audio_directory', e.target.value)}
                      placeholder="data/audio"
                    />
                    <span className="form-help">Where generated audio files are stored</span>
                  </div>
                  <div className="form-group">
                    <label>Data Directory</label>
                    <input
                      type="text"
                      value={systemFields.paths?.data_directory || ''}
                      onChange={(e) => updateSystemField('paths.data_directory', e.target.value)}
                      placeholder="data"
                    />
                    <span className="form-help">Base directory for application data</span>
                  </div>
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
                  <div className="form-group">
                    <label>Default Alarm Audio File</label>
                    <input
                      type="text"
                      value={systemFields.alarm_audio_file || ''}
                      onChange={(e) => updateSystemField('alarm_audio_file', e.target.value)}
                      placeholder="/path/to/alarm.mp3"
                    />
                    <span className="form-help">Path to audio file to play when alarms trigger. Leave empty to use default beep sound.</span>
                  </div>
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
                        placeholder="claude-3-5-haiku-20241022"
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
                <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                  Loading tables...
                </div>
              )}
              {!loading && databaseTables.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                  No tables found
                </div>
              )}
              {!loading && databaseTables.length > 0 && (
                <div className="database-tables-list" style={{ display: 'grid', gap: '12px', padding: '20px' }}>
                      {databaseTables.map((table) => (
                        <div key={table.name}>
                          <div
                            onClick={() => {
                              if (selectedTable === table.name) {
                                setSelectedTable(null);
                                setTableData(null);
                              } else {
                                setTablePage(1);
                                setSelectedTable(table.name);
                              }
                            }}
                            className={`database-table-card ${selectedTable === table.name ? 'active' : ''}`}
                            style={{
                              padding: '16px',
                              background: selectedTable === table.name 
                                ? 'rgba(59, 130, 246, 0.2)' 
                                : 'rgba(255, 255, 255, 0.03)',
                              border: `1px solid ${selectedTable === table.name ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                                  {table.name}
                                </div>
                                <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.5)' }}>
                                  {table.row_count} rows • {table.columns.length} columns
                                </div>
                              </div>
                              <div style={{ fontSize: '0.9em', color: 'rgba(255,255,255,0.4)' }}>
                                {selectedTable === table.name ? '▼' : '→'}
                              </div>
                            </div>
                          </div>
                          
                          {/* Table Data View - Inline below the clicked table */}
                          {selectedTable === table.name && (
                            <div style={{ 
                              marginTop: '12px',
                              padding: '16px',
                              background: 'rgba(0,0,0,0.3)',
                              borderRadius: '8px',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              overflow: 'hidden'
                            }}>

                              {loadingTableData && !tableData && (
                                <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                  Loading data...
                                </div>
                              )}

                              {!loadingTableData && !tableData && (
                                <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                  {error ? `Error: ${error}` : 'No data available'}
                                </div>
                              )}

                              {tableData && (
                                <div className="database-table-view">
                        {/* Data Table */}
                        {tableData.data && tableData.data.length === 0 ? (
                          <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                            No data in this table
                          </div>
                        ) : tableData.data && tableData.data.length > 0 ? (
                          <>
                            <div style={{ 
                              overflowX: 'auto', 
                              marginBottom: '16px',
                              maxWidth: '100%',
                              WebkitOverflowScrolling: 'touch'
                            }}>
                              <table style={{ 
                                width: '100%', 
                                minWidth: '600px',
                                borderCollapse: 'collapse', 
                                fontSize: '0.9em' 
                              }}>
                                <thead>
                                  <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                                    {tableData.columns.map((col) => (
                                      <th
                                        key={col}
                                        style={{
                                          padding: '12px',
                                          textAlign: 'left',
                                          color: '#fff',
                                          fontWeight: 600,
                                          background: 'rgba(255,255,255,0.05)'
                                        }}
                                      >
                                        {col}
                                      </th>
                                    ))}
                                    <th style={{ padding: '12px', width: '100px' }}></th>
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
                                        style={{
                                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                                          background: editingCell?.rowId === rowId ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
                                        }}
                                      >
                                        {tableData.columns.map((col) => {
                                          const isEditing = editingCell?.rowId === rowId && editingCell?.column === col;
                                          const value = editedRowData[col] !== undefined ? editedRowData[col] : row[col];
                                          return (
                                            <td
                                              key={col}
                                              style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.8)' }}
                                            >
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
                            {tableData.pagination.total_pages > 1 && (
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
                                <button
                                  onClick={() => setTablePage(p => Math.max(1, p - 1))}
                                  disabled={tableData.pagination.page === 1}
                                  className="save-button"
                                  style={{ padding: '6px 12px', fontSize: '0.9em' }}
                                >
                                  ← Previous
                                </button>
                                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9em' }}>
                                  Page {tableData.pagination.page} of {tableData.pagination.total_pages}
                                  {' '}({tableData.pagination.total_rows} total rows)
                                </span>
                                <button
                                  onClick={() => setTablePage(p => Math.min(tableData.pagination.total_pages, p + 1))}
                                  disabled={tableData.pagination.page === tableData.pagination.total_pages}
                                  className="save-button"
                                  style={{ padding: '6px 12px', fontSize: '0.9em' }}
                                >
                                  Next →
                                </button>
                              </div>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
