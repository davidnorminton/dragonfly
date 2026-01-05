import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export const systemAPI = {
  getStats: () => api.get('/system/stats').then(res => res.data),
  getUptime: () => api.get('/system/uptime').then(res => res.data),
  getIPs: () => api.get('/system/ips').then(res => res.data),
  restart: () => api.post('/system/restart').then(res => res.data),
};

export const chatAPI = {
  getHistory: (limit = 50, offset = 0, sessionId = null, mode = null, persona = null) => {
    const params = { limit, offset };
    if (sessionId) params.session_id = sessionId;
    if (mode) params.mode = mode;
    if (persona) params.persona = persona;
    return api.get('/chat', { params }).then(res => res.data);
  },
  sendMessage: async (message, sessionId, mode = 'qa', expertType = 'general', stream = true) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message, 
        session_id: sessionId, 
        mode,
        expert_type: expertType,
        stream 
      }),
    });
    return response;
  },
};

export const expertTypesAPI = {
  getExpertTypes: () => api.get('/expert-types').then(res => res.data),
};

export const personaAPI = {
  getPersonas: () => api.get('/personas').then(res => res.data),
  selectPersona: (persona) => 
    api.post('/personas/select', { persona }).then(res => res.data),
};

export const locationAPI = {
  getLocation: () => api.get('/location').then(res => res.data),
};

export const routerAPI = {
  getRouterConfig: () => api.get('/config/router').then(res => res.data),
  saveRouterConfig: (config) => api.put('/config/router', config).then(res => res.data),
  route: (payload) => api.post('/router/route', payload, { responseType: 'blob' }),
};

export const musicAPI = {
  scanMusic: () => api.get('/music/scan').then(res => res.data),
  getMetadata: (path) => api.get('/music/metadata', { params: { path } }).then(res => res.data),
  getPopular: (artist) => api.get('/music/popular', { params: { artist } }).then(res => res.data),
  generatePopular: (artist) => api.post('/music/popular', { artist }).then(res => res.data),
};

export const weatherAPI = {
  getWeather: () => api.get('/weather').then(res => res.data),
};

export const trafficAPI = {
  getTraffic: (radiusMiles = 30) => 
    api.get('/traffic', { params: { radius_miles: radiusMiles } }).then(res => res.data),
};

export const newsAPI = {
  getNews: (feedType = 'top_stories', limit = 20) => 
    api.get('/news', { params: { feed_type: feedType, limit } }).then(res => res.data),
  summarizeArticle: (url) => api.post('/news/summarize', { url }).then(res => res.data),
};

export const ttsAPI = {
  generate: async (text, messageId, persona) => {
    const response = await fetch('/api/tts/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, message_id: messageId, persona }),
    });
    return response;
  },
};

export const configAPI = {
  getPersonas: () => api.get('/personas').then(res => res.data),
  getPersonaConfig: (personaName) => api.get(`/config/persona/${personaName}`).then(res => res.data),
  savePersonaConfig: (personaName, config) => api.put(`/config/persona/${personaName}`, config).then(res => res.data),
  createPersona: (personaName, config) => api.post(`/config/persona/${personaName}`, config).then(res => res.data),
  getLocationConfig: () => api.get('/config/location').then(res => res.data),
  saveLocationConfig: (config) => api.put('/config/location', config).then(res => res.data),
  getApiKeysConfig: () => api.get('/config/api_keys').then(res => res.data),
  saveApiKeysConfig: (config) => api.put('/config/api_keys', config).then(res => res.data),
};

export const deviceAPI = {
  getDevices: () => api.get('/devices').then(res => res.data),
  getHealth: () => api.get('/devices/health').then(res => res.data),
};

export const networkAPI = {
  getActivity: () => api.get('/network/activity').then(res => res.data),
};

export const statsAPI = {
  getQuickStats: () => api.get('/stats/quick').then(res => res.data),
};

export const actionsAPI = {
  executeAction: (action) => api.post('/actions/execute', { action }).then(res => res.data),
};

export const audioAPI = {
  playLastMessage: (sessionId) => api.post('/audio/last-message', { session_id: sessionId }).then(res => res.data),
  generateAudioForMessage: (sessionId, messageId) => api.post('/audio/message', { session_id: sessionId, message_id: messageId }).then(res => res.data),
};

export default api;

