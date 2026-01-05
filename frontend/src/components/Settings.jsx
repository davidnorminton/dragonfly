import { useState, useEffect } from 'react';
import { configAPI, systemAPI, routerAPI } from '../services/api';
import { useRouterConfig } from '../hooks/useRouterConfig';

export function Settings({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('personas');
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [personaConfig, setPersonaConfig] = useState('');
  const [newPersonaName, setNewPersonaName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [locationConfig, setLocationConfig] = useState('');
  const [apiKeysConfig, setApiKeysConfig] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState('');
  const [activeRouterTab, setActiveRouterTab] = useState('router');
  const {
    routerConfig,
    setRouterConfig,
    loading: routerLoading,
    error: routerError,
    saving: routerSaving,
    success: routerSuccess,
    saveRouter,
    addRule,
  } = useRouterConfig(activeRouterTab === 'router' && open);

  useEffect(() => {
    if (open) {
      loadPersonas();
      loadLocationConfig();
      loadApiKeysConfig();
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
    } catch (err) {
      console.error('Error loading API keys config:', err);
    }
  };

  const savePersonaConfig = async () => {
    if (!selectedPersona) return;
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const config = JSON.parse(personaConfig);
      await configAPI.savePersonaConfig(selectedPersona, config);
      setSuccess(`Saved ${selectedPersona} config successfully`);
      await loadPersonas();
    } catch (err) {
      console.error('Error saving persona config:', err);
      setError(err.message || 'Failed to save config. Check JSON syntax.');
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
      const config = JSON.parse(apiKeysConfig);
      await configAPI.saveApiKeysConfig(config);
      setSuccess('API keys config saved successfully');
    } catch (err) {
      console.error('Error saving API keys config:', err);
      setError(err.message || 'Failed to save config. Check JSON syntax.');
    } finally {
      setSaving(false);
    }
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
            className={activeTab === 'router' ? 'active' : ''}
            onClick={() => setActiveTab('router')}
          >
            Router
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

          <div className="settings-panel">
            <div className="settings-panel-header">
              <h3>System</h3>
              <button
                className="save-button"
                onClick={handleRestart}
                disabled={restarting}
                title="Restart server and clear caches"
              >
                {restarting ? 'Restarting…' : 'Restart Server'}
              </button>
            </div>
            {restartMsg && (
              <div className="settings-message info">
                {restartMsg}
              </div>
            )}
          </div>

          {activeTab === 'router' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h3>Router Configuration</h3>
                <div className="settings-panel-actions">
                  <button onClick={addRule} className="save-button" disabled={routerLoading || routerSaving}>
                    Add Rule Snippet
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
                <textarea
                  value={routerConfig}
                  onChange={(e) => setRouterConfig(e.target.value)}
                  className="config-textarea"
                  rows={20}
                />
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
                    <textarea
                      value={personaConfig}
                      onChange={(e) => setPersonaConfig(e.target.value)}
                      className="config-textarea"
                      rows={20}
                    />
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
              <textarea
                value={apiKeysConfig}
                onChange={(e) => setApiKeysConfig(e.target.value)}
                className="config-textarea"
                rows={15}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

