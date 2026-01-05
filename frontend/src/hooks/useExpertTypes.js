import { useState, useEffect } from 'react';
import { expertTypesAPI } from '../services/api';

export function useExpertTypes() {
  const [expertTypes, setExpertTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExpertTypes();
  }, []);

  const loadExpertTypes = async () => {
    try {
      const data = await expertTypesAPI.getExpertTypes();
      setExpertTypes(data.expert_types || []);
    } catch (error) {
      console.error('Error loading expert types:', error);
    } finally {
      setLoading(false);
    }
  };

  return { expertTypes, loading };
}


