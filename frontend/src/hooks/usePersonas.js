import { useState, useEffect, useCallback } from 'react';
import { personaAPI } from '../services/api';

export function usePersonas(selectedUserId = null) {
  const [personas, setPersonas] = useState([]);
  const [currentPersona, setCurrentPersona] = useState('');
  const [currentTitle, setCurrentTitle] = useState('CYBER');
  const [loading, setLoading] = useState(true);

  const loadPersonas = async (userId = null) => {
    try {
      const data = await personaAPI.getPersonas(userId);
      setPersonas(data.personas || []);
      // Only update if we got a valid response
      if (data.current) {
        setCurrentPersona(data.current);
      }
      if (data.current_title) {
        setCurrentTitle(data.current_title);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading personas:', error);
      setLoading(false);
    }
  };

  const selectPersona = async (personaName, userId = null) => {
    try {
      // Optimistically update the UI immediately
      setCurrentPersona(personaName);
      
      // Save to backend
      await personaAPI.selectPersona(personaName, userId);
      
      // Reload to get the updated persona and title from backend
      await loadPersonas(userId);
      
      // Trigger a custom event so other components can refresh
      // NOTE: Components should NOT use this event to trigger question resends or session resets
      window.dispatchEvent(new CustomEvent('personaChanged', { 
        detail: { 
          personaName, 
          userId,
          // Include a flag to indicate this should NOT trigger any automatic actions
          preventAutoActions: true 
        } 
      }));
    } catch (error) {
      console.error('Error selecting persona:', error);
      // Revert on error
      await loadPersonas(userId);
      throw error;
    }
  };

  useEffect(() => {
    console.log('[usePersonas] Loading personas for userId:', selectedUserId);
    loadPersonas(selectedUserId);
    
    // Listen for persona changes from other components
    const handlePersonaChange = () => {
      console.log('[usePersonas] Persona changed event, reloading for userId:', selectedUserId);
      loadPersonas(selectedUserId);
    };
    
    window.addEventListener('personaChanged', handlePersonaChange);
    
    return () => {
      window.removeEventListener('personaChanged', handlePersonaChange);
    };
  }, [selectedUserId]);

  const reload = useCallback(() => {
    console.log('[usePersonas] Manual reload called for userId:', selectedUserId);
    loadPersonas(selectedUserId);
  }, [selectedUserId]);

  return { personas, currentPersona, currentTitle, loading, selectPersona, reload };
}

