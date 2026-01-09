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
  getSessions: () => api.get('/chat/sessions').then(res => res.data),
  createSession: (sessionId) => api.post('/chat/sessions', { session_id: sessionId }).then(res => res.data),
  deleteSession: (sessionId) => api.delete(`/chat/sessions/${sessionId}`).then(res => res.data),
  getSessionTitle: (sessionId) => api.get(`/chat/sessions/${sessionId}/title`).then(res => res.data),
  updateSessionTitle: (sessionId, title) => api.put(`/chat/sessions/${sessionId}/title`, { title }).then(res => res.data),
};

export const expertTypesAPI = {
  getExpertTypes: () => api.get('/expert-types').then(res => res.data),
};

export const personaAPI = {
  getPersonas: () => api.get('/personas').then(res => res.data),
  selectPersona: (persona) => 
    api.post('/personas/select', { persona }).then(res => res.data),
  getFillerWords: (personaName) => 
    api.get(`/personas/${personaName}/filler-words`).then(res => res.data),
  createFillerWord: (personaName, text) => 
    api.post(`/personas/${personaName}/filler-words`, { text }).then(res => res.data),
  deleteFillerWord: (personaName, filename) => 
    api.delete(`/personas/${personaName}/filler-words/${filename}`).then(res => res.data),
  getFillerWordAudio: (personaName, filename) => 
    `/api/personas/${personaName}/filler-words/${filename}/audio`,
};

export const locationAPI = {
  getLocation: () => api.get('/location').then(res => res.data),
};

export const routerAPI = {
  getRouterConfig: () => api.get('/config/router').then(res => res.data),
  saveRouterConfig: (config) => api.put('/config/router', config).then(res => res.data),
  route: (payload) => api.post('/router/route', payload, { responseType: 'blob' }),
  routeStream: (payload) => api.post('/router/route-stream', payload, { responseType: 'blob' }),
};

export const aiAPI = {
  askQuestion: (payload) => api.post('/ai/ask', payload).then(res => res.data),
  askQuestionAudio: (payload) => api.post('/ai/ask-audio', payload, { responseType: 'blob' }),
  askQuestionStream: (payload, onChunk) => {
    // Use EventSource for Server-Sent Events
    return new Promise((resolve, reject) => {
      fetch(`${api.defaults.baseURL}/ai/ask-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(response => {
        if (!response.ok) {
          reject(new Error(`HTTP ${response.status}`));
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        const processText = ({ done, value }) => {
          if (done) {
            resolve();
            return;
          }
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                onChunk(data);
              } catch (e) {
                console.error('Failed to parse SSE:', e);
              }
            }
          }
          
          reader.read().then(processText);
        };
        
        reader.read().then(processText);
      }).catch(reject);
    });
  },
  askQuestionAudioStream: (payload) => api.post('/ai/ask-audio-stream', payload, { responseType: 'blob' }),
  askQuestionAudioFast: (payload) => api.post('/ai/ask-audio-fast', payload, { responseType: 'blob' }),
  getFillerAudio: (persona) => api.get('/ai/filler-audio', { 
    params: { 
      ...(persona ? { persona } : {}),
      _t: Date.now() // Cache buster
    }, 
    responseType: 'blob' 
  }),
};

export const musicAPI = {
  getLibrary: () => api.get('/music/library').then(res => res.data),
  scanMusic: () => api.get('/music/scan').then(res => res.data),
  clearMusic: () => api.post('/music/clear').then(res => res.data),
  getMetadata: (path) => api.get('/music/metadata', { params: { path } }).then(res => res.data),
  getPopular: (artist) => api.get('/music/popular', { params: { artist } }).then(res => res.data),
  generatePopular: (artist) => api.post('/music/popular', { artist }).then(res => res.data),
  getAbout: (artist) => api.get('/music/artist/about', { params: { artist } }).then(res => res.data),
  generateAbout: (artist) => api.post('/music/artist/about', { artist }).then(res => res.data),
  getDiscography: (artist) => api.get('/music/artist/discography', { params: { artist } }).then(res => res.data),
  generateDiscography: (artist) => api.post('/music/artist/discography', { artist }).then(res => res.data),
  getVideos: (artist) => api.get('/music/artist/videos', { params: { artist } }).then(res => res.data),
  generateVideos: (artist) => api.post('/music/artist/videos', { artist }).then(res => res.data),
  clearAllVideos: () => api.delete('/music/artist/videos').then(res => res.data),
  getPlaylists: () => api.get('/music/playlists').then(res => res.data),
  createPlaylist: (name) => api.post('/music/playlists', { name }).then(res => res.data),
  addToPlaylist: (payload) => api.post('/music/playlists/add', payload).then(res => res.data),
  removeFromPlaylist: (playlistName, songPath) => api.delete('/music/playlists/remove', { params: { playlist_name: playlistName, song_path: songPath } }).then(res => res.data),
  getEditorData: () => api.get('/music/editor/data').then(res => res.data),
  updateArtist: (id, data) => api.put('/music/artist/update', null, { params: { artist_id: id, ...data } }).then(res => res.data),
  updateAlbum: (id, data) => api.put('/music/album/update', null, { params: { album_id: id, ...data } }).then(res => res.data),
  updateSong: (id, data) => api.put('/music/song/update', null, { params: { song_id: id, ...data } }).then(res => res.data),
  addArtistVideo: (artist, video) => api.post('/music/artist/video/add', { artist, videoId: video.videoId, title: video.title }).then(res => res.data),
  updateArtistVideo: (artist, originalVideoId, video) => api.put('/music/artist/video/update', { artist, originalVideoId, videoId: video.videoId, title: video.title }).then(res => res.data),
  deleteArtistVideo: (artist, videoId) => api.delete('/music/artist/video/delete', { data: { artist, videoId } }).then(res => res.data),
  trackPlay: (path, duration) => api.post('/music/track-play', { path, duration }).then(res => res.data),
  getAnalytics: () => api.get('/music/analytics').then(res => res.data),
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
  summarizeArticle: (url, title) => api.post('/news/summarize', { url, title }).then(res => res.data),
};

export const databaseAPI = {
  getTables: () => api.get('/database/tables').then(res => res.data),
  getTableData: (tableName, page = 1, limit = 50) => 
    api.get(`/database/tables/${tableName}/data`, { params: { page, limit } }).then(res => res.data),
  updateTableRow: (tableName, rowId, data) => 
    api.put(`/database/tables/${tableName}/data/${rowId}`, data).then(res => res.data),
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
  getSystemConfig: () => api.get('/config/system').then(res => res.data),
  saveSystemConfig: (config) => api.put('/config/system', config).then(res => res.data),
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

export const octopusAPI = {
  getConsumption: () => api.get('/octopus/consumption').then(res => res.data),
  getHistory: (days = 7) => api.get('/octopus/history', { params: { days } }).then(res => res.data),
  getTariff: () => api.get('/octopus/tariff').then(res => res.data),
  getTariffHistory: (days = 7) => api.get('/octopus/tariff-history', { params: { days } }).then(res => res.data),
};

export const alarmsAPI = {
  getAlarms: () => api.get('/alarms').then(res => res.data),
  createAlarm: (alarm) => api.post('/alarms', alarm).then(res => res.data),
  deleteAlarm: (alarmId) => api.delete(`/alarms/${alarmId}`).then(res => res.data),
  toggleAlarm: (alarmId) => api.post(`/alarms/${alarmId}/toggle`).then(res => res.data),
  checkAlarms: () => api.get('/alarms/check').then(res => res.data),
};

export default api;

