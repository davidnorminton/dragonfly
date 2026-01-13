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
      setCurrentPersona(data.current || 'default');
      setCurrentTitle(data.current_title || 'CYBER');
      setLoading(false);
    } catch (error) {
      console.error('Error loading personas:', error);
      setLoading(false);
    }
  };

  const selectPersona = async (personaName, userId = null) => {
    try {
      await personaAPI.selectPersona(personaName, userId);
      await loadPersonas(userId);
      // Trigger a custom event so other components can refresh
      window.dispatchEvent(new CustomEvent('personaChanged'));
    } catch (error) {
      console.error('Error selecting persona:', error);
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

