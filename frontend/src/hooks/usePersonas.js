import { useState, useEffect } from 'react';
import { personaAPI } from '../services/api';

export function usePersonas() {
  const [personas, setPersonas] = useState([]);
  const [currentPersona, setCurrentPersona] = useState('');
  const [currentTitle, setCurrentTitle] = useState('CYBER');
  const [loading, setLoading] = useState(true);

  const loadPersonas = async () => {
    try {
      const data = await personaAPI.getPersonas();
      setPersonas(data.personas || []);
      setCurrentPersona(data.current || 'default');
      setCurrentTitle(data.current_title || 'CYBER');
      setLoading(false);
    } catch (error) {
      console.error('Error loading personas:', error);
      setLoading(false);
    }
  };

  const selectPersona = async (personaName) => {
    try {
      await personaAPI.selectPersona(personaName);
      await loadPersonas();
      // Trigger a custom event so other components can refresh
      window.dispatchEvent(new CustomEvent('personaChanged'));
    } catch (error) {
      console.error('Error selecting persona:', error);
      throw error;
    }
  };

  useEffect(() => {
    loadPersonas();
    
    // Listen for persona changes from other components
    const handlePersonaChange = () => {
      loadPersonas();
    };
    
    window.addEventListener('personaChanged', handlePersonaChange);
    
    return () => {
      window.removeEventListener('personaChanged', handlePersonaChange);
    };
  }, []);

  return { personas, currentPersona, currentTitle, loading, selectPersona, reload: loadPersonas };
}

