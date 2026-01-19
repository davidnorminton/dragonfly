import React, { useState, useEffect, useRef } from 'react';
import { usePersonas } from '../hooks/usePersonas';
import { getPersonaImageUrl } from '../utils/personaImageHelper';
import { personaAPI, storyAPI, aiAPI } from '../services/api';

export function CreateStoryPage({ onNavigate, selectedUser, storyId, editMode = false }) {
  const { personas, loading: personasLoading } = usePersonas(selectedUser?.id);
  const [plot, setPlot] = useState('');
  const [selectedPersonas, setSelectedPersonas] = useState([]);
  const [selectedNarrator, setSelectedNarrator] = useState(null); // Single narrator persona name
  const [storyLength, setStoryLength] = useState('medium'); // 'short', 'medium', 'long'
  const [ageRange, setAgeRange] = useState(''); // Age range like '5-8', '9-12', '13-17', '18+', etc.
  const [editingPersona, setEditingPersona] = useState(null);
  const [personaContexts, setPersonaContexts] = useState({}); // {personaName: customContext}
  const [loadingContext, setLoadingContext] = useState(false);
  const [storyTitle, setStoryTitle] = useState('');
  const [generatingScreenplay, setGeneratingScreenplay] = useState(false);
  const [screenplay, setScreenplay] = useState('');
  const [screenplayData, setScreenplayData] = useState(null); // Parsed JSON data
  const [screenplayError, setScreenplayError] = useState(null);
  const [editingItemIndex, setEditingItemIndex] = useState(null); // Index of item being edited
  const [editingItemText, setEditingItemText] = useState(''); // Text being edited
  const [selectedItems, setSelectedItems] = useState(new Set()); // Set of selected item indices
  const [screenplayVersions, setScreenplayVersions] = useState([]); // List of screenplay versions
  const [activeVersionId, setActiveVersionId] = useState(null); // Currently active version
  const [savingStory, setSavingStory] = useState(false);
  const [storySaved, setStorySaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [loadingStory, setLoadingStory] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioFiles, setAudioFiles] = useState({}); // {index: {file_path, speaker, filename}}
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState(null);
  const [timelineProgress, setTimelineProgress] = useState(0); // 0-100
  const [pauses, setPauses] = useState({}); // {index: pauseDurationInMs} - pause after item at index
  const [editingPause, setEditingPause] = useState(null); // {index: index, startX: number} when dragging
  const [timelineMenuOpen, setTimelineMenuOpen] = useState(null); // index of item with open menu
  const [editingTimelineItem, setEditingTimelineItem] = useState(null); // {index, originalText} when editing
  const [timelineEditText, setTimelineEditText] = useState(''); // Text being edited in timeline item
  const [isPausing, setIsPausing] = useState(false); // Whether currently in a pause
  const [buildCompleteModal, setBuildCompleteModal] = useState(null); // {title, audioUrl} when build is complete
  const [deleting, setDeleting] = useState(false); // Whether currently deleting
  const [timelineDurationsVersion, setTimelineDurationsVersion] = useState(0); // Force re-render when durations load
  const [advancedTimeline, setAdvancedTimeline] = useState(false);
  const [timelineAssets, setTimelineAssets] = useState({
    effects: {}, // {index: [{filename, path, original_name, ...}]}
    ambience: {}, // {index: [{filename, path, original_name, ...}]}
    images: {} // {index: [{filename, path, original_name, ...}]}
  });
  const buildAudioRef = useRef(null); // Ref for the complete audio player
  const pauseTimeoutRef = useRef(null); // Ref to track pause timeout
  const pauseIntervalRef = useRef(null); // Ref to track pause progress interval
  const resumeStateRef = useRef(null); // {indices, currentIndex, pausedAtTime} for resuming
  const audioRefs = useRef({}); // {index: audioElement}
  const totalDurationRef = useRef(0); // Total duration of all audio files
  const currentTimeRef = useRef(0); // Current playback time across all files
  const progressIntervalRef = useRef(null); // Interval for updating progress
  const isPlayingRef = useRef(false); // Ref to track playing state
  const durationsRef = useRef({}); // {index: duration}
  const indicesWithAudioRef = useRef([]); // Array of indices with audio
  const currentPlayingIndexRef = useRef(null); // Ref to track current playing index

  const formatDuration = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const total = Math.max(0, Math.round(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getItemDuration = (index) => {
    const cached = durationsRef.current[index];
    if (cached && isFinite(cached)) return cached;
    const audioEl = audioRefs.current[index];
    if (audioEl && audioEl.duration && isFinite(audioEl.duration)) return audioEl.duration;
    return 0;
  };

  const getTimelineTotalDuration = () => {
    let totalSeconds = 0;
    Object.keys(audioFiles).forEach(key => {
      const index = Number(key);
      totalSeconds += getItemDuration(index);
      const pauseMs = pauses[index] || 0;
      if (pauseMs > 0) {
        totalSeconds += pauseMs / 1000;
      }
    });
    return totalSeconds;
  };

  // Load story data when in edit mode
  useEffect(() => {
    if (editMode && storyId) {
      loadStoryData();
    }
  }, [editMode, storyId]);

  // Reload audio files when screenplay data changes (in case screenplay loads after audio files)
  useEffect(() => {
    if (editMode && storyId && screenplayData && screenplayData.script) {
      // Only reload if we don't have audio files yet
      if (Object.keys(audioFiles).length === 0) {
        const loadAudioFiles = async () => {
          try {
            const audioResult = await storyAPI.getAudioFiles(storyId);
            console.log('[CreateStory] Reloading audio files after screenplay load:', audioResult);
            if (audioResult && audioResult.success && audioResult.audio_files) {
              const loadedAudioFiles = {};
              const indicesWithAudio = new Set();
              audioResult.audio_files.forEach(audioFile => {
                loadedAudioFiles[audioFile.index] = {
                  file_path: audioFile.file_path,
                  speaker: audioFile.speaker,
                  filename: audioFile.filename
                };
                indicesWithAudio.add(audioFile.index);
              });
              setAudioFiles(loadedAudioFiles);
              setSelectedItems(indicesWithAudio);
              console.log('[CreateStory] Reloaded audio files:', Object.keys(loadedAudioFiles).length, 'items');
            }
          } catch (error) {
            console.error('[CreateStory] Error reloading audio files:', error);
          }
        };
        loadAudioFiles();
      }
    }
  }, [editMode, storyId, screenplayData]);

  // Handle pause editing (dragging)
  useEffect(() => {
    if (!editingPause) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - editingPause.startX;
      // Convert pixel movement to milliseconds (1px = 10ms)
      const deltaMs = deltaX * 10;
      const newDuration = Math.max(0, editingPause.startWidth + deltaMs);
      setPauses(prev => ({
        ...prev,
        [editingPause.index]: newDuration
      }));
    };

    const handleMouseUp = () => {
      setEditingPause(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [editingPause]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (timelineMenuOpen !== null && !e.target.closest('.create-story-timeline-item-menu-container')) {
        setTimelineMenuOpen(null);
      }
    };

    if (timelineMenuOpen !== null) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [timelineMenuOpen]);

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
        
        // Load screenplay versions if available
        if (story.screenplay_versions && Array.isArray(story.screenplay_versions) && story.screenplay_versions.length > 0) {
          console.log('[CreateStory] Loading screenplay versions:', story.screenplay_versions.length);
          setScreenplayVersions(story.screenplay_versions);
          
          // Find active version
          const activeVersion = story.screenplay_versions.find(v => v.is_active);
          if (activeVersion) {
            setActiveVersionId(activeVersion.id);
            loadScreenplayVersion(activeVersion.screenplay);
          } else {
            // Use the most recent version if no active one
            const latestVersion = story.screenplay_versions[story.screenplay_versions.length - 1];
            setActiveVersionId(latestVersion.id);
            loadScreenplayVersion(latestVersion.screenplay);
          }
        } else if (story.screenplay) {
          // Fallback to old screenplay field if no versions exist
          console.log('[CreateStory] Loading screenplay from story (legacy):', {
            type: typeof story.screenplay,
            length: story.screenplay?.length || 0,
            preview: story.screenplay?.substring(0, 100) || ''
          });
          setScreenplayVersions([]); // Initialize empty versions array
          loadScreenplayVersion(story.screenplay);
        } else {
          console.log('[CreateStory] No screenplay found in story data');
          setScreenplayVersions([]);
        }
        
        // Load existing audio files
        try {
          const audioResult = await storyAPI.getAudioFiles(storyId);
          console.log('[CreateStory] Audio files result:', audioResult);
          if (audioResult && audioResult.success && audioResult.audio_files) {
            const loadedAudioFiles = {};
            const indicesWithAudio = new Set();
            audioResult.audio_files.forEach(audioFile => {
              loadedAudioFiles[audioFile.index] = {
                file_path: audioFile.file_path,
                speaker: audioFile.speaker,
                filename: audioFile.filename
              };
              indicesWithAudio.add(audioFile.index);
            });
            setAudioFiles(loadedAudioFiles);
            // Check the boxes for items that have audio files
            setSelectedItems(indicesWithAudio);
            console.log('[CreateStory] Loaded audio files:', Object.keys(loadedAudioFiles).length, 'items');
            console.log('[CreateStory] Set selected items:', Array.from(indicesWithAudio));
          } else {
            console.log('[CreateStory] No audio files found or invalid response');
            setAudioFiles({});
            setSelectedItems(new Set());
          }
        } catch (error) {
          console.error('[CreateStory] Error loading audio files:', error);
          // Don't fail the whole load if audio files can't be loaded
          setAudioFiles({});
          setSelectedItems(new Set());
        }
        
        // Load timeline assets
        try {
          const assetsResult = await storyAPI.getTimelineAssets(storyId);
          console.log('[CreateStory] Timeline assets result:', assetsResult);
          if (assetsResult && assetsResult.success && assetsResult.assets) {
            setTimelineAssets(assetsResult.assets);
            console.log('[CreateStory] Loaded timeline assets');
          } else {
            console.log('[CreateStory] No timeline assets found');
            setTimelineAssets({ effects: {}, ambience: {}, images: {} });
          }
        } catch (error) {
          console.error('[CreateStory] Error loading timeline assets:', error);
          // Don't fail the whole load if timeline assets can't be loaded
          setTimelineAssets({ effects: {}, ambience: {}, images: {} });
        }
      }
    } catch (error) {
      console.error('[CreateStory] Error loading story:', error);
      setScreenplayError('Failed to load story data');
    } finally {
      setLoadingStory(false);
    }
  };

  const loadScreenplayVersion = (screenplayText) => {
    try {
      console.log('[CreateStory] loadScreenplayVersion called with:', {
        type: typeof screenplayText,
        length: screenplayText?.length || 0,
        preview: typeof screenplayText === 'string' ? screenplayText.substring(0, 200) : 'not a string'
      });
      
      // Parse JSON if it's a string
      let screenplayJson;
      if (typeof screenplayText === 'string') {
        // Try to extract JSON if wrapped in markdown or extra text
        let jsonText = screenplayText.trim();
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        }
        // Try to find JSON object
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
        screenplayJson = JSON.parse(jsonText);
      } else {
        screenplayJson = screenplayText;
      }
      
      console.log('[CreateStory] Parsed screenplay JSON:', {
        hasScript: !!screenplayJson.script,
        scriptLength: screenplayJson.script?.length || 0,
        scriptIsArray: Array.isArray(screenplayJson.script),
        firstItem: screenplayJson.script?.[0] || null
      });
      
      // Ensure script is an array
      if (!screenplayJson.script || !Array.isArray(screenplayJson.script)) {
        console.error('[CreateStory] Invalid screenplay structure - script is not an array:', screenplayJson);
        setScreenplay(screenplayText);
        setScreenplayData(null);
        return;
      }
      
      // Set the parsed data
      setScreenplayData(screenplayJson);
      
      // Format for display - create formatted text from script array
      let formattedText = '';
      screenplayJson.script.forEach((item, index) => {
        const speaker = item.speaker || 'unknown';
        const text = item.text || '';
        formattedText += `[${index + 1}] ${speaker.toUpperCase()}\n`;
        formattedText += `${text}\n\n`;
      });
      setScreenplay(formattedText.trim());
      console.log('[CreateStory] Screenplay loaded and formatted:', {
        itemCount: screenplayJson.script.length,
        formattedLength: formattedText.length
      });
    } catch (e) {
      console.error('[CreateStory] Error parsing screenplay:', e);
      console.error('[CreateStory] Error stack:', e.stack);
      console.error('[CreateStory] Raw screenplay:', screenplayText);
      // If it's not JSON, treat as plain text
      setScreenplay(screenplayText);
      setScreenplayData(null);
    }
  };

  const handleEditItem = (index) => {
    if (screenplayData && screenplayData.script && screenplayData.script[index]) {
      setEditingItemIndex(index);
      setEditingItemText(screenplayData.script[index].text || '');
    }
  };

  const handleSaveItem = () => {
    if (editingItemIndex !== null && screenplayData && screenplayData.script) {
      const updatedScript = [...screenplayData.script];
      updatedScript[editingItemIndex] = {
        ...updatedScript[editingItemIndex],
        text: editingItemText
      };
      setScreenplayData({ ...screenplayData, script: updatedScript });
      setEditingItemIndex(null);
      setEditingItemText('');
    }
  };

  const handleCancelItemEdit = () => {
    setEditingItemIndex(null);
    setEditingItemText('');
  };

  const handleDeleteItem = (index) => {
    if (screenplayData && screenplayData.script) {
      const updatedScript = screenplayData.script.filter((_, i) => i !== index);
      setScreenplayData({ ...screenplayData, script: updatedScript });
      // Update selected items set
      const newSelected = new Set(selectedItems);
      newSelected.delete(index);
      // Adjust indices for items after deleted one
      const adjustedSelected = new Set();
      newSelected.forEach(idx => {
        if (idx < index) {
          adjustedSelected.add(idx);
        } else if (idx > index) {
          adjustedSelected.add(idx - 1);
        }
      });
      setSelectedItems(adjustedSelected);
    }
  };

  const handleToggleItem = (index) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (!screenplayData || !screenplayData.script || !Array.isArray(screenplayData.script)) {
      return;
    }
    
    // If all items are selected, deselect all; otherwise, select all
    const allIndices = screenplayData.script.map((_, index) => index);
    const allSelected = allIndices.every(index => selectedItems.has(index));
    
    if (allSelected) {
      // Deselect all
      setSelectedItems(new Set());
    } else {
      // Select all
      setSelectedItems(new Set(allIndices));
    }
  };

  const handleRemoveTimelineItem = (index) => {
    // Remove audio file from state
    const newAudioFiles = { ...audioFiles };
    delete newAudioFiles[index];
    setAudioFiles(newAudioFiles);
    
    // Remove from selected items
    const newSelected = new Set(selectedItems);
    newSelected.delete(index);
    setSelectedItems(newSelected);
    
    // Remove pause if exists
    const newPauses = { ...pauses };
    delete newPauses[index];
    setPauses(newPauses);
    
    console.log('[CreateStory] Removed timeline item:', index);
  };

  const handleEditTimelineItem = (index, originalText) => {
    setEditingTimelineItem({ index, originalText });
    setTimelineEditText(originalText);
  };

  const handleSaveTimelineItemEdit = async () => {
    if (!editingTimelineItem || !storyId || !editMode) {
      return;
    }

    const { index } = editingTimelineItem;
    const newText = timelineEditText.trim();

    if (!newText) {
      alert('Text cannot be empty');
      return;
    }

    // Update the screenplay data
    if (screenplayData && screenplayData.script && screenplayData.script[index]) {
      const updatedScript = [...screenplayData.script];
      updatedScript[index] = {
        ...updatedScript[index],
        text: newText
      };
      setScreenplayData({ ...screenplayData, script: updatedScript });
    }

    // Generate new audio for this item
    try {
      console.log('[CreateStory] Regenerating audio for item:', index);
      const result = await storyAPI.generateAudio(storyId, [index]);
      
      if (result && result.success && result.audio_files && result.audio_files.length > 0) {
        const audioFile = result.audio_files[0];
        const newAudioFiles = { ...audioFiles };
        newAudioFiles[index] = {
          file_path: audioFile.file_path,
          speaker: audioFile.speaker,
          filename: audioFile.filename
        };
        setAudioFiles(newAudioFiles);
        console.log('[CreateStory] Audio regenerated for item:', index);
      } else {
        throw new Error('Failed to generate audio');
      }
    } catch (error) {
      console.error('[CreateStory] Error regenerating audio:', error);
      alert(`Error regenerating audio: ${error.message || 'Unknown error'}`);
    }

    setEditingTimelineItem(null);
    setTimelineEditText('');
  };

  const handleCancelTimelineItemEdit = () => {
    setEditingTimelineItem(null);
    setTimelineEditText('');
  };

  const handleResetPauses = () => {
    setPauses({});
  };

  const handleSetPauseForAll = (pauseMs) => {
    const newPauses = {};
    Object.keys(audioFiles).forEach(key => {
      newPauses[Number(key)] = pauseMs;
    });
    setPauses(newPauses);
  };

  const handleAddTimelineAsset = async (index, type) => {
    if (!storyId || !editMode) {
      alert("Please save the story first before adding assets");
      return;
    }

    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    
    if (type === 'effects' || type === 'ambience') {
      input.accept = 'audio/*';
    } else if (type === 'images') {
      input.accept = 'image/*';
    }
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const result = await storyAPI.uploadTimelineAsset(storyId, index, type, file);
        if (result.success) {
          // Update local state
          setTimelineAssets(prev => {
            const updated = { ...prev };
            const list = updated[type][index] ? [...updated[type][index]] : [];
            list.push(result.asset);
            updated[type] = { ...updated[type], [index]: list };
            return updated;
          });
        } else {
          alert(`Failed to upload ${type}: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error(`Error uploading ${type}:`, error);
        alert(`Error uploading ${type}: ${error.message || 'Unknown error'}`);
      }
    };
    
    input.click();
  };

  const handleRemoveTimelineAsset = async (index, type, assetIndex) => {
    if (!storyId || !editMode) {
      alert("Please save the story first before removing assets");
      return;
    }

    const asset = timelineAssets[type][index]?.[assetIndex];
    if (!asset) return;

    if (!confirm(`Are you sure you want to remove this ${type === 'effects' ? 'effect' : type === 'ambience' ? 'background' : 'image'}?`)) {
      return;
    }

    try {
      const result = await storyAPI.deleteTimelineAsset(storyId, index, type, asset.filename);
      if (result.success) {
        // Update local state
        setTimelineAssets(prev => {
          const updated = { ...prev };
          const list = updated[type][index] ? [...updated[type][index]] : [];
          list.splice(assetIndex, 1);
          if (list.length === 0) {
            delete updated[type][index];
          } else {
            updated[type] = { ...updated[type], [index]: list };
          }
          return updated;
        });
      } else {
        alert(`Failed to delete ${type}: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Error deleting ${type}:`, error);
      alert(`Error deleting ${type}: ${error.message || 'Unknown error'}`);
    }
  };

  const handleDeleteStory = async () => {
    if (!storyId || !editMode || !selectedUser?.is_admin) return;
    
    if (!confirm(`Are you sure you want to delete "${storyTitle || 'this story'}"? This will permanently delete the story, all its data, screenplay versions, and audio files.`)) {
      return;
    }

    setDeleting(true);
    try {
      const result = await storyAPI.deleteStory(storyId, selectedUser?.id);
      if (result && result.success) {
        // Navigate back to stories page
        onNavigate?.('stories');
      } else {
        throw new Error(result?.error || 'Failed to delete story');
      }
    } catch (error) {
      console.error('[CreateStory] Error deleting story:', error);
      alert(`Error deleting story: ${error.message || 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleBuild = async () => {
    if (!storyId || !editMode || !screenplayData || !screenplayData.script) {
      alert('Please save the story first');
      return;
    }

    if (Object.keys(audioFiles).length === 0) {
      alert('No audio files to build');
      return;
    }

    try {
      console.log('[CreateStory] Building complete audio file...');
      console.log('[CreateStory] Pauses:', pauses);
      console.log('[CreateStory] Audio files:', audioFiles);
      
      // Get timeline items: only indices that have audio files, sorted by index
      const timelineIndices = Object.keys(audioFiles)
        .map(Number)
        .sort((a, b) => a - b);
      
      // Get current screenplay text for each timeline item (may have been edited)
      const timelineItems = timelineIndices.map(index => {
        const screenplayItem = screenplayData.script[index];
        const item = {
          index: index,
          speaker: screenplayItem?.speaker || '',
          text: screenplayItem?.text || ''
        };
        console.log(`[CreateStory] Timeline item ${index}: speaker="${item.speaker}", text_length=${item.text.length}, text_preview="${item.text.substring(0, 50)}"`);
        return item;
      });
      
      console.log('[CreateStory] Timeline items to build:', timelineItems);
      console.log('[CreateStory] Total timeline items:', timelineItems.length);
      console.log('[CreateStory] Items with text:', timelineItems.filter(item => item.text && item.text.trim().length > 0).length);
      
      // Convert pauses object keys to strings if needed (for JSON serialization)
      const pausesForAPI = {};
      Object.keys(pauses).forEach(key => {
        pausesForAPI[String(key)] = pauses[key];
      });
      
      const result = await storyAPI.buildAudio(storyId, {
        timeline_items: timelineItems,
        pauses: pausesForAPI
      });
      
      if (result && result.success) {
        console.log('[CreateStory] Build complete:', result);
        // Show modal with play button
        // The file_path is relative like "data/story/complete/filename.mp3"
        // The data directory is mounted at /data, so the URL is /data/story/complete/filename.mp3
        const audioUrl = `/${result.file_path}`;
        setBuildCompleteModal({
          title: storyTitle,
          audioUrl: audioUrl,
          filename: result.filename,
          duration: (result.duration_ms / 1000).toFixed(1),
          savedToDb: result.story_complete_id !== null && result.story_complete_id !== undefined
        });
      } else {
        throw new Error(result?.error || 'Build failed');
      }
    } catch (error) {
      console.error('[CreateStory] Error building audio:', error);
      alert(`Error building audio: ${error.message || 'Unknown error'}`);
    }
  };

  const handlePlayTimeline = () => {
    if (isPlayingTimeline) {
      // Pause - stop all audio and save state for resuming
      Object.values(audioRefs.current).forEach(audioElement => {
        if (audioElement) {
          audioElement.pause();
        }
      });
      
      // Save current state for resuming
      if (currentPlayingIndexRef.current !== null) {
        const currentIndex = currentPlayingIndexRef.current;
        const indicesWithAudio = Object.keys(audioFiles)
          .map(Number)
          .sort((a, b) => a - b);
        
        // Find which index in the array we're at
        const arrayIndex = indicesWithAudio.indexOf(currentIndex);
        
        // Get current time in the audio if playing, or 0 if in pause
        let pausedAtTime = 0;
        if (!isPausing && currentIndex !== null) {
          const audioElement = audioRefs.current[currentIndex];
          if (audioElement) {
            pausedAtTime = audioElement.currentTime || 0;
          }
        }
        
        resumeStateRef.current = {
          indices: indicesWithAudio,
          currentIndex: arrayIndex,
          pausedAtTime: pausedAtTime,
          pausedAtItemIndex: currentIndex
        };
      }
      
      setIsPlayingTimeline(false);
      isPlayingRef.current = false;
      setIsPausing(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
        pauseTimeoutRef.current = null;
      }
      if (pauseIntervalRef.current) {
        clearInterval(pauseIntervalRef.current);
        pauseIntervalRef.current = null;
      }
    } else {
      // Play - start playing from the first item with audio or resume from where we left off
      if (!screenplayData || !screenplayData.script) return;
      
      // Get all indices that have audio, sorted by index
      const indicesWithAudio = Object.keys(audioFiles)
        .map(Number)
        .sort((a, b) => a - b);
      
      if (indicesWithAudio.length === 0) return;
      
      // Check if we should resume from a previous pause
      if (resumeStateRef.current) {
        const resumeState = resumeStateRef.current;
        const resumeIndex = resumeState.currentIndex;
        const resumeItemIndex = resumeState.pausedAtItemIndex;
        const resumeTime = resumeState.pausedAtTime;
        
        console.log('[CreateStory] Resuming playback:', {
          resumeIndex,
          resumeItemIndex,
          resumeTime,
          isPausing
        });
        
        // Calculate durations first
        const calculateDurations = () => {
          let totalDuration = 0;
          const durations = {};
          let allLoaded = true;
          
          indicesWithAudio.forEach(index => {
            const audioEl = audioRefs.current[index];
            if (audioEl && audioEl.duration && !isNaN(audioEl.duration) && isFinite(audioEl.duration) && audioEl.duration > 0) {
              durations[index] = audioEl.duration;
              totalDuration += audioEl.duration;
              const pauseDur = pauses[index] || 0;
              if (pauseDur > 0) {
                totalDuration += pauseDur / 1000;
              }
            } else {
              allLoaded = false;
            }
          });
          
          if (allLoaded && totalDuration > 0) {
            totalDurationRef.current = totalDuration;
            startProgressTracking(indicesWithAudio, durations);
            return durations;
          }
          return null;
        };
        
        const durations = calculateDurations();
        if (!durations) {
          // If durations not ready, wait a bit and try normal start
          setTimeout(() => {
            if (calculateDurations()) {
              setIsPlayingTimeline(true);
              isPlayingRef.current = true;
              playAudioSequence(indicesWithAudio, 0);
            }
          }, 500);
          return;
        }
        
        setIsPlayingTimeline(true);
        isPlayingRef.current = true;
        
        // If we were in a pause, continue to next item
        if (isPausing || resumeTime === 0) {
          setIsPausing(false);
          if (pauseTimeoutRef.current) {
            clearTimeout(pauseTimeoutRef.current);
            pauseTimeoutRef.current = null;
          }
          if (pauseIntervalRef.current) {
            clearInterval(pauseIntervalRef.current);
            pauseIntervalRef.current = null;
          }
          // Continue from next item after pause
          playAudioSequence(indicesWithAudio, resumeIndex + 1);
        } else if (resumeTime > 0 && resumeItemIndex !== null) {
          // Resume from specific time in current audio
          const audioElement = audioRefs.current[resumeItemIndex];
          if (audioElement) {
            audioElement.currentTime = resumeTime;
            setCurrentPlayingIndex(resumeItemIndex);
            currentPlayingIndexRef.current = resumeItemIndex;
            
            // Set up event listener to continue after this audio ends
            const handleEnded = () => {
              audioElement.removeEventListener('ended', handleEnded);
              const pauseDuration = pauses[resumeItemIndex] || 0;
              if (pauseDuration > 0) {
                setIsPausing(true);
                const pauseStartTime = Date.now();
                const pauseDurationSeconds = pauseDuration / 1000;
                
                pauseIntervalRef.current = setInterval(() => {
                  if (!isPlayingRef.current) {
                    if (pauseIntervalRef.current) {
                      clearInterval(pauseIntervalRef.current);
                      pauseIntervalRef.current = null;
                    }
                    setIsPausing(false);
                    return;
                  }
                  
                  const elapsedPause = (Date.now() - pauseStartTime) / 1000;
                  const pauseProgress = Math.min(1, elapsedPause / pauseDurationSeconds);
                  
                  let currentTime = 0;
                  const currentIdx = currentPlayingIndexRef.current;
                  
                  indicesWithAudioRef.current.forEach(idx => {
                    if (currentIdx !== null && idx < currentIdx) {
                      currentTime += durationsRef.current[idx] || 0;
                      const pauseDur = pauses[idx] || 0;
                      if (pauseDur > 0) {
                        currentTime += pauseDur / 1000;
                      }
                    } else if (currentIdx !== null && idx === currentIdx) {
                      currentTime += durationsRef.current[idx] || 0;
                      if (idx === resumeItemIndex) {
                        currentTime += pauseDurationSeconds * pauseProgress;
                      }
                    }
                  });
                  
                  if (totalDurationRef.current > 0) {
                    const progress = (currentTime / totalDurationRef.current) * 100;
                    setTimelineProgress(Math.min(100, Math.max(0, progress)));
                  }
                }, 50);
                
                pauseTimeoutRef.current = setTimeout(() => {
                  if (pauseIntervalRef.current) {
                    clearInterval(pauseIntervalRef.current);
                    pauseIntervalRef.current = null;
                  }
                  setIsPausing(false);
                  const nextIndex = indicesWithAudio.indexOf(resumeItemIndex) + 1;
                  if (nextIndex < indicesWithAudio.length) {
                    playAudioSequence(indicesWithAudio, nextIndex);
                  }
                }, pauseDuration);
              } else {
                const nextIndex = indicesWithAudio.indexOf(resumeItemIndex) + 1;
                if (nextIndex < indicesWithAudio.length) {
                  playAudioSequence(indicesWithAudio, nextIndex);
                }
              }
            };
            
            audioElement.addEventListener('ended', handleEnded);
            
            audioElement.play().catch(error => {
              console.error('[CreateStory] Error resuming audio:', error);
            });
          } else {
            // Audio element not found, continue from next
            playAudioSequence(indicesWithAudio, resumeIndex + 1);
          }
        } else {
          // Resume from next item
          playAudioSequence(indicesWithAudio, resumeIndex);
        }
        
        resumeStateRef.current = null;
        return;
      }
      
      // Calculate total duration - wait for metadata to load if needed
      const calculateDurations = () => {
        let totalDuration = 0;
        const durations = {};
        let allLoaded = true;
        
        indicesWithAudio.forEach(index => {
          const audioElement = audioRefs.current[index];
          if (audioElement) {
            // Check if duration is available and valid
            if (audioElement.duration && !isNaN(audioElement.duration) && isFinite(audioElement.duration) && audioElement.duration > 0) {
              durations[index] = audioElement.duration;
              totalDuration += audioElement.duration;
              // Add pause duration after this item (except for last item)
              const pauseDuration = pauses[index] || 0;
              if (pauseDuration > 0) {
                totalDuration += pauseDuration / 1000; // Convert ms to seconds
              }
              console.log(`[CreateStory] Audio ${index} duration: ${audioElement.duration}, pause: ${pauseDuration}ms`);
            } else {
              console.log(`[CreateStory] Audio ${index} duration not ready:`, audioElement.duration);
              allLoaded = false;
            }
          } else {
            console.log(`[CreateStory] Audio element ${index} not found`);
            allLoaded = false;
          }
        });
        
        console.log('[CreateStory] Duration calculation:', {
          allLoaded,
          totalDuration,
          durations,
          audioElementsCount: Object.keys(audioRefs.current).length
        });
        
        if (allLoaded && totalDuration > 0) {
          totalDurationRef.current = totalDuration;
          currentTimeRef.current = 0;
          setTimelineProgress(0);
          startProgressTracking(indicesWithAudio, durations);
          return true;
        }
        return false;
      };
      
      // Wait for all audio elements to load their metadata
      const waitForMetadata = async () => {
        let attempts = 0;
        const maxAttempts = 20; // 2 seconds max wait
        
        while (attempts < maxAttempts) {
          if (calculateDurations()) {
            setIsPlayingTimeline(true);
            isPlayingRef.current = true;
            playAudioSequence(indicesWithAudio, 0);
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        // If still not loaded, start anyway with what we have
        console.warn('[CreateStory] Some audio metadata not loaded, starting playback anyway');
        const durations = {};
        let totalDuration = 0;
        indicesWithAudio.forEach(index => {
          const audioElement = audioRefs.current[index];
          if (audioElement && audioElement.duration && !isNaN(audioElement.duration)) {
            durations[index] = audioElement.duration;
            totalDuration += audioElement.duration;
          } else {
            durations[index] = 0; // Placeholder
          }
        });
        totalDurationRef.current = totalDuration || 1; // Avoid division by zero
        startProgressTracking(indicesWithAudio, durations);
        setIsPlayingTimeline(true);
        isPlayingRef.current = true;
        playAudioSequence(indicesWithAudio, 0);
      };
      
      waitForMetadata();
    }
  };

  const startProgressTracking = (indicesWithAudio, durations) => {
    // Store refs for use in interval
    indicesWithAudioRef.current = indicesWithAudio;
    durationsRef.current = durations;
    
    // Clear any existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    console.log('[CreateStory] Starting progress tracking:', {
      indicesWithAudio,
      durations,
      totalDuration: totalDurationRef.current
    });
    
    // Update progress every 100ms
    progressIntervalRef.current = setInterval(() => {
      if (!isPlayingRef.current) {
        return;
      }
      
      // Calculate current time across all files using ref for current index
      let currentTime = 0;
      const currentIndex = currentPlayingIndexRef.current;
      
      // Add time from completed files
      indicesWithAudioRef.current.forEach(index => {
        if (currentIndex !== null && index < currentIndex) {
          const duration = durationsRef.current[index] || 0;
          currentTime += duration;
          // Add pause duration after this item
          const pauseDuration = pauses[index] || 0;
          if (pauseDuration > 0) {
            currentTime += pauseDuration / 1000; // Convert ms to seconds
          }
        } else if (currentIndex !== null && index === currentIndex) {
          // Add current time from currently playing file
          const audioElement = audioRefs.current[index];
          if (audioElement && !isNaN(audioElement.currentTime) && isFinite(audioElement.currentTime)) {
            currentTime += audioElement.currentTime;
          }
        }
      });
      
      currentTimeRef.current = currentTime;
      
      // Calculate progress percentage
      if (totalDurationRef.current > 0) {
        const progress = (currentTime / totalDurationRef.current) * 100;
        setTimelineProgress(Math.min(100, Math.max(0, progress)));
      }
      
      // If we've reached the end, stop tracking
      if (currentTime >= totalDurationRef.current && totalDurationRef.current > 0) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      }
    }, 100);
  };

  const playAudioSequence = (indices, currentIndex) => {
    if (currentIndex >= indices.length) {
      // Finished playing all audio
      setIsPlayingTimeline(false);
      isPlayingRef.current = false;
      setCurrentPlayingIndex(null);
      currentPlayingIndexRef.current = null;
      setTimelineProgress(100);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      return;
    }
    
    const index = indices[currentIndex];
    setCurrentPlayingIndex(index);
    currentPlayingIndexRef.current = index;
    
    const audioElement = audioRefs.current[index];
    if (audioElement) {
      // Play this audio
      const playPromise = audioElement.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // Audio started playing successfully
            console.log(`[CreateStory] Playing audio for item ${index}`);
          })
          .catch(error => {
            console.error(`[CreateStory] Error playing audio for item ${index}:`, error);
            // Continue to next audio even if this one fails
            setTimeout(() => playAudioSequence(indices, currentIndex + 1), 100);
          });
      }
      
      // When this audio ends, play the next one (with pause if configured)
      const handleEnded = () => {
        audioElement.removeEventListener('ended', handleEnded);
        // Check if there's a pause after this item
        const pauseDuration = pauses[index] || 0;
        if (pauseDuration > 0) {
          // Set pausing state
          setIsPausing(true);
          const pauseStartTime = Date.now();
          const pauseDurationSeconds = pauseDuration / 1000;
          
          // Update progress during pause
          pauseIntervalRef.current = setInterval(() => {
            if (!isPlayingRef.current) {
              if (pauseIntervalRef.current) {
                clearInterval(pauseIntervalRef.current);
                pauseIntervalRef.current = null;
              }
              setIsPausing(false);
              return;
            }
            
            const elapsedPause = (Date.now() - pauseStartTime) / 1000;
            const pauseProgress = Math.min(1, elapsedPause / pauseDurationSeconds);
            
            // Calculate current time including pause progress
            let currentTime = 0;
            const currentIdx = currentPlayingIndexRef.current;
            
            indicesWithAudioRef.current.forEach(idx => {
              if (currentIdx !== null && idx < currentIdx) {
                currentTime += durationsRef.current[idx] || 0;
                const pauseDur = pauses[idx] || 0;
                if (pauseDur > 0) {
                  currentTime += pauseDur / 1000;
                }
              } else if (currentIdx !== null && idx === currentIdx) {
                // Add full duration of current audio (it just finished)
                currentTime += durationsRef.current[idx] || 0;
                // Add pause progress
                if (idx === index) {
                  currentTime += pauseDurationSeconds * pauseProgress;
                }
              }
            });
            
            if (totalDurationRef.current > 0) {
              const progress = (currentTime / totalDurationRef.current) * 100;
              setTimelineProgress(Math.min(100, Math.max(0, progress)));
            }
          }, 50); // Update every 50ms for smooth pause progress
          
          // Wait for pause duration before playing next
          pauseTimeoutRef.current = setTimeout(() => {
            if (pauseIntervalRef.current) {
              clearInterval(pauseIntervalRef.current);
              pauseIntervalRef.current = null;
            }
            setIsPausing(false);
            playAudioSequence(indices, currentIndex + 1);
          }, pauseDuration);
        } else {
          // Continue immediately to next audio
          playAudioSequence(indices, currentIndex + 1);
        }
      };
      audioElement.addEventListener('ended', handleEnded);
    } else {
      // If audio element not available, skip to next
      console.warn(`[CreateStory] Audio element not available for item ${index}, skipping`);
      setTimeout(() => playAudioSequence(indices, currentIndex + 1), 100);
    }
  };

  const handleCreateAudio = async () => {
    if (!storyId || !editMode) {
      console.error('[CreateStory] Cannot create audio: story must be saved first');
      alert('Please save the story first before generating audio');
      return;
    }

    if (selectedItems.size === 0) {
      alert('Please select at least one screenplay item to generate audio');
      return;
    }

    setGeneratingAudio(true);
    try {
      const selectedIndices = Array.from(selectedItems);
      console.log('[CreateStory] Generating audio for items:', selectedIndices);

      const result = await storyAPI.generateAudio(storyId, selectedIndices);

      if (result && result.success) {
        console.log('[CreateStory] Audio generation successful:', result);
        
        // Store audio files in state, mapping by index
        const newAudioFiles = { ...audioFiles };
        const newSelectedItems = new Set(selectedItems);
        if (result.audio_files && Array.isArray(result.audio_files)) {
          result.audio_files.forEach(audioFile => {
            newAudioFiles[audioFile.index] = {
              file_path: audioFile.file_path,
              speaker: audioFile.speaker,
              filename: audioFile.filename
            };
            // Keep items selected that now have audio
            newSelectedItems.add(audioFile.index);
          });
        }
        setAudioFiles(newAudioFiles);
        setSelectedItems(newSelectedItems);
        
        alert(`Successfully generated ${result.audio_files?.length || 0} audio files`);
      } else {
        throw new Error(result?.error || result?.message || 'Failed to generate audio');
      }
    } catch (error) {
      console.error('[CreateStory] Error generating audio:', error);
      console.error('[CreateStory] Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        fullError: error
      });
      const errorMessage = error.response?.data?.detail || error.response?.data?.error || error.message || 'Unknown error';
      alert(`Error generating audio: ${errorMessage}`);
    } finally {
      setGeneratingAudio(false);
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
      // Collect all selected personas and their contexts - PARALLEL FETCHING
      const personaContextsList = [];
      
      // First, identify which personas need to be fetched
      const personasToFetch = selectedPersonas.filter(name => !personaContexts[name]);
      
      // Fetch all missing persona contexts in parallel
      if (personasToFetch.length > 0) {
        console.log(`[CreateStory] Fetching ${personasToFetch.length} persona contexts in parallel...`);
        const fetchPromises = personasToFetch.map(async (personaName) => {
          try {
            const result = await personaAPI.getPersonaContext(personaName);
            if (result && result.success !== false && result.context) {
              return { name: personaName, context: result.context };
            }
            return { name: personaName, context: '' };
          } catch (error) {
            console.error(`[CreateStory] Error fetching context for ${personaName}:`, error);
            return { name: personaName, context: '' };
          }
        });
        
        const fetchedContexts = await Promise.all(fetchPromises);
        
        // Update state with all fetched contexts
        const newContexts = {};
        fetchedContexts.forEach(({ name, context }) => {
          newContexts[name] = context;
        });
        setPersonaContexts(prev => ({ ...prev, ...newContexts }));
        
        // Add to list
        fetchedContexts.forEach(({ name, context }) => {
          personaContextsList.push({
            name: name,
            context: context || ''
          });
        });
      }
      
      // Add personas that already have contexts cached
      selectedPersonas.forEach(personaName => {
        if (personaContexts[personaName]) {
          personaContextsList.push({
            name: personaName,
            context: personaContexts[personaName]
          });
        }
      });

      // Calculate max_tokens and word count guidance based on story length
      let maxTokens;
      let approxWords;
      switch (storyLength) {
        case 'very-short':
          maxTokens = 1000; // ~750 words
          approxWords = Math.floor(maxTokens * 0.75);
          break;
        case 'short':
          maxTokens = 1536; // ~1150 words
          approxWords = Math.floor(maxTokens * 0.75);
          break;
        case 'long':
          maxTokens = 6144; // ~4600 words
          approxWords = Math.floor(maxTokens * 0.75);
          break;
        case 'medium':
        default:
          maxTokens = 3072; // ~2300 words
          approxWords = Math.floor(maxTokens * 0.75);
          break;
      }
      
      // Build the prompt for screenplay generation
      let prompt = `Create a screenplay based on the following plot and using only the provided personas:\n\n`;
      prompt += `PLOT:\n${plot}\n\n`;
      
      // Add age range information if provided
      if (ageRange) {
        prompt += `TARGET AUDIENCE: This story is intended for ${ageRange} years old.\n\n`;
      }
      
      prompt += `PERSONAS:\n`;
      personaContextsList.forEach((p, idx) => {
        prompt += `${idx + 1}. ${p.name}:\n${p.context || 'No context provided'}\n\n`;
      });
      
      // Add narrator if selected
      if (selectedNarrator) {
        prompt += `NARRATOR: ${selectedNarrator}\n\n`;
      }
      
      // Add story length context
      let lengthDescription;
      if (storyLength === 'very-short') {
        lengthDescription = 'a very short';
      } else if (storyLength === 'short') {
        lengthDescription = 'a short';
      } else if (storyLength === 'long') {
        lengthDescription = 'a long';
      } else {
        lengthDescription = 'a medium-length';
      }
      prompt += `STORY LENGTH: Create ${lengthDescription} screenplay.\n\n`;
      
      prompt += `Please create a complete screenplay using only these personas. Output MUST be valid JSON following this exact schema:\n\n`;
      prompt += `{\n  "script": [\n    { "speaker": "narrator", "text": "..." },\n    { "speaker": "character_name", "text": "..." },\n    ...\n  ]\n}\n\n`;
      prompt += `Each line must have a "speaker" (either "narrator" or a character name) and "text" (the spoken content).\n\n`;
      prompt += `IMPORTANT: Keep the total screenplay length to approximately ${approxWords} words or less to ensure it fits within the token limit. Focus on essential dialogue and key narrative moments.`;

      // Build system prompt for screenplay generation
      let systemPrompt = `You are an AI screenplay generator designed for audio-only playback.

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
- Keep dialogue and narration concise to fit within the token limit (approximately ${approxWords} words total).`;

      // Add age-appropriate content guidance
      if (ageRange) {
        systemPrompt += `\n\nAGE-APPROPRIATE CONTENT:\n`;
        systemPrompt += `- This story is intended for ${ageRange} years old.\n`;
        systemPrompt += `- Adjust vocabulary, themes, and complexity to be age-appropriate.\n`;
        systemPrompt += `- Ensure content is suitable and engaging for this age group.\n`;
      }

      // Add story length guidance
      systemPrompt += `\n\nSTORY LENGTH:\n`;
      if (storyLength === 'very-short') {
        systemPrompt += `- Create a very brief, focused story (approximately ${approxWords} words or less).\n`;
        systemPrompt += `- Be extremely concise and get straight to the core of the story.\n`;
        systemPrompt += `- Focus only on the most essential plot points and minimal dialogue.\n`;
        systemPrompt += `- Keep scenes short and action-driven.\n`;
      } else if (storyLength === 'short') {
        systemPrompt += `- Create a concise, focused story (approximately ${approxWords} words or less).\n`;
        systemPrompt += `- Get to the point quickly and maintain a fast pace.\n`;
        systemPrompt += `- Focus on essential plot points and character interactions.\n`;
      } else if (storyLength === 'long') {
        systemPrompt += `- Create a more detailed, expansive story (approximately ${approxWords} words).\n`;
        systemPrompt += `- Include richer character development and world-building.\n`;
        systemPrompt += `- Allow for more elaborate scenes and dialogue.\n`;
      } else {
        systemPrompt += `- Create a balanced, medium-length story (approximately ${approxWords} words).\n`;
        systemPrompt += `- Include good character development without excessive detail.\n`;
      }

      systemPrompt += `\n\nFAILURE CONDITIONS:
- Any non-JSON output is invalid.
- Any missing speaker field is invalid.
- Any unspoken description outside narrator text is invalid.`;

      // Call AI with streaming (better UX) and reduced tokens
      console.log('[CreateStory] Calling generateScreenplayStream API...');
      console.log('[CreateStory] Payload:', { 
        questionLength: prompt.length, 
        systemPromptLength: systemPrompt.length,
        max_tokens: maxTokens,
        approxWords: approxWords
      });
      
      // Use streaming API - collect all chunks then parse JSON
      let fullResponse = '';
      let parsedScreenplayData = null;
      let streamingSucceeded = false;
      let streamingError = null;
      
      try {
        // Stream and collect ALL chunks before parsing
        await aiAPI.generateScreenplayStream({
          question: prompt,
          system_prompt: systemPrompt,
          max_tokens: maxTokens
        }, (chunk) => {
          // Accumulate chunks as they arrive - don't parse until stream is complete
          if (chunk) {
            fullResponse += chunk;
            // Just accumulate - don't try to parse incomplete JSON
          }
        }, (error) => {
          // Handle streaming errors
          console.error('[CreateStory] Streaming error callback:', error);
          streamingError = error;
        });
        
        // After streaming completes, check if we got data
        if (fullResponse && !streamingError) {
          streamingSucceeded = true;
          console.log('[CreateStory] Streaming complete, total length:', fullResponse.length);
          console.log('[CreateStory] Response preview (first 200 chars):', fullResponse.substring(0, 200));
          console.log('[CreateStory] Response preview (last 200 chars):', fullResponse.substring(Math.max(0, fullResponse.length - 200)));
        } else if (streamingError) {
          console.error('[CreateStory] Streaming failed with error:', streamingError);
          streamingSucceeded = false;
          fullResponse = ''; // Clear any partial data
        } else {
          console.warn('[CreateStory] Streaming completed but no data received');
          streamingSucceeded = false;
        }
      } catch (streamError) {
        console.error('[CreateStory] Error during streaming, falling back to non-streaming:', streamError);
        streamingSucceeded = false;
        streamingError = streamError;
        fullResponse = ''; // Clear any partial data
      }

      // Fallback to non-streaming if streaming failed or no response
      if (!streamingSucceeded || !fullResponse) {
        console.log('[CreateStory] Using non-streaming fallback...');
        try {
          const result = await aiAPI.generateScreenplay({
            question: prompt,
            system_prompt: systemPrompt,
            max_tokens: maxTokens
          });
          
          if (result && result.success !== false && result.answer) {
            fullResponse = result.answer;
          } else {
            const errorMsg = result?.error || 'Failed to generate screenplay';
            console.error('[CreateStory] Screenplay generation failed:', errorMsg);
            setScreenplayError(errorMsg);
            setScreenplay('');
            setGeneratingScreenplay(false);
            return;
          }
        } catch (fallbackError) {
          console.error('[CreateStory] Both streaming and fallback failed:', fallbackError);
          setScreenplayError(fallbackError.message || 'Failed to generate screenplay');
          setScreenplay('');
          setGeneratingScreenplay(false);
          return;
        }
      }

      if (fullResponse) {
        // Parse JSON response
        let rawResponse = fullResponse;
        let jsonText = ''; // Define outside try block so catch can access it
        
        try {
          // Try to extract JSON from the response (in case it's wrapped in markdown or has extra text)
          jsonText = rawResponse.trim();
          
          // Remove markdown code blocks if present (handles ```json or just ```)
          // Match opening ```json or ``` and remove it, then match closing ``` and remove it
          jsonText = jsonText.replace(/^```(?:json)?\s*/i, '');
          jsonText = jsonText.replace(/\s*```\s*$/i, '');
          jsonText = jsonText.trim();
          
          // Try to find JSON object in the text (match from first { to last })
          // Use non-greedy matching to find the complete JSON object
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
          }
          
          // Log what we're about to parse
          console.log('[CreateStory] Extracted JSON text (first 500 chars):', jsonText.substring(0, 500));
          
          // Parse the JSON
          const parsed = JSON.parse(jsonText);
          
          console.log('[CreateStory] Successfully parsed JSON:', {
            hasScript: !!parsed.script,
            scriptLength: parsed.script?.length || 0
          });
          
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
            
            // Clear screenplay text immediately to prevent JSON display
            setScreenplay('');
            
            // Ensure screenplayData is set before clearing screenplay
            // This ensures the component will render from screenplayData, not raw text
            console.log('[CreateStory] Successfully parsed JSON screenplay:', {
              scriptItems: parsed.script.length,
              firstItem: parsed.script[0],
              hasScreenplayData: !!screenplayData
            });
            
            // Double-check that screenplayData was set
            if (!screenplayData || !screenplayData.script) {
              console.warn('[CreateStory] WARNING: screenplayData not properly set, forcing update');
              // Force a re-render by ensuring state is updated
              setTimeout(() => {
                if (screenplayData === parsed) {
                  console.log('[CreateStory] screenplayData confirmed set');
                }
              }, 100);
            }
          } else {
            console.warn('[CreateStory] Invalid JSON structure, using raw response');
            setScreenplayData(null);
            setScreenplayError('Invalid JSON structure received from AI');
            setScreenplay(rawResponse); // Only show raw if structure is invalid
          }
        } catch (parseError) {
          console.error('[CreateStory] Error parsing JSON response:', parseError);
          const errorPosition = parseError.message?.match(/position (\d+)/)?.[1];
          console.error('[CreateStory] Parse error details:', {
            message: parseError.message,
            position: errorPosition,
            rawResponseLength: rawResponse.length,
            rawResponsePreview: rawResponse.substring(0, 500),
            rawResponseEnd: rawResponse.substring(Math.max(0, rawResponse.length - 500))
          });
          
          // Try to fix incomplete JSON by attempting to close it properly
          let fixedJsonText = jsonText;
          let jsonFixed = false;
          
          // Check if JSON appears to be cut off (incomplete string, unclosed brackets, etc.)
          const openBraces = (jsonText.match(/\{/g) || []).length;
          const closeBraces = (jsonText.match(/\}/g) || []).length;
          const openBrackets = (jsonText.match(/\[/g) || []).length;
          const closeBrackets = (jsonText.match(/\]/g) || []).length;
          
          // If we have unclosed structures, try to close them
          if (openBraces > closeBraces || openBrackets > closeBrackets || jsonText.trim().endsWith('"') || jsonText.includes('"success')) {
            console.warn('[CreateStory] JSON appears incomplete, attempting to fix...');
            
            // Find the last complete script item
            const lastCompleteItem = jsonText.lastIndexOf('},');
            if (lastCompleteItem > 0) {
              // Extract up to the last complete item
              let truncatedJson = jsonText.substring(0, lastCompleteItem + 1);
              
              // Try to close the JSON structure
              // Count what we need to close
              const truncatedOpenBraces = (truncatedJson.match(/\{/g) || []).length;
              const truncatedCloseBraces = (truncatedJson.match(/\}/g) || []).length;
              const truncatedOpenBrackets = (truncatedJson.match(/\[/g) || []).length;
              const truncatedCloseBrackets = (truncatedJson.match(/\]/g) || []).length;
              
              // Close brackets first, then braces
              for (let i = truncatedCloseBrackets; i < truncatedOpenBrackets; i++) {
                truncatedJson += '\n    ]';
              }
              for (let i = truncatedCloseBraces; i < truncatedOpenBraces; i++) {
                truncatedJson += '\n}';
              }
              
              fixedJsonText = truncatedJson;
              jsonFixed = true;
              console.log('[CreateStory] Attempted to fix incomplete JSON by truncating to last complete item');
            }
          }
          
          // Try parsing the fixed JSON
          if (jsonFixed) {
            try {
              const parsed = JSON.parse(fixedJsonText);
              if (parsed && parsed.script && Array.isArray(parsed.script) && parsed.script.length > 0) {
                parsedScreenplayData = parsed;
                setScreenplayData(parsed);
                setScreenplay('');
                setScreenplayError('Note: Response was truncated at token limit. Using partial screenplay.');
                console.log('[CreateStory] Successfully parsed fixed/truncated JSON with', parsed.script.length, 'items');
                // Continue with save logic below - don't return
              } else {
                throw new Error('Fixed JSON still invalid');
              }
            } catch (fixError) {
              console.error('[CreateStory] Failed to parse fixed JSON:', fixError);
              jsonFixed = false; // Fall through to normal error handling
            }
          }
          
          // If fixing didn't work, try fallback to non-streaming
          if (!jsonFixed && streamingSucceeded) {
            console.warn('[CreateStory] JSON parsing failed after streaming - trying non-streaming fallback...');
            setScreenplayError('Streaming response was incomplete. Retrying with non-streaming...');
            
            try {
              const fallbackResult = await aiAPI.generateScreenplay({
                question: prompt,
                system_prompt: systemPrompt,
                max_tokens: maxTokens
              });
              
              if (fallbackResult && fallbackResult.success !== false && fallbackResult.answer) {
                // Retry parsing with complete response
                rawResponse = fallbackResult.answer;
                const fallbackJsonText = rawResponse.trim()
                  .replace(/^```(?:json)?\s*/i, '')
                  .replace(/\s*```\s*$/i, '')
                  .trim();
                
                const jsonMatch = fallbackJsonText.match(/\{[\s\S]*\}/);
                const finalJsonText = jsonMatch ? jsonMatch[0] : fallbackJsonText;
                
                const parsed = JSON.parse(finalJsonText);
                if (parsed && parsed.script && Array.isArray(parsed.script)) {
                  parsedScreenplayData = parsed;
                  setScreenplayData(parsed);
                  setScreenplay('');
                  setScreenplayError(null);
                  console.log('[CreateStory] Successfully parsed after fallback retry');
                  // Continue with save logic below
                } else {
                  throw new Error('Invalid JSON structure after fallback');
                }
              } else {
                throw new Error('Fallback failed');
              }
            } catch (fallbackParseError) {
              console.error('[CreateStory] Fallback parsing also failed:', fallbackParseError);
              setScreenplayError('Error: The AI response was incomplete or malformed. The response may have exceeded the token limit. Try reducing the story length or simplifying the plot.');
              setScreenplayData(null);
              setScreenplay('');
            }
          } else if (!jsonFixed) {
            // Not from streaming and couldn't fix, show error
            setScreenplayError('Error: Response is not valid JSON. The response may have been truncated. Try reducing the story length.');
            setScreenplayData(null);
            setScreenplay('');
          }
          
          // If we still have an error after all attempts, stop here
          if (screenplayError && !parsedScreenplayData) {
            setGeneratingScreenplay(false);
            return;
          }
        }
        
        setScreenplayError(null);
        // Clear any raw screenplay text to prevent JSON display - use screenplayData instead
        setScreenplay(''); 
        setGeneratingScreenplay(false); // Stop loading state
        
        // Automatically save the story after successful screenplay generation
        // Pass the parsed screenplay data directly since state updates are async
        if (parsedScreenplayData) {
          setIsAutoSaving(true);
          try {
            // Save the story - this will create a new story if storyId doesn't exist, or update if it does
            const saveResult = await handleSaveStory(true, parsedScreenplayData); 
            
            // After saving, reload the story data to refresh versions and ensure state is correct
            if (saveResult && saveResult.success) {
              if (editMode && storyId) {
                // For existing stories, reload to get the new version
                console.log('[CreateStory] Reloading story after regeneration...');
                await loadStoryData();
              } else if (saveResult.storyId && !storyId) {
                // For new stories, reload using the returned storyId
                // Note: We can't directly change the storyId prop, but we can reload if we navigate
                // For now, the story is saved and screenplayData is set, so it should display correctly
                console.log('[CreateStory] New story saved with ID:', saveResult.storyId);
                // The formatted screenplay should already be visible via screenplayData
              }
            }
          } catch (saveError) {
            console.error('[CreateStory] Error auto-saving story:', saveError);
            // Don't fail the whole operation if save fails, just log it
          } finally {
            setIsAutoSaving(false);
          }
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
    // This function returns the result with storyId for new stories
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

      // Save as a new version if we have screenplay data and are editing
      let versionToSave = null;
      if (screenplayJson && editMode && storyId && screenplayData) {
        // Get the next version number
        const nextVersion = screenplayVersions.length > 0 
          ? Math.max(...screenplayVersions.map(v => v.version_number)) + 1
          : 1;
        versionToSave = {
          screenplay: screenplayJson,
          version_number: nextVersion,
          is_active: true // New version becomes active
        };
        console.log('[CreateStory] Creating new screenplay version:', {
          version_number: nextVersion,
          screenplay_length: screenplayJson.length
        });
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
          screenplayJson,
          versionToSave
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
        const savedStoryId = result.story_id || result.story?.id;
        console.log('[CreateStory] Story saved successfully with ID:', savedStoryId);
        
        // Return the storyId so caller can use it (e.g., for reloading)
        const saveResult = { storyId: savedStoryId, success: true };
        
        // Reload screenplay versions if we created a new version
        if (editMode && storyId && versionToSave) {
          try {
            const versionsResult = await storyAPI.getScreenplayVersions(storyId);
            if (versionsResult && versionsResult.success && versionsResult.versions) {
              setScreenplayVersions(versionsResult.versions);
              // Set the new version as active
              const newVersion = versionsResult.versions.find(v => v.is_active);
              if (newVersion) {
                setActiveVersionId(newVersion.id);
              }
            }
          } catch (e) {
            console.error('[CreateStory] Error reloading versions:', e);
          }
        }
        
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
        
        return saveResult; // Return result with storyId
      } else {
        const errorMsg = result?.error || 'Failed to save story';
        setSaveError(errorMsg);
        setStorySaved(false);
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      console.error('Error saving story:', error);
      const errorMsg = error.response?.data?.error || 
                       error.response?.data?.detail ||
                       error.message || 
                       'Failed to save story';
      setSaveError(errorMsg);
      setStorySaved(false);
      return { success: false, error: errorMsg };
    } finally {
      setSavingStory(false);
    }
  };

  return (
    <div className="create-story-page">
      <div className="create-story-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
                <div className="create-story-plot-header">
                  <label htmlFor="plot" className="create-story-label">Plot</label>
                  {editMode && selectedUser?.is_admin && (
                    <button
                      className="create-story-delete-btn"
                      onClick={handleDeleteStory}
                      disabled={deleting}
                      title="Delete Story (Admin Only)"
                    >
                      {deleting ? 'Deleting...' : '🗑️ Delete'}
                    </button>
                  )}
                </div>
                <textarea
                  id="plot"
                  className="create-story-textarea"
                  value={plot}
                  onChange={(e) => setPlot(e.target.value)}
                  placeholder="Enter the plot of your story..."
                  rows={6}
                />
              </div>

              {/* Story Length and Age Range */}
              <div className="create-story-field" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="story-length" className="create-story-label">Story Length</label>
                  <select
                    id="story-length"
                    className="create-story-input"
                    value={storyLength}
                    onChange={(e) => setStoryLength(e.target.value)}
                  >
                    <option value="very-short">Very Short (~750 words)</option>
                    <option value="short">Short (~1150 words)</option>
                    <option value="medium">Medium (~2300 words)</option>
                    <option value="long">Long (~4600 words)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="age-range" className="create-story-label">Age Range (optional)</label>
                  <input
                    id="age-range"
                    type="text"
                    className="create-story-input"
                    value={ageRange}
                    onChange={(e) => setAgeRange(e.target.value)}
                    placeholder="e.g., 5-8, 9-12, 13-17, 18+"
                  />
                </div>
              </div>

              {/* Generate Button */}
              <div className="create-story-field">
                <button
                  className="create-story-generate-btn"
                  onClick={handleGenerateScreenplay}
                  disabled={generatingScreenplay || !plot.trim() || selectedPersonas.length === 0}
                >
                  {generatingScreenplay ? 'Generating...' : 'Generate Story'}
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
                <label className="create-story-label">Cast</label>
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
            ) : screenplayData && screenplayData.script && Array.isArray(screenplayData.script) ? (
              <div className="create-story-screenplay-panel">
                <div className="create-story-screenplay-header">
                  <div className="create-story-screenplay-header-left">
                    <h2>Generated Screenplay</h2>
                    <button
                      className="create-story-select-all-btn"
                      onClick={handleSelectAll}
                      disabled={!screenplayData || !screenplayData.script || screenplayData.script.length === 0}
                      title={screenplayData && screenplayData.script && screenplayData.script.every((_, index) => selectedItems.has(index)) ? "Deselect All" : "Select All"}
                    >
                      {screenplayData && screenplayData.script && screenplayData.script.every((_, index) => selectedItems.has(index)) ? '☑ Select All' : '☐ Select All'}
                    </button>
                    <button
                      className="create-story-audio-btn"
                      disabled={!screenplayData || !screenplayData.script || screenplayData.script.length === 0 || selectedItems.size === 0 || !storyId || !editMode || generatingAudio}
                      onClick={handleCreateAudio}
                    >
                      {generatingAudio ? 'Generating...' : 'Create Audio'}
                    </button>
                  </div>
                  <div className="create-story-screenplay-header-right">
                    {screenplayVersions.length > 0 && (
                      <select
                        className="create-story-screenplay-version-select"
                        value={activeVersionId || ''}
                        onChange={async (e) => {
                          const versionId = parseInt(e.target.value);
                          const version = screenplayVersions.find(v => v.id === versionId);
                          if (version) {
                            setActiveVersionId(versionId);
                            loadScreenplayVersion(version.screenplay);
                            
                            // Activate the version on the server
                            if (editMode && storyId) {
                              try {
                                await storyAPI.setActiveVersion(storyId, versionId);
                                // Reload versions to update active status
                                const versionsResult = await storyAPI.getScreenplayVersions(storyId);
                                if (versionsResult && versionsResult.success && versionsResult.versions) {
                                  setScreenplayVersions(versionsResult.versions);
                                }
                              } catch (e) {
                                console.error('[CreateStory] Error activating version:', e);
                              }
                            }
                          }
                        }}
                      >
                        {screenplayVersions.map((v) => (
                          <option key={v.id} value={v.id}>
                            Version {v.version_number} {v.is_active ? '(Active)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {screenplayData && (
                      <div className="create-story-screenplay-stats">
                        {screenplayData.script?.length || 0} lines
                      </div>
                    )}
                  </div>
                </div>
                <div className="create-story-screenplay">
                  {screenplayData && screenplayData.script && Array.isArray(screenplayData.script) ? (
                    <div className="create-story-screenplay-items">
                      {screenplayData.script.map((item, index) => {
                        const speaker = item.speaker || 'unknown';
                        const text = item.text || '';
                        const isNarrator = speaker.toLowerCase() === 'narrator';
                        const isSelected = selectedItems.has(index);
                        const isEditing = editingItemIndex === index;
                        
                        return (
                          <div key={index} className={`create-story-screenplay-item ${isNarrator ? 'narrator' : 'character'} ${isSelected ? 'selected' : ''}`}>
                            <div className="create-story-screenplay-item-header">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleItem(index)}
                                className="create-story-screenplay-checkbox"
                              />
                              <div className="create-story-screenplay-speaker">
                                {speaker.toUpperCase()}
                              </div>
                              <div className="create-story-screenplay-actions">
                                <button
                                  className="create-story-screenplay-edit-btn"
                                  onClick={() => handleEditItem(index)}
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                                <button
                                  className="create-story-screenplay-delete-btn"
                                  onClick={() => handleDeleteItem(index)}
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                            {isEditing ? (
                              <div className="create-story-screenplay-edit">
                                <textarea
                                  className="create-story-screenplay-edit-textarea"
                                  value={editingItemText}
                                  onChange={(e) => setEditingItemText(e.target.value)}
                                  rows={3}
                                />
                                <div className="create-story-screenplay-edit-actions">
                                  <button
                                    className="create-story-screenplay-save-btn"
                                    onClick={handleSaveItem}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="create-story-screenplay-cancel-btn"
                                    onClick={handleCancelItemEdit}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="create-story-screenplay-text">
                                {text}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : generatingScreenplay ? (
              <div className="create-story-loading-panel">
                <div className="create-story-loading-spinner"></div>
                <p>Generating screenplay...</p>
              </div>
            ) : (
              <div className="create-story-empty-panel">
                <p>Generated screenplay will appear here</p>
              </div>
            )}
          </div>
        </div>

        {/* Timeline Footer */}
        <div className={`create-story-timeline-footer ${advancedTimeline ? 'advanced' : ''}`}>
          <div className="create-story-timeline-header">
            <h2>Timeline</h2>
            <div className="create-story-timeline-header-buttons">
              <div className="create-story-timeline-stats" data-duration-version={timelineDurationsVersion}>
                <span>Items: {Object.keys(audioFiles).length}</span>
                <span>Total: {formatDuration(getTimelineTotalDuration())}</span>
                <span>Progress: {formatDuration(currentTimeRef.current)}</span>
              </div>
              <button
                className={`create-story-timeline-advanced-btn ${advancedTimeline ? 'active' : ''}`}
                onClick={() => setAdvancedTimeline(prev => !prev)}
              >
                {advancedTimeline ? 'Advanced: On' : 'Advanced: Off'}
              </button>
              <button
                className="create-story-timeline-play-btn"
                onClick={handlePlayTimeline}
                disabled={!screenplayData || !screenplayData.script || Object.keys(audioFiles).length === 0}
              >
                {isPlayingTimeline ? '⏸️ Pause' : '▶️ Play All'}
              </button>
              <button
                className="create-story-timeline-pause-btn"
                onClick={() => handleSetPauseForAll(500)}
                disabled={Object.keys(audioFiles).length === 0}
              >
                ⏱️ 0.5s Pauses
              </button>
              <button
                className="create-story-timeline-pause-btn"
                onClick={() => handleSetPauseForAll(1000)}
                disabled={Object.keys(audioFiles).length === 0}
              >
                ⏱️ 1s Pauses
              </button>
              <button
                className="create-story-timeline-pause-btn"
                onClick={handleResetPauses}
                disabled={Object.keys(audioFiles).length === 0}
              >
                ⏱️ Reset Pauses
              </button>
              <button
                className="create-story-timeline-build-btn"
                onClick={handleBuild}
                disabled={!screenplayData || !screenplayData.script || Object.keys(audioFiles).length === 0 || !storyId || !editMode}
              >
                🔨 Build
              </button>
            </div>
          </div>
          <div className="create-story-timeline-content">
            {screenplayData && screenplayData.script && screenplayData.script.length > 0 ? (
              (() => {
                // Filter to only show items that have audio files, maintaining screenplay order
                const itemsWithAudio = screenplayData.script
                  .map((item, index) => ({ item, index, audioFile: audioFiles[index] }))
                  .filter(({ audioFile }) => audioFile !== undefined && audioFile !== null);
                
                console.log('[CreateStory] Timeline render - screenplayData.script.length:', screenplayData.script.length);
                console.log('[CreateStory] Timeline render - audioFiles keys:', Object.keys(audioFiles));
                console.log('[CreateStory] Timeline render - itemsWithAudio.length:', itemsWithAudio.length);
                
                if (itemsWithAudio.length === 0) {
                  return (
                    <div className="create-story-timeline-empty">
                      <p>Select items and click "Create Audio" to generate audio files</p>
                    </div>
                  );
                }
                
                return (
                  <div className="create-story-timeline-items">
                    {itemsWithAudio.map(({ item, index, audioFile }, itemIndex) => {
                      const speaker = item.speaker || 'unknown';
                      const text = item.text || '';
                      const isCurrentlyPlaying = currentPlayingIndex === index;
                      const pauseDuration = pauses[index] || 0; // Pause after this item
                      const pauseDurationSeconds = Math.floor(pauseDuration / 1000);
                      const pauseDurationMs = pauseDuration % 1000;
                      const itemDuration = getItemDuration(index);
                      
                      return (
                        <React.Fragment key={index}>
                          <div className={`create-story-timeline-item ${isCurrentlyPlaying ? 'playing' : ''}`}>
                            <div className="create-story-timeline-item-header">
                              <span className="create-story-timeline-item-index">{index + 1}</span>
                              <span className="create-story-timeline-item-speaker">{speaker.toUpperCase()}</span>
                              <span className="create-story-timeline-item-duration">
                                {formatDuration(itemDuration)}
                              </span>
                              {isCurrentlyPlaying && (
                                <span className="create-story-timeline-item-playing-indicator">🔊</span>
                              )}
                              <div className="create-story-timeline-item-menu-container">
                                <button
                                  className="create-story-timeline-item-menu-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTimelineMenuOpen(timelineMenuOpen === index ? null : index);
                                  }}
                                  title="Options"
                                >
                                  ⋮
                                </button>
                                {timelineMenuOpen === index && (
                                  <div className="create-story-timeline-item-menu">
                                    <button
                                      className="create-story-timeline-item-menu-item"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveTimelineItem(index);
                                        setTimelineMenuOpen(null);
                                      }}
                                    >
                                      🗑️ Remove
                                    </button>
                                    <button
                                      className="create-story-timeline-item-menu-item"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditTimelineItem(index, text);
                                        setTimelineMenuOpen(null);
                                      }}
                                    >
                                      ✏️ Edit
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="create-story-timeline-item-text">{text}</div>
                            {advancedTimeline && (
                              <div className="create-story-timeline-item-assets">
                                <div className="create-story-timeline-asset-row">
                                  <span className="create-story-timeline-asset-label">Effects</span>
                                  <div className="create-story-timeline-asset-chips">
                                    {(timelineAssets.effects[index] || []).map((label, assetIndex) => (
                                      <button
                                        key={`fx-${assetIndex}`}
                                        className="create-story-timeline-asset-chip"
                                        onClick={() => handleRemoveTimelineAsset(index, 'effects', assetIndex)}
                                        title="Remove effect"
                                      >
                                        ⚡ {label} ✕
                                      </button>
                                    ))}
                                    <button
                                      className="create-story-timeline-asset-add"
                                      onClick={() => handleAddTimelineAsset(index, 'effects')}
                                    >
                                      + Effect
                                    </button>
                                  </div>
                                </div>
                                <div className="create-story-timeline-asset-row">
                                  <span className="create-story-timeline-asset-label">Background</span>
                                  <div className="create-story-timeline-asset-chips">
                                    {(timelineAssets.ambience[index] || []).map((label, assetIndex) => (
                                      <button
                                        key={`bg-${assetIndex}`}
                                        className="create-story-timeline-asset-chip"
                                        onClick={() => handleRemoveTimelineAsset(index, 'ambience', assetIndex)}
                                        title="Remove background"
                                      >
                                        🌧️ {label} ✕
                                      </button>
                                    ))}
                                    <button
                                      className="create-story-timeline-asset-add"
                                      onClick={() => handleAddTimelineAsset(index, 'ambience')}
                                    >
                                      + Background
                                    </button>
                                  </div>
                                </div>
                                <div className="create-story-timeline-asset-row">
                                  <span className="create-story-timeline-asset-label">Images</span>
                                  <div className="create-story-timeline-asset-chips">
                                    {(timelineAssets.images[index] || []).map((label, assetIndex) => (
                                      <button
                                        key={`img-${assetIndex}`}
                                        className="create-story-timeline-asset-chip"
                                        onClick={() => handleRemoveTimelineAsset(index, 'images', assetIndex)}
                                        title="Remove image"
                                      >
                                        🖼️ {label} ✕
                                      </button>
                                    ))}
                                    <button
                                      className="create-story-timeline-asset-add"
                                      onClick={() => handleAddTimelineAsset(index, 'images')}
                                    >
                                      + Image
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="create-story-timeline-item-audio">
                              <audio 
                                ref={(el) => {
                                  if (el) {
                                    audioRefs.current[index] = el;
                                    // Load metadata to get duration
                                    el.addEventListener('loadedmetadata', () => {
                                      // Duration is now available
                                    });
                                  } else {
                                    delete audioRefs.current[index];
                                  }
                                }}
                                controls 
                                className="create-story-timeline-audio-player"
                                onPlay={() => {
                                  // If manually playing an audio, update current playing index
                                  if (!isPlayingTimeline) {
                                    setCurrentPlayingIndex(index);
                                  }
                                }}
                                onPause={() => {
                                  // If manually pausing, clear playing state if not in sequence mode
                                  if (!isPlayingTimeline && currentPlayingIndex === index) {
                                    setCurrentPlayingIndex(null);
                                  }
                                }}
                                onLoadedMetadata={(e) => {
                                  // Audio metadata loaded, duration is now available
                                  const audioElement = e.target;
                                  if (audioElement && audioElement.duration) {
                                    durationsRef.current[index] = audioElement.duration;
                                    setTimelineDurationsVersion(prev => prev + 1);
                                  }
                                }}
                              >
                                <source src={`/${audioFile.file_path}`} type="audio/mpeg" />
                                Your browser does not support the audio element.
                              </audio>
                            </div>
                          </div>
                          {/* Pause element between items (except after last item) */}
                          {itemIndex < itemsWithAudio.length - 1 && (
                            <div 
                              className={`create-story-timeline-pause ${isPausing && currentPlayingIndex === index ? 'pausing' : ''}`}
                              style={{ 
                                width: `${Math.max(40, pauseDuration / 10)}px`,
                                minWidth: '40px'
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setEditingPause({ index, startX: e.clientX, startWidth: pauseDuration });
                              }}
                              title={`Pause: ${pauseDurationSeconds}s ${pauseDurationMs}ms (Drag to adjust)`}
                            >
                              <div className="create-story-timeline-pause-handle">
                                <div className="create-story-timeline-pause-drag-indicator">⋮⋮</div>
                                <div className="create-story-timeline-pause-duration">
                                  {pauseDurationSeconds > 0 ? `${pauseDurationSeconds}s` : ''}
                                  {pauseDurationMs > 0 ? ` ${pauseDurationMs}ms` : pauseDurationSeconds === 0 ? '0ms' : ''}
                                </div>
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              <div className="create-story-timeline-empty">
                <p>Generate screenplay and audio to see timeline</p>
              </div>
            )}
            {/* Progress Bar */}
            {screenplayData && screenplayData.script && Object.keys(audioFiles).length > 0 && (
              <div className="create-story-timeline-progress-container">
                <div className="create-story-timeline-progress-bar">
                  <div 
                    className="create-story-timeline-progress-fill"
                    style={{ width: `${timelineProgress}%` }}
                  ></div>
                </div>
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

      {/* Timeline Item Edit Modal */}
      {editingTimelineItem && (
        <div className="create-story-modal-overlay" onClick={handleCancelTimelineItemEdit}>
          <div className="create-story-modal" onClick={(e) => e.stopPropagation()}>
            <div className="create-story-modal-header">
              <h3>Edit Timeline Item</h3>
              <button
                className="create-story-modal-close"
                onClick={handleCancelTimelineItemEdit}
              >
                ×
              </button>
            </div>
            <div className="create-story-modal-content">
              <div className="create-story-field">
                <label className="create-story-label">Text</label>
                <textarea
                  className="create-story-input"
                  value={timelineEditText}
                  onChange={(e) => setTimelineEditText(e.target.value)}
                  rows={6}
                  placeholder="Enter text..."
                />
              </div>
            </div>
            <div className="create-story-modal-actions">
              <button
                className="create-story-modal-btn create-story-modal-cancel"
                onClick={handleCancelTimelineItemEdit}
              >
                Cancel
              </button>
              <button
                className="create-story-modal-btn create-story-modal-save"
                onClick={handleSaveTimelineItemEdit}
              >
                Save & Regenerate Audio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Build Complete Modal */}
      {buildCompleteModal && (
        <div className="create-story-modal-overlay" onClick={() => setBuildCompleteModal(null)}>
          <div className="create-story-modal" onClick={(e) => e.stopPropagation()}>
            <div className="create-story-modal-header">
              <h3>Complete Audio Generated</h3>
              <button
                className="create-story-modal-close"
                onClick={() => setBuildCompleteModal(null)}
              >
                ×
              </button>
            </div>
            <div className="create-story-modal-content">
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '10px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {buildCompleteModal.title}
                  {buildCompleteModal.savedToDb && (
                    <span style={{ color: '#16c782', fontSize: '1.5rem' }} title="Saved to database">✓</span>
                  )}
                </h4>
                <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '10px' }}>
                  Duration: {buildCompleteModal.duration}s
                </p>
                <p style={{ color: '#888', fontSize: '0.85rem' }}>
                  File: {buildCompleteModal.filename}
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '20px' }}>
                <audio
                  ref={buildAudioRef}
                  src={buildCompleteModal.audioUrl}
                  controls
                  style={{ width: '100%', maxWidth: '500px' }}
                />
              </div>
            </div>
            <div className="create-story-modal-actions">
              <button
                className="create-story-modal-btn create-story-modal-save"
                onClick={() => setBuildCompleteModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
