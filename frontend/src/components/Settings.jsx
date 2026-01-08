import { useState, useEffect } from 'react';
import { configAPI, systemAPI, routerAPI, musicAPI } from '../services/api';
import { useRouterConfig } from '../hooks/useRouterConfig';

export function Settings({ open, onClose, onNavigate }) {
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
  } = useRouterConfig(activeRouterTab === 'router' && open);

  useEffect(() => {
    if (open) {
      loadPersonas();
      loadLocationConfig();
      loadApiKeysConfig();
      loadSystemConfig();
    }
  }, [open]);

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
    } catch (err) {
      console.error('Error loading persona config:', err);
      setError(`Failed to load config for ${personaName}`);
    } finally {
      setLoading(false);
    }
  };

  const loadLocationConfig = async () => {
    try {
      const data = await configAPI.getLocationConfig();
      setLocationConfig(JSON.stringify(data, null, 2));
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

  if (!open) return null;

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
    <div className={`modal-overlay ${open ? 'active' : ''}`} onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>×</button>
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
                          <h4 className="config-section-title">AI Configuration (Anthropic)</h4>
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

                      {/* Fish Audio Section */}
                      {personaFields.fish_audio && (
                        <div className="config-section">
                          <h4 className="config-section-title">Voice Configuration (Fish Audio)</h4>
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

                      {/* Filler Audio Section */}
                      {personaFields.filler && (
                        <div className="config-section">
                          <h4 className="config-section-title">Filler Audio Files</h4>
                          <div className="form-grid">
                            <div className="form-group">
                              <label>Answer Question</label>
                              <input
                                type="text"
                                value={personaFields.filler.answer_question || ''}
                                onChange={(e) => updatePersonaField('filler.answer_question', e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label>Wake Word Confirmation</label>
                              <input
                                type="text"
                                value={personaFields.filler.wake_word_confirmation || ''}
                                onChange={(e) => updatePersonaField('filler.wake_word_confirmation', e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label>Translating</label>
                              <input
                                type="text"
                                value={personaFields.filler.translating || ''}
                                onChange={(e) => updatePersonaField('filler.translating', e.target.value)}
                              />
                            </div>
                          </div>
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
              <textarea
                value={locationConfig}
                onChange={(e) => setLocationConfig(e.target.value)}
                className="config-textarea"
                rows={15}
              />
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
                  <h4 className="config-section-title">Anthropic (Claude AI)</h4>
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="password"
                      value={apiKeysFields.anthropic?.api_key || ''}
                      onChange={(e) => updateApiKeyField('anthropic.api_key', e.target.value)}
                      placeholder="sk-ant-..."
                    />
                  </div>
                </div>

                {/* Perplexity Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Perplexity AI</h4>
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

                {/* Fish Audio Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Fish Audio (Text-to-Speech)</h4>
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

                {/* BBC Weather Section */}
                <div className="config-section">
                  <h4 className="config-section-title">BBC Weather</h4>
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
              </div>
            </div>
          )}

          {activeTab === 'music' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>Music</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
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
              <p className="settings-help">
                Scan `/Users/davidnorminton/Music` for artists, albums, and songs, updating the library metadata.
              </p>
              
              <div className="settings-section" style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ marginBottom: '12px', color: '#fff' }}>Music Library Editor</h4>
                <p className="settings-help" style={{ marginBottom: '12px' }}>
                  Edit artist names, album titles, song titles, and other metadata for your music library.
                </p>
                <button
                  onClick={() => {
                    if (onNavigate) onNavigate('music-editor');
                    onClose();
                  }}
                  className="save-button"
                >
                  Open Music Editor
                </button>
                <button
                  onClick={() => {
                    if (onNavigate) onNavigate('analytics');
                    onClose();
                  }}
                  className="save-button"
                  style={{ marginTop: '12px' }}
                >
                  📊 View Analytics
                </button>
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
                  <h4 className="config-section-title">Directory Paths</h4>
                  <div className="form-group">
                    <label>Music Directory</label>
                    <input
                      type="text"
                      value={systemFields.paths?.music_directory || ''}
                      onChange={(e) => updateSystemField('paths.music_directory', e.target.value)}
                      placeholder="/Users/username/Music"
                    />
                    <span className="form-help">Path to your music library folder</span>
                  </div>
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

                {/* Server Settings Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Server Settings</h4>
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

                {/* AI/Processing Section */}
                <div className="config-section">
                  <h4 className="config-section-title">AI & Processing</h4>
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

                {/* Music Settings Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Music Player Settings</h4>
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

                {/* Octopus Energy Section */}
                <div className="config-section">
                  <h4 className="config-section-title">Octopus Energy</h4>
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

