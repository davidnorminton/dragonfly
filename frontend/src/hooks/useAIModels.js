import { useState, useEffect } from 'react';
import { configAPI } from '../services/api';

export function useAIModels() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await configAPI.getAIModels();
        if (response.success && response.models) {
          setModels(response.models);
        } else {
          setError('Failed to load AI models');
        }
      } catch (err) {
        console.error('Error fetching AI models:', err);
        setError(err.message || 'Failed to load AI models');
        // Set default models on error - from https://platform.claude.com/docs/en/about-claude/models/overview
        setModels([
          // Latest Claude 4.5 models
          { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', context_window: 200000, max_output: 64000 },
          { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', context_window: 200000, max_output: 64000 },
          { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', context_window: 200000, max_output: 64000 },
          // Legacy but still available Claude 4 models
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', context_window: 200000, max_output: 64000 },
          { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1', context_window: 200000, max_output: 32000 },
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', context_window: 200000, max_output: 32000 },
          { id: 'claude-3-7-sonnet-20250219', name: 'Claude Sonnet 3.7', context_window: 200000, max_output: 64000 },
          // Legacy Claude 3 Haiku
          { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', context_window: 200000, max_output: 4000 }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  return { models, loading, error };
}
