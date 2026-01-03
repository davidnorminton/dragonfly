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
    } catch (error) {
      console.error('Error selecting persona:', error);
      throw error;
    }
  };

  useEffect(() => {
    loadPersonas();
  }, []);

  return { personas, currentPersona, currentTitle, loading, selectPersona, reload: loadPersonas };
}

