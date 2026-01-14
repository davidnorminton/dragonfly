import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export const systemAPI = {
  getStats: () => api.get('/system/stats').then(res => res.data),
  getUptime: () => api.get('/system/uptime').then(res => res.data),
  getIPs: () => api.get('/system/ips').then(res => res.data),
  restart: () => api.post('/system/restart').then(res => res.data),
  getApiHealth: () => api.get('/system/api-health').then(res => res.data),
};

export const aiFocusAPI = {
  saveMessage: (question, answer, mode, persona, userId, audioFilePath, sessionId = null) => {
    const payload = {
      question,
      answer,
      mode,
      persona,
      user_id: userId,
      audio_file_path: audioFilePath
    };
    if (sessionId) {
      payload.session_id = sessionId;
    }
    return api.post('/ai/focus/save-message', payload).then(res => res.data);
  },
  saveAudio: (text, messageId) => {
    return api.post('/ai/focus/save-audio', {
      text,
      message_id: messageId
    }).then(res => res.data);
  },
  getSessions: (userId) => {
    const params = userId ? { user_id: userId } : {};
    return api.get('/ai/focus/sessions', { params }).then(res => res.data);
  },
  createSession: (sessionId, userId) => {
    const body = { session_id: sessionId };
    if (userId) body.user_id = userId;
    return api.post('/chat/sessions', body).then(res => res.data);
  },
  getHistory: (sessionId, limit = 50, offset = 0) => {
    return api.get('/chat', { 
      params: { session_id: sessionId, limit, offset } 
    }).then(res => res.data);
  },
};

export const chatAPI = {
  getHistory: (limit = 50, offset = 0, sessionId = null, mode = null, persona = null) => {
    const params = { limit, offset };
    if (sessionId) params.session_id = sessionId;
    if (mode) params.mode = mode;
    if (persona) params.persona = persona;
    return api.get('/chat', { params }).then(res => res.data);
  },
  sendMessage: async (message, sessionId, mode = 'qa', expertType = 'general', stream = true, presetId = null) => {
    const body = {
      message,
      session_id: sessionId,
      mode,
      expert_type: expertType,
      stream,
      preset_id: presetId
    };

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response;
  },
  getSessions: (userId) => {
    const params = userId ? { user_id: userId } : {};
    return api.get('/chat/sessions', { params }).then(res => res.data);
  },
  createSession: (sessionId, userId) => {
    const body = { session_id: sessionId };
    if (userId) body.user_id = userId;
    return api.post('/chat/sessions', body).then(res => res.data);
  },
  deleteSession: (sessionId) => api.delete(`/chat/sessions/${sessionId}`).then(res => res.data),
  getSessionTitle: (sessionId) => api.get(`/chat/sessions/${sessionId}/title`).then(res => res.data),
  updateSessionTitle: (sessionId, title) => api.put(`/chat/sessions/${sessionId}/title`, { title }).then(res => res.data),
  togglePin: (sessionId, pinned) => api.put(`/chat/sessions/${sessionId}/pin`, { pinned }).then(res => res.data),
  updateSessionPreset: (sessionId, presetId) => api.put(`/chat/sessions/${sessionId}/preset`, { preset_id: presetId }).then(res => res.data),
  searchMessages: (query, userId, limit = 50) => {
    const params = { query, limit };
    if (userId) params.user_id = userId;
    return api.get('/chat/search', { params }).then(res => res.data);
  },
};

export const expertTypesAPI = {
  getExpertTypes: () => api.get('/expert-types').then(res => res.data),
};

export const storyAPI = {
  createStory: (title, plot, cast, userId, narrator, screenplay) => {
    console.log('[API] createStory called with:', {
      title,
      plotLength: plot?.length,
      castCount: cast?.length,
      userId,
      narrator,
      hasScreenplay: !!screenplay,
      screenplayLength: screenplay?.length,
      screenplayPreview: screenplay?.substring(0, 100)
    });
    return api.post('/stories', {
      title,
      plot,
      cast,
      user_id: userId,
      narrator_persona: narrator,
      screenplay: screenplay
    }).then(res => {
      console.log('[API] createStory response:', res.data);
      return res.data;
    });
  },
  getStories: (userId) => {
    const params = userId ? { user_id: userId } : {};
    return api.get('/stories', { params }).then(res => res.data);
  },
  getStory: (storyId) => {
    return api.get(`/stories/${storyId}`).then(res => res.data);
  },
  updateStory: (storyId, title, plot, cast, userId, narrator, screenplay) => {
    console.log('[API] updateStory called with:', {
      storyId,
      title,
      plotLength: plot?.length,
      castCount: cast?.length,
      userId,
      narrator,
      hasScreenplay: !!screenplay,
      screenplayLength: screenplay?.length,
      screenplayPreview: screenplay?.substring(0, 100)
    });
    return api.put(`/stories/${storyId}`, {
      title,
      plot,
      cast,
      user_id: userId,
      narrator_persona: narrator,
      screenplay: screenplay
    }).then(res => {
      console.log('[API] updateStory response:', res.data);
      return res.data;
    });
  },
};

export const personaAPI = {
  getPersonas: (userId) => {
    const params = userId ? { user_id: userId } : {};
    return api.get('/personas', { params }).then(res => res.data);
  },
  selectPersona: (persona, userId) =>
    api.post('/personas/select', { persona, user_id: userId }).then(res => res.data),
  getFillerWords: (personaName) =>
    api.get(`/personas/${encodeURIComponent(personaName)}/filler-words`).then(res => res.data),
  createFillerWord: (personaName, text) =>
    api.post(`/personas/${encodeURIComponent(personaName)}/filler-words`, { text }).then(res => res.data),
  getPersonaContext: (personaName) =>
    api.get(`/personas/${encodeURIComponent(personaName)}/context`)
      .then(res => res.data)
      .catch(error => {
        console.error(`Error fetching persona context for ${personaName}:`, error);
        // Return a safe default response
        return {
          success: false,
          error: error.response?.data?.detail || error.message || 'Unknown error',
          context: ''
        };
      }),
  deleteFillerWord: (personaName, filename) => 
    api.delete(`/personas/${encodeURIComponent(personaName)}/filler-words/${encodeURIComponent(filename)}`).then(res => res.data),
  getFillerWordAudio: (personaName, filename) => 
    `/api/personas/${encodeURIComponent(personaName)}/filler-words/${encodeURIComponent(filename)}/audio`,
  getVoices: () => api.get('/voices').then(res => res.data),
  setPersonaVoice: (personaName, voiceId) => 
    api.put(`/personas/${encodeURIComponent(personaName)}/voice`, { voice_id: voiceId }).then(res => res.data),
  createVoice: (voiceData) => 
    api.post('/voices', voiceData).then(res => res.data),
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
  generateScreenplay: (payload) => {
    console.log('[API] generateScreenplay called with payload:', {
      questionLength: payload.question?.length,
      systemPromptLength: payload.system_prompt?.length,
      max_tokens: payload.max_tokens
    });
    return api.post('/ai/generate-screenplay', payload)
      .then(res => {
        console.log('[API] generateScreenplay response:', res.data);
        return res.data;
      })
      .catch(error => {
        console.error('[API] generateScreenplay error:', error);
        console.error('[API] Error response:', error.response?.data);
        throw error;
      });
  },
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

export const videoAPI = {
  getLibrary: () => api.get('/video/library').then(res => res.data),
  scanVideos: () => api.get('/video/scan').then(res => res.data),
  clearVideos: () => api.post('/video/clear').then(res => res.data),
  convertVideos: () => api.post('/video/convert').then(res => res.data),
  
  async getCastCrew(title, year) {
    const response = await fetch('/api/video/cast-crew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, year })
    });
    if (!response.ok) throw new Error('Failed to get cast and crew');
    return response.json();
  },

  async getPersonFilmography(name, role) {
    const response = await fetch('/api/video/person-filmography', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role })
    });
    if (!response.ok) throw new Error('Failed to get filmography');
    return response.json();
  },

  async generateAllFilmographies(castList) {
    const response = await fetch('/api/video/generate-all-filmographies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cast: castList })
    });
    if (!response.ok) throw new Error('Failed to generate filmographies');
    return response.json();
  },

  async getSavedFilmography(actorName) {
    const response = await fetch(`/api/video/actor-filmography/${encodeURIComponent(actorName)}`);
    if (!response.ok) throw new Error('Failed to get saved filmography');
    return response.json();
  },

  async searchByActor(actorName) {
    const response = await fetch(`/api/video/search-by-actor/${encodeURIComponent(actorName)}`);
    if (!response.ok) throw new Error('Failed to search by actor');
    return response.json();
  },

  async getTVCastCrew(title, year) {
    const response = await fetch('/api/video/tv-cast-crew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, year })
    });
    if (!response.ok) throw new Error('Failed to get TV show cast and crew');
    return response.json();
  },

  async getSimilarContent(contentType, contentId) {
    const response = await fetch(`/api/video/similar/${contentType}/${contentId}`);
    if (!response.ok) throw new Error('Failed to get similar content');
    return response.json();
  },

  async generateSimilarContent(contentType, contentId, title, year, description, genres) {
    const response = await fetch('/api/video/generate-similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content_type: contentType,
        content_id: contentId,
        title,
        year,
        description,
        genres
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to generate similar content:', response.status, errorText);
      throw new Error(`Failed to generate similar content: ${response.status} ${errorText}`);
    }
    return response.json();
  },

  async getRecentlyPlayed() {
    const response = await fetch('/api/video/recently-played');
    if (!response.ok) throw new Error('Failed to get recently played');
    return response.json();
  },
  
  async getRecentlyAdded() {
    const response = await fetch('/api/video/recently-added');
    if (!response.ok) throw new Error('Failed to get recently added');
    return response.json();
  }
};

export const musicAPI = {
  getLibrary: () => api.get('/music/library').then(res => res.data),
  getRecentlyPlayed: () => api.get('/music/recently-played').then(res => res.data),
  getRecentlyAdded: () => api.get('/music/recently-added').then(res => res.data),
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
  getPlaylists: (userId) => {
    const params = userId ? { user_id: userId } : {};
    return api.get('/music/playlists', { params }).then(res => res.data);
  },
  listPlaylists: (userId) => {
    // Alias for getPlaylists
    const params = userId ? { user_id: userId } : {};
    return api.get('/music/playlists', { params }).then(res => res.data);
  },
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
  convertAndCleanup: (directoryPath) => api.post('/music/convert-and-cleanup', { directory_path: directoryPath }).then(res => res.data),
  scanConversion: (directoryPath) => api.post('/music/scan-conversion', { directory_path: directoryPath }).then(res => res.data),
  scanMissingCovers: (directoryPath) => api.post('/music/scan-missing-covers', { directory_path: directoryPath }).then(res => res.data),
  downloadCoverArt: (artist, album, targetPath) => api.post('/music/download-cover-art', { artist, album, target_path: targetPath }).then(res => res.data),
  deleteArtist: (artistName) => api.delete(`/music/artist/${encodeURIComponent(artistName)}`).then(res => res.data),
  cleanupInvalidArtists: () => api.post('/music/cleanup-invalid-artists').then(res => res.data),
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
  getPersonaConfig: (personaName) => api.get(`/config/persona/${encodeURIComponent(personaName)}`).then(res => res.data),
  savePersonaConfig: (personaName, config) => api.put(`/config/persona/${encodeURIComponent(personaName)}`, config).then(res => res.data),
  createPersona: (personaName, config) => api.post(`/config/persona/${encodeURIComponent(personaName)}`, config).then(res => res.data),
  deletePersona: (personaName) => api.delete(`/config/persona/${encodeURIComponent(personaName)}`).then(res => res.data),
  getLocationConfig: () => api.get('/config/location').then(res => res.data),
  saveLocationConfig: (config) => api.put('/config/location', config).then(res => res.data),
  getApiKeysConfig: () => api.get('/config/api_keys').then(res => res.data),
  saveApiKeysConfig: (config) => api.put('/config/api_keys', config).then(res => res.data),
  getSystemConfig: () => api.get('/config/system').then(res => res.data),
  saveSystemConfig: (config) => api.put('/config/system', config).then(res => res.data),
  getAIModels: () => api.get('/config/ai-models').then(res => res.data),
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

export const usersAPI = {
  getUsers: () => api.get('/users').then(res => res.data),
  createUser: (userData) => api.post('/users', userData).then(res => res.data),
  updateUser: (userId, userData) => api.put(`/users/${userId}`, userData).then(res => res.data),
  deleteUser: (userId) => api.delete(`/users/${userId}`).then(res => res.data),
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

