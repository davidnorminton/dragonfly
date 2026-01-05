import { useState, useEffect } from 'react';
import { routerAPI } from '../services/api';

const DEFAULT_BASE_PROMPT = [
  '# === System message ===',
  'You are an AI assistant designed to classify input and return a JSON object describing the type of request. You only output JSON. Do not add extra text.',
  '',
  'Rules:',
  '  • Each rule has a trigger (the input text or pattern) and a type (task or question).',
  '  • When input matches a rule, return a JSON object with type and value.',
  '  • If input does not match any rule, classify it as a question by default.',
  '  • Each rule also has a reason: use it to confirm you chose the correct rule and to guide similar future queries. If multiple rules seem similar, pick the one whose reason best matches the user intent.',
  '',
  'Rules list (example):',
].join('\n');

const DEFAULT_RULES = [
  {
    trigger: 'get time',
    type: 'task',
    value: 'get_time',
    reason: 'User asked for current time',
  },
  {
    trigger: 'what is the capital of china',
    type: 'question',
    value: 'what is the capital of china',
    reason: 'User asked a geography fact',
  },
  {
    trigger: 'get date',
    type: 'task',
    value: 'get_date',
    reason: 'User asked for current date',
  },
];

// Parse rules from prompt_context by scanning lines for trigger/type/value[/reason] triplets.
function extractRules(prompt) {
  const rules = [];
  if (!prompt) return { rules, basePrompt: prompt || '' };

  const lines = prompt.split(/\r?\n/);
  const used = new Set();

  for (let i = 0; i < lines.length; i++) {
    const norm = (lines[i] || '').trim().replace(/^•\s*/, '').toLowerCase();
    if (norm.startsWith('trigger:')) {
      const trigger = lines[i].replace(/^•\s*/, '').split(':').slice(1).join(':').trim();
      // Look ahead for type and value
      let type = '';
      let value = '';
      let reason = '';
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const n = (lines[j] || '').trim().replace(/^•\s*/, '').toLowerCase();
        if (n.startsWith('type:') && !type) {
          type = lines[j].replace(/^•\s*/, '').split(':').slice(1).join(':').trim();
          used.add(j);
        } else if (n.startsWith('value:') && !value) {
          value = lines[j].replace(/^•\s*/, '').split(':').slice(1).join(':').trim();
          used.add(j);
        } else if (n.startsWith('reason:') && !reason) {
          reason = lines[j].replace(/^•\s*/, '').split(':').slice(1).join(':').trim();
          used.add(j);
        }
      }
      rules.push({ trigger, type, value, reason });
      used.add(i);
    }
  }

  const baseLines = lines.filter((_, idx) => !used.has(idx));
  const basePrompt = baseLines.join('\n').trim();

  return { rules, basePrompt };
}

function buildPrompt(basePrompt, rules) {
  let prompt = (basePrompt || '').trim();
  if (rules && rules.length) {
    prompt += '\n\n# Rules\n';
    rules.forEach((r) => {
      prompt += `trigger: ${r.trigger || ''}\n`;
      prompt += `type: ${r.type || ''}\n`;
      prompt += `value: ${r.value || ''}\n`;
      if (r.reason) {
        prompt += `reason: ${r.reason}\n`;
      }
      prompt += '\n';
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
        const rawPrompt = anth.prompt_context || '';
        const decodedPrompt = (rawPrompt || '').replace(/\\n/g, '\n');
        const { rules: parsedRules, basePrompt: bp } = extractRules(decodedPrompt || '');
        const base = (bp && bp.trim()) ? bp : DEFAULT_BASE_PROMPT;
        const parsedOrDefault = parsedRules.length >= DEFAULT_RULES.length ? parsedRules : DEFAULT_RULES;
        setBasePrompt(base);
        setRules(parsedOrDefault);
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
    setRules((prev) => [...prev, { trigger: '', type: '', value: '', reason: '' }]);
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

