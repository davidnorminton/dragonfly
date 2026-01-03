import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export const systemAPI = {
  getStats: () => api.get('/system/stats').then(res => res.data),
  getUptime: () => api.get('/system/uptime').then(res => res.data),
};

export const chatAPI = {
  getHistory: (limit = 50, offset = 0) => 
    api.get('/chat', { params: { limit, offset } }).then(res => res.data),
  sendMessage: async (message, sessionId, serviceName = 'ai_service', stream = true) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: sessionId, service_name: serviceName, stream }),
    });
    return response;
  },
};

export const personaAPI = {
  getPersonas: () => api.get('/personas').then(res => res.data),
  selectPersona: (persona) => 
    api.post('/personas/select', { persona }).then(res => res.data),
};

export const locationAPI = {
  getLocation: () => api.get('/location').then(res => res.data),
};

export const weatherAPI = {
  getWeather: () => api.get('/weather').then(res => res.data),
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

export default api;

