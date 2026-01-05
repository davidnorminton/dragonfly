import { useState, useEffect } from 'react';
import { routerAPI } from '../services/api';

// Parse rules from a prompt_context string.
// Looks for triplets:
// trigger: ...
// type: ...
// value: ...
function extractRules(prompt) {
  const rules = [];
  if (!prompt) return { rules, basePrompt: prompt || '' };
  const regex = /trigger:\s*(.+?)\s*[\r\n]+type:\s*(.+?)\s*[\r\n]+value:\s*(.+?)(?=(?:\r?\n\r?\n|$))/gis;
  let match;
  const segments = [];
  let lastIndex = 0;
  while ((match = regex.exec(prompt)) !== null) {
    rules.push({
      trigger: match[1].trim(),
      type: match[2].trim(),
      value: match[3].trim(),
    });
    segments.push({ start: match.index, end: regex.lastIndex });
    lastIndex = regex.lastIndex;
  }
  // Remove matched rule segments to get base prompt
  if (segments.length === 0) return { rules, basePrompt: prompt };
  let base = '';
  let idx = 0;
  for (const seg of segments) {
    base += prompt.slice(idx, seg.start);
    idx = seg.end;
  }
  base += prompt.slice(idx);
  return { rules, basePrompt: base.trim() };
}

function buildPrompt(basePrompt, rules) {
  let prompt = (basePrompt || '').trim();
  if (rules && rules.length) {
    prompt += '\n\n# Rules\n';
    rules.forEach((r) => {
      prompt += `trigger: ${r.trigger || ''}\n`;
      prompt += `type: ${r.type || ''}\n`;
      prompt += `value: ${r.value || ''}\n\n`;
    });
    prompt = prompt.trimEnd();
  }
  return prompt;
}

export function useRouterConfig(open) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);

  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState('');
  const [topP, setTopP] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [basePrompt, setBasePrompt] = useState('');
  const [rules, setRules] = useState([]);

  useEffect(() => {
    if (!open) return;
    const loadConfig = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await routerAPI.getRouterConfig();
        const anth = data?.anthropic || {};
        setModel(anth.anthropic_model || '');
        setTemperature(
          anth.temperature === undefined || anth.temperature === null
            ? ''
            : String(anth.temperature),
        );
        setTopP(
          anth.top_p === undefined || anth.top_p === null
            ? ''
            : String(anth.top_p),
        );
        setMaxTokens(
          anth.max_tokens === undefined || anth.max_tokens === null
            ? ''
            : String(anth.max_tokens),
        );
        const { rules: parsedRules, basePrompt: bp } = extractRules(anth.prompt_context || '');
        setBasePrompt(bp);
        setRules(parsedRules.length ? parsedRules : [{ trigger: '', type: '', value: '' }]);
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
      const cfg = {
        title: 'router',
        anthropic: {
          anthropic_model: model || undefined,
          temperature: temperature === '' ? undefined : Number(temperature),
          top_p: topP === '' ? undefined : Number(topP),
          max_tokens: maxTokens === '' ? undefined : Number(maxTokens),
          prompt_context: buildPrompt(basePrompt, rules || []),
        },
      };
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
    setRules((prev) => [...prev, { trigger: '', type: '', value: '' }]);
  };

  const updateRule = (index, field, value) => {
    setRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const removeRule = (index) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  return {
    loading,
    error,
    saving,
    success,
    model,
    temperature,
    topP,
    maxTokens,
    basePrompt,
    rules,
    setModel,
    setTemperature,
    setTopP,
    setMaxTokens,
    setBasePrompt,
    saveRouter,
    addRule,
    updateRule,
    removeRule,
  };
}

