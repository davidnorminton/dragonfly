/**
 * Video playback progress tracking
 */

export const videoProgressAPI = {
  /**
   * Get saved progress for a video
   */
  async getProgress(videoType, videoId) {
    try {
      const response = await fetch(`/api/video/progress/${videoType}/${videoId}`);
      if (response.ok) {
        return await response.json();
      }
      return { position: 0, completed: false };
    } catch (error) {
      console.error('Error getting progress:', error);
      return { position: 0, completed: false };
    }
  },

  /**
   * Save current playback progress
   */
  async saveProgress(videoType, videoId, position, duration) {
    try {
      await fetch('/api/video/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_type: videoType,
          video_id: videoId,
          position,
          duration
        })
      });
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  },

  /**
   * Get next episode to play
   */
  async getNextEpisode(episodeId) {
    try {
      const response = await fetch(`/api/video/next-episode/${episodeId}`);
      if (response.ok) {
        return await response.json();
      }
      return { next_episode: null };
    } catch (error) {
      console.error('Error getting next episode:', error);
      return { next_episode: null };
    }
  }
};
