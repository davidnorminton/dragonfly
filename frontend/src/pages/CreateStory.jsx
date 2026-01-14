import { useState, useEffect } from 'react';
import { usePersonas } from '../hooks/usePersonas';
import { getPersonaImageUrl } from '../utils/personaImageHelper';
import { personaAPI, storyAPI, aiAPI } from '../services/api';

export function CreateStoryPage({ onNavigate, selectedUser, storyId, editMode = false }) {
  const { personas, loading: personasLoading } = usePersonas(selectedUser?.id);
  const [plot, setPlot] = useState('');
  const [selectedPersonas, setSelectedPersonas] = useState([]);
  const [selectedNarrator, setSelectedNarrator] = useState(null); // Single narrator persona name
  const [editingPersona, setEditingPersona] = useState(null);
  const [personaContexts, setPersonaContexts] = useState({}); // {personaName: customContext}
  const [loadingContext, setLoadingContext] = useState(false);
  const [storyTitle, setStoryTitle] = useState('');
  const [generatingScreenplay, setGeneratingScreenplay] = useState(false);
  const [screenplay, setScreenplay] = useState('');
  const [screenplayData, setScreenplayData] = useState(null); // Parsed JSON data
  const [screenplayError, setScreenplayError] = useState(null);
  const [savingStory, setSavingStory] = useState(false);
  const [storySaved, setStorySaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [loadingStory, setLoadingStory] = useState(false);

  // Load story data when in edit mode
  useEffect(() => {
    if (editMode && storyId) {
      loadStoryData();
    }
  }, [editMode, storyId]);

  const loadStoryData = async () => {
    setLoadingStory(true);
    try {
      const result = await storyAPI.getStory(storyId);
      console.log('[CreateStory] Loaded story data:', result);
      
      if (result && result.success !== false && result.story) {
        const story = result.story;
        
        // Set basic fields
        setStoryTitle(story.title || '');
        setPlot(story.plot_details || story.plot?.details || '');
        setSelectedNarrator(story.narrator_persona || null);
        
        // Set selected personas and their contexts
        if (story.cast && Array.isArray(story.cast)) {
          const personaNames = story.cast.map(c => c.persona_name);
          setSelectedPersonas(personaNames);
          
          // Set persona contexts
          const contexts = {};
          story.cast.forEach(c => {
            if (c.persona_name && c.custom_context) {
              contexts[c.persona_name] = c.custom_context;
            }
          });
          setPersonaContexts(contexts);
        }
        
        // Load screenplay if available
        if (story.screenplay) {
          console.log('[CreateStory] Loading screenplay from story:', {
            type: typeof story.screenplay,
            length: story.screenplay?.length || 0,
            preview: story.screenplay?.substring(0, 100) || ''
          });
          try {
            const screenplayJson = typeof story.screenplay === 'string' 
              ? JSON.parse(story.screenplay) 
              : story.screenplay;
            
            console.log('[CreateStory] Parsed screenplay JSON:', {
              hasScript: !!screenplayJson.script,
              scriptLength: screenplayJson.script?.length || 0
            });
            
            setScreenplayData(screenplayJson);
            
            // Format for display - create formatted text from script array
            let formattedText = '';
            if (screenplayJson.script && Array.isArray(screenplayJson.script)) {
              screenplayJson.script.forEach((item, index) => {
                const speaker = item.speaker || 'unknown';
                const text = item.text || '';
                formattedText += `[${index + 1}] ${speaker.toUpperCase()}\n`;
                formattedText += `${text}\n\n`;
              });
            }
            setScreenplay(formattedText.trim());
            console.log('[CreateStory] Screenplay loaded and formatted:', formattedText.length, 'chars');
          } catch (e) {
            console.error('[CreateStory] Error parsing screenplay:', e);
            console.error('[CreateStory] Raw screenplay:', story.screenplay);
            // If it's not JSON, treat as plain text
            setScreenplay(story.screenplay);
            setScreenplayData(null);
          }
        } else {
          console.log('[CreateStory] No screenplay found in story data');
        }
      }
    } catch (error) {
      console.error('[CreateStory] Error loading story:', error);
      setScreenplayError('Failed to load story data');
    } finally {
      setLoadingStory(false);
    }
  };

  const togglePersona = (personaName) => {
    setSelectedPersonas(prev => {
      if (prev.includes(personaName)) {
        return prev.filter(name => name !== personaName);
      } else {
        return [...prev, personaName];
      }
    });
  };

  const handleEditPersona = async (persona) => {
    setLoadingContext(true);
    try {
      // Always fetch the persona's original context from the server
      // This ensures we get the current context set on the persona
      const result = await personaAPI.getPersonaContext(persona.name);
      console.log('[CreateStory] Persona context result:', result);
      
      if (result && result.success !== false && result.context !== undefined) {
        // If we have a custom context already (user has edited it), use that
        // Otherwise, use the original context from the persona
        const contextToUse = personaContexts[persona.name] || result.context || '';
        
        // If we don't have a custom context yet, store the original for reference
        if (!personaContexts[persona.name] && result.context !== undefined) {
          setPersonaContexts(prev => ({
            ...prev,
            [persona.name]: result.context || ''
          }));
        }
        
        // Set editing persona with the context (use custom if exists, otherwise original)
        setEditingPersona({
          ...persona,
          customContext: contextToUse
        });
      } else {
        console.warn('[CreateStory] No context found in result:', result);
        // Fallback to existing custom context or empty string
        setEditingPersona({
          ...persona,
          customContext: personaContexts[persona.name] || ''
        });
      }
    } catch (error) {
      console.error('Error loading persona context:', error);
      // On error, use existing custom context or empty string
      setEditingPersona({
        ...persona,
        customContext: personaContexts[persona.name] || ''
      });
    } finally {
      setLoadingContext(false);
    }
  };

  const handleSaveContext = () => {
    if (editingPersona) {
      setPersonaContexts(prev => ({
        ...prev,
        [editingPersona.name]: editingPersona.customContext
      }));
      setEditingPersona(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingPersona(null);
  };

  const handleGenerateScreenplay = async () => {
    if (!plot.trim()) {
      alert('Please enter a plot first');
      return;
    }
    
    if (selectedPersonas.length === 0) {
      alert('Please select at least one persona');
      return;
    }

    setGeneratingScreenplay(true);
    setScreenplayError(null);
    setScreenplay('');

    try {
      // Collect all selected personas and their contexts
      const personaContextsList = [];
      for (const personaName of selectedPersonas) {
        // Get custom context if edited, otherwise fetch original
        let context = personaContexts[personaName];
        if (!context) {
          // Fetch original context
          const result = await personaAPI.getPersonaContext(personaName);
          if (result && result.success !== false && result.context) {
            context = result.context;
            // Store it for future reference
            setPersonaContexts(prev => ({
              ...prev,
              [personaName]: context
            }));
          } else {
            context = '';
          }
        }
        personaContextsList.push({
          name: personaName,
          context: context || ''
        });
      }

      // Build the prompt for screenplay generation
      let prompt = `Create a screenplay based on the following plot and using only the provided personas:\n\n`;
      prompt += `PLOT:\n${plot}\n\n`;
      prompt += `PERSONAS:\n`;
      personaContextsList.forEach((p, idx) => {
        prompt += `${idx + 1}. ${p.name}:\n${p.context || 'No context provided'}\n\n`;
      });
      
      // Add narrator if selected
      if (selectedNarrator) {
        prompt += `NARRATOR: ${selectedNarrator}\n\n`;
      }
      
      prompt += `\nPlease create a complete screenplay using only these personas. Output MUST be valid JSON following this exact schema:\n\n`;
      prompt += `{\n  "script": [\n    { "speaker": "narrator", "text": "..." },\n    { "speaker": "character_name", "text": "..." },\n    ...\n  ]\n}\n\n`;
      prompt += `Each line must have a "speaker" (either "narrator" or a character name) and "text" (the spoken content).`;

      // Build system prompt for screenplay generation
      const systemPrompt = `You are an AI screenplay generator designed for audio-only playback.

OUTPUT RULES (STRICT):
- Output MUST be valid JSON.
- Output MUST follow the provided schema exactly.
- All content must be spoken aloud.
- There are only two types of speakers:
  1. "narrator" — describes scenes, actions, transitions, and non-dialogue information.
  2. Characters — speak dialogue only.
- Do NOT include stage directions, formatting, or actions outside narrator speech.
- Do NOT include camera directions (e.g., FADE IN) unless spoken by the narrator.
- Preserve chronological order using a single linear "script" array.
- Each line must contain:
  - speaker (string)
  - text (string)

STYLE RULES:
- Narrator describes environments, actions, and transitions concisely.
- Characters never describe their own actions.
- Characters speak according to their defined personalities.
- Avoid inner monologue unless spoken aloud.

FAILURE CONDITIONS:
- Any non-JSON output is invalid.
- Any missing speaker field is invalid.
- Any unspoken description outside narrator text is invalid.`;

      // Call AI with custom system prompt (using execute_with_system_prompt)
      console.log('[CreateStory] Calling generateScreenplay API...');
      console.log('[CreateStory] Payload:', { 
        questionLength: prompt.length, 
        systemPromptLength: systemPrompt.length,
        max_tokens: 4096 
      });
      
      const result = await aiAPI.generateScreenplay({
        question: prompt,
        system_prompt: systemPrompt,
        max_tokens: 4096
      });

      console.log('[CreateStory] Screenplay generation result:', result);
      console.log('[CreateStory] Result type:', typeof result);
      console.log('[CreateStory] Result keys:', result ? Object.keys(result) : 'null');

      if (result && result.success !== false && result.answer) {
        // Parse JSON response
        let rawResponse = result.answer;
        let parsedScreenplayData = null; // Store parsed data for saving
        
        try {
          // Try to extract JSON from the response (in case it's wrapped in markdown or has extra text)
          let jsonText = rawResponse.trim();
          
          // Remove markdown code blocks if present
          if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
          }
          
          // Try to find JSON object in the text
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
          }
          
          // Parse the JSON
          const parsed = JSON.parse(jsonText);
          
          // Validate structure
          if (parsed && parsed.script && Array.isArray(parsed.script)) {
            // Store parsed data for saving
            parsedScreenplayData = parsed;
            
            // Store parsed data in state
            setScreenplayData(parsed);
            
            // Format for display - create formatted text from script array
            let formattedText = '';
            parsed.script.forEach((item, index) => {
              const speaker = item.speaker || 'unknown';
              const text = item.text || '';
              
              // Create a formatted line for each script item
              formattedText += `[${index + 1}] ${speaker.toUpperCase()}\n`;
              formattedText += `${text}\n\n`;
            });
            
            setScreenplay(formattedText.trim());
            console.log('[CreateStory] Successfully parsed JSON screenplay:', parsed);
            console.log('[CreateStory] Formatted screenplay:', formattedText);
          } else {
            console.warn('[CreateStory] Invalid JSON structure, using raw response');
            setScreenplayData(null);
            setScreenplay(rawResponse);
          }
        } catch (parseError) {
          console.error('[CreateStory] Error parsing JSON response:', parseError);
          console.error('[CreateStory] Raw response:', rawResponse);
          // If JSON parsing fails, show the raw response with an error message
          setScreenplayError('Warning: Response is not valid JSON. Showing raw response.');
          setScreenplayData(null);
          setScreenplay(rawResponse);
        }
        
        setScreenplayError(null);
        
        // Automatically save the story after successful screenplay generation
        // Pass the parsed screenplay data directly since state updates are async
        setIsAutoSaving(true);
        try {
          await handleSaveStory(true, parsedScreenplayData); // Pass true for auto-save and the parsed screenplay data
        } catch (saveError) {
          console.error('[CreateStory] Error auto-saving story:', saveError);
          // Don't fail the whole operation if save fails, just log it
        } finally {
          setIsAutoSaving(false);
        }
      } else {
        const errorMsg = result?.error || result?.message || 'Failed to generate screenplay';
        console.error('[CreateStory] Screenplay generation failed:', errorMsg);
        console.error('[CreateStory] Full result:', JSON.stringify(result, null, 2));
        setScreenplayError(errorMsg);
        setScreenplay('');
      }
    } catch (error) {
      console.error('Error generating screenplay:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        config: error.config
      });
      
      let errorMsg = 'Failed to generate screenplay';
      if (error.response) {
        // Server responded with error status
        errorMsg = error.response.data?.error || 
                   error.response.data?.message || 
                   `Server error: ${error.response.status} ${error.response.statusText}`;
      } else if (error.request) {
        // Request was made but no response received
        errorMsg = 'No response from server. Please check your connection.';
      } else {
        // Error setting up the request
        errorMsg = error.message || 'Failed to generate screenplay';
      }
      
      setScreenplayError(errorMsg);
      setScreenplay('');
    } finally {
      setGeneratingScreenplay(false);
    }
  };

  const handleSaveStory = async (isAutoSave = false, screenplayDataToSave = null) => {
    if (!storyTitle.trim()) {
      if (!isAutoSave) {
        alert('Please enter a story title');
      }
      return;
    }
    
    if (!plot.trim()) {
      if (!isAutoSave) {
        alert('Please enter a plot');
      }
      return;
    }
    
    if (selectedPersonas.length === 0) {
      if (!isAutoSave) {
        alert('Please select at least one persona');
      }
      return;
    }

    setSavingStory(true);
    setSaveError(null);
    setStorySaved(false);

    try {
      // Build cast array with custom contexts
      const cast = selectedPersonas.map(personaName => {
        // Get custom context if edited, otherwise fetch original or use empty string
        let customContext = personaContexts[personaName];
        if (!customContext) {
          // If we don't have it cached, use empty string (it will be saved as empty)
          customContext = '';
        }
        return {
          persona_name: personaName,
          custom_context: customContext
        };
      });

      console.log('[CreateStory] Saving story:', {
        title: storyTitle,
        plotLength: plot.length,
        castCount: cast.length
      });

      // Prepare screenplay data for saving (JSON string)
      // Use the passed screenplayDataToSave if provided (for auto-save), otherwise use state
      const dataToUse = screenplayDataToSave || screenplayData;
      let screenplayJson = null;
      if (dataToUse) {
        screenplayJson = JSON.stringify(dataToUse);
        console.log('[CreateStory] Saving screenplay data:', {
          hasData: true,
          scriptLength: dataToUse.script?.length || 0,
          jsonLength: screenplayJson.length,
          source: screenplayDataToSave ? 'passed-parameter' : 'state'
        });
      } else if (screenplay) {
        // If we have formatted text but no parsed data, try to save as text
        screenplayJson = screenplay;
        console.log('[CreateStory] Saving screenplay as text (no parsed data):', screenplay.length, 'chars');
      } else {
        console.log('[CreateStory] No screenplay data to save');
      }

      let result;
      if (editMode && storyId) {
        // Update existing story
        result = await storyAPI.updateStory(
          storyId,
          storyTitle,
          plot,
          cast,
          selectedUser?.id,
          selectedNarrator,
          screenplayJson
        );
      } else {
        // Create new story
        result = await storyAPI.createStory(
          storyTitle,
          plot,
          cast,
          selectedUser?.id,
          selectedNarrator,
          screenplayJson
        );
      }

      console.log('[CreateStory] Story save result:', result);

      if (result && result.success !== false) {
        setStorySaved(true);
        setSaveError(null);
        console.log('[CreateStory] Story saved successfully with ID:', result.story_id);
        // Don't auto-navigate if called automatically from generate
        if (!isAutoSave) {
          setTimeout(() => {
            if (onNavigate) {
              onNavigate('stories');
            }
          }, 2000);
        } else {
          // For auto-save, just show success message, don't navigate
          console.log('[CreateStory] Story auto-saved, staying on page');
        }
      } else {
        const errorMsg = result?.error || 'Failed to save story';
        setSaveError(errorMsg);
        setStorySaved(false);
      }
    } catch (error) {
      console.error('Error saving story:', error);
      const errorMsg = error.response?.data?.error || 
                       error.response?.data?.detail ||
                       error.message || 
                       'Failed to save story';
      setSaveError(errorMsg);
      setStorySaved(false);
    } finally {
      setSavingStory(false);
    }
  };

  return (
    <div className="create-story-page">
      <div className="create-story-container">
        <div className="create-story-header">
          <h1>{editMode ? 'Edit Story' : 'Create Story'}</h1>
        </div>
        <div className="create-story-layout">
          {/* Left Panel - Form */}
          <div className="create-story-left-panel">
            <div className="create-story-content">
              {loadingStory && (
                <div className="create-story-field">
                  <div className="create-story-loading">Loading story...</div>
                </div>
              )}
              {/* Story Title Field */}
              <div className="create-story-field">
                <label htmlFor="title" className="create-story-label">Story Title</label>
                <input
                  id="title"
                  type="text"
                  className="create-story-input"
                  value={storyTitle}
                  onChange={(e) => setStoryTitle(e.target.value)}
                  placeholder="Enter story title..."
                />
              </div>

              {/* Plot Field */}
              <div className="create-story-field">
                <label htmlFor="plot" className="create-story-label">Plot</label>
                <textarea
                  id="plot"
                  className="create-story-textarea"
                  value={plot}
                  onChange={(e) => setPlot(e.target.value)}
                  placeholder="Enter the plot of your story..."
                  rows={6}
                />
                <button
                  className="create-story-generate-btn"
                  onClick={handleGenerateScreenplay}
                  disabled={generatingScreenplay || !plot.trim() || selectedPersonas.length === 0}
                >
                  {generatingScreenplay ? 'Generating...' : 'Generate'}
                </button>
              </div>

              {screenplayError && (
                <div className="create-story-error">
                  Error: {screenplayError}
                </div>
              )}

              {/* Save Status Messages */}
              {savingStory && (
                <div className="create-story-field">
                  <div className="create-story-info">
                    Saving story to database...
                  </div>
                </div>
              )}
              {storySaved && (
                <div className="create-story-field">
                  <div className="create-story-success">
                    Story saved successfully!
                  </div>
                </div>
              )}
              {saveError && (
                <div className="create-story-field">
                  <div className="create-story-error">
                    Error saving story: {saveError}
                  </div>
                </div>
              )}

              {/* Narrator Section */}
              <div className="create-story-field">
                <label className="create-story-label">Narrator</label>
                <div className="create-story-narrator-list">
                  {personasLoading ? (
                    <div className="create-story-loading">Loading personas...</div>
                  ) : personas && personas.length > 0 ? (
                    personas.map((persona) => {
                      const isSelected = selectedNarrator === persona.name;
                      const imageUrl = getPersonaImageUrl(persona.image_path, persona.name);
                      return (
                        <button
                          key={persona.name}
                          type="button"
                          className={`create-story-narrator-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedNarrator(isSelected ? null : persona.name)}
                          title={persona.name}
                        >
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={persona.name}
                              className="create-story-persona-avatar"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div 
                            className="create-story-persona-avatar-placeholder"
                            style={{ display: imageUrl ? 'none' : 'flex' }}
                          >
                            {persona.name.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="create-story-persona-name">{persona.name}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="create-story-empty">No personas available</div>
                  )}
                </div>
              </div>

              {/* Personas Section */}
              <div className="create-story-field">
                <label className="create-story-label">Personas</label>
                <div className="create-story-personas-list">
                  {personasLoading ? (
                    <div className="create-story-loading">Loading personas...</div>
                  ) : personas && personas.length > 0 ? (
                    personas.map((persona) => {
                      const isSelected = selectedPersonas.includes(persona.name);
                      const imageUrl = getPersonaImageUrl(persona.image_path, persona.name);
                      return (
                        <button
                          key={persona.name}
                          type="button"
                          className={`create-story-persona-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => togglePersona(persona.name)}
                          title={persona.name}
                        >
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={persona.name}
                              className="create-story-persona-avatar"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div 
                            className="create-story-persona-avatar-placeholder"
                            style={{ display: imageUrl ? 'none' : 'flex' }}
                          >
                            {persona.name.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="create-story-persona-name">{persona.name}</span>
                          <button
                            type="button"
                            className="create-story-persona-edit-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditPersona({
                                ...persona,
                                customContext: personaContexts[persona.name] || ''
                              });
                            }}
                            title="Edit persona context"
                          >
                            Edit
                          </button>
                        </button>
                      );
                    })
                  ) : (
                    <div className="create-story-empty">No personas available</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Generated Screenplay */}
          <div className="create-story-right-panel">
            {generatingScreenplay ? (
              <div className="create-story-loading-panel">
                <div className="create-story-loading-spinner"></div>
                <p>Generating screenplay...</p>
              </div>
            ) : (screenplay || screenplayData) ? (
              <div className="create-story-screenplay-panel">
                <div className="create-story-screenplay-header">
                  <h2>Generated Screenplay</h2>
                  {screenplayData && (
                    <div className="create-story-screenplay-stats">
                      {screenplayData.script?.length || 0} lines
                    </div>
                  )}
                </div>
                <div className="create-story-screenplay">
                  {screenplayData && screenplayData.script && Array.isArray(screenplayData.script) ? (
                    <div className="create-story-screenplay-items">
                      {screenplayData.script.map((item, index) => {
                        const speaker = item.speaker || 'unknown';
                        const text = item.text || '';
                        const isNarrator = speaker.toLowerCase() === 'narrator';
                        
                        return (
                          <div key={index} className={`create-story-screenplay-item ${isNarrator ? 'narrator' : 'character'}`}>
                            <div className="create-story-screenplay-speaker">
                              {speaker.toUpperCase()}
                            </div>
                            <div className="create-story-screenplay-text">
                              {text}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <pre className="create-story-screenplay-text">{screenplay || 'No screenplay content'}</pre>
                  )}
                </div>
              </div>
            ) : (
              <div className="create-story-empty-panel">
                <p>Generated screenplay will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Persona Context Modal */}
      {editingPersona && (
        <div className="create-story-modal-overlay" onClick={handleCancelEdit}>
          <div className="create-story-modal" onClick={(e) => e.stopPropagation()}>
            <div className="create-story-modal-header">
              <h2>Edit Context for {editingPersona.name}</h2>
              <button className="create-story-modal-close" onClick={handleCancelEdit}>
                ✕
              </button>
            </div>
            <div className="create-story-modal-content">
              {loadingContext ? (
                <div className="create-story-loading">Loading context...</div>
              ) : (
                <textarea
                  className="create-story-context-textarea"
                  value={editingPersona.customContext || ''}
                  onChange={(e) => setEditingPersona({
                    ...editingPersona,
                    customContext: e.target.value
                  })}
                  placeholder="Enter custom context for this persona in the story..."
                  rows={12}
                />
              )}
            </div>
            <div className="create-story-modal-footer">
              <button className="create-story-modal-cancel" onClick={handleCancelEdit}>
                Cancel
              </button>
              <button className="create-story-modal-save" onClick={handleSaveContext}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
