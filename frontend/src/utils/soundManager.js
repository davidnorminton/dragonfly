// Sound Manager for game sound effects
// Uses Web Audio API for better performance and control

class SoundManager {
  constructor() {
    this.audioContext = null;
    this.muted = localStorage.getItem('gameSoundsMuted') === 'true';
    this.sounds = {};
    this.initAudioContext();
  }

  initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  // Generate a beep tone
  generateTone(frequency, duration, type = 'sine', volume = 0.3) {
    if (!this.audioContext || this.muted) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      
      gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (e) {
      // Silently fail if audio context is not available
    }
  }

  // Play a sound effect
  playSound(type, options = {}) {
    if (this.muted) return;
    
    const sounds = {
      // Shooting sounds
      shoot: () => this.generateTone(800, 0.1, 'square', 0.2),
      shoot2: () => this.generateTone(600, 0.15, 'square', 0.25),
      shoot3: () => this.generateTone(400, 0.2, 'square', 0.3),
      
      // Explosion sounds
      explosion: () => {
        this.generateTone(200, 0.3, 'sawtooth', 0.4);
        setTimeout(() => this.generateTone(100, 0.2, 'sawtooth', 0.3), 50);
      },
      explosion2: () => {
        this.generateTone(150, 0.4, 'sawtooth', 0.5);
        setTimeout(() => this.generateTone(80, 0.3, 'sawtooth', 0.4), 100);
      },
      
      // Hit/collision sounds
      hit: () => this.generateTone(300, 0.1, 'square', 0.3),
      hit2: () => this.generateTone(250, 0.15, 'square', 0.35),
      enemyHit: () => this.generateTone(200, 0.2, 'sawtooth', 0.4),
      
      // Jump/movement sounds
      jump: () => this.generateTone(600, 0.1, 'sine', 0.2),
      move: () => this.generateTone(400, 0.05, 'sine', 0.15),
      
      // Power-up/collect sounds
      collect: () => {
        this.generateTone(800, 0.1, 'sine', 0.3);
        setTimeout(() => this.generateTone(1000, 0.1, 'sine', 0.3), 50);
      },
      powerUp: () => {
        this.generateTone(600, 0.1, 'sine', 0.3);
        setTimeout(() => this.generateTone(800, 0.1, 'sine', 0.3), 50);
        setTimeout(() => this.generateTone(1000, 0.1, 'sine', 0.3), 100);
      },
      
      // Game events
      gameOver: () => {
        this.generateTone(200, 0.3, 'sawtooth', 0.5);
        setTimeout(() => this.generateTone(150, 0.3, 'sawtooth', 0.5), 200);
        setTimeout(() => this.generateTone(100, 0.4, 'sawtooth', 0.5), 400);
      },
      levelUp: () => {
        this.generateTone(600, 0.1, 'sine', 0.3);
        setTimeout(() => this.generateTone(800, 0.1, 'sine', 0.3), 100);
        setTimeout(() => this.generateTone(1000, 0.2, 'sine', 0.3), 200);
      },
      score: () => this.generateTone(1000, 0.1, 'sine', 0.25),
      
      // Special sounds
      magic: () => {
        this.generateTone(400, 0.2, 'sine', 0.4);
        setTimeout(() => this.generateTone(600, 0.2, 'sine', 0.4), 100);
        setTimeout(() => this.generateTone(800, 0.3, 'sine', 0.4), 200);
      },
      flap: () => this.generateTone(500, 0.1, 'sine', 0.2),
      bounce: () => this.generateTone(400, 0.15, 'square', 0.3),
      break: () => this.generateTone(300, 0.2, 'sawtooth', 0.4),
      
      // Pac-Man specific
      eat: () => this.generateTone(800, 0.05, 'sine', 0.2),
      eatPower: () => {
        this.generateTone(600, 0.1, 'sine', 0.3);
        setTimeout(() => this.generateTone(400, 0.1, 'sine', 0.3), 50);
      },
      
      // Frogger specific
      hop: () => this.generateTone(600, 0.1, 'sine', 0.2),
      splash: () => {
        this.generateTone(200, 0.3, 'sawtooth', 0.4);
        setTimeout(() => this.generateTone(150, 0.2, 'sawtooth', 0.3), 100);
      },
      
      // Golden Axe specific
      attack: () => this.generateTone(500, 0.15, 'square', 0.3),
      swordHit: () => {
        this.generateTone(400, 0.1, 'square', 0.4);
        setTimeout(() => this.generateTone(300, 0.1, 'square', 0.3), 50);
      }
    };
    
    if (sounds[type]) {
      sounds[type]();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('gameSoundsMuted', this.muted.toString());
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }
}

// Export singleton instance
export const soundManager = new SoundManager();
