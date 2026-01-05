import { useState, useEffect } from 'react';
import { routerAPI } from '../services/api';

export function useRouterConfig(open) {
  const [routerConfig, setRouterConfig] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!open) return;
    const loadConfig = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await routerAPI.getRouterConfig();
        setRouterConfig(JSON.stringify(data, null, 2));
      } catch (err) {
        console.error('Error loading router config:', err);
        setError('Failed to load router config');
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, [open]);

  const saveRouter = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const cfg = JSON.parse(routerConfig);
      await routerAPI.saveRouterConfig(cfg);
      setSuccess('Router config saved');
    } catch (err) {
      console.error('Error saving router config:', err);
      setError(err.message || 'Failed to save router config');
    } finally {
      setSaving(false);
    }
  };

  const addRule = () => {
    try {
      const cfg = JSON.parse(routerConfig || '{}');
      const anth = cfg.anthropic || {};
      const prompt = anth.prompt_context || '';
      const snippet = "\n\n# Rule\ntrigger: <your trigger>\ntype: <task|question>\nvalue: <value>";
      anth.prompt_context = prompt + snippet;
      cfg.anthropic = anth;
      setRouterConfig(JSON.stringify(cfg, null, 2));
    } catch (err) {
      setError('Invalid JSON; cannot add rule. Fix JSON first.');
    }
  };

  return {
    routerConfig,
    setRouterConfig,
    loading,
    error,
    saving,
    success,
    saveRouter,
    addRule,
  };
}

