import { useEffect, useRef } from 'react';

export function WaveformMic({ status }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const barsRef = useRef([]);
  
  // Initialize bars
  useEffect(() => {
    const numBars = 32;
    barsRef.current = Array.from({ length: numBars }, (_, i) => ({
      angle: (i * 360) / numBars,
      height: 0.3 + Math.random() * 0.2,
      velocity: 0.01 + Math.random() * 0.02,
      phase: Math.random() * Math.PI * 2
    }));
  }, []);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const size = 160;
    const centerX = size / 2;
    const centerY = size / 2;
    const innerRadius = 35;
    const maxBarHeight = 40;
    
    // Set canvas size
    canvas.width = size;
    canvas.height = size;
    
    const isActive = status === 'listening' || status === 'playing';
    const isListening = status === 'listening';
    const isPlaying = status === 'playing';
    
    let time = 0;
    
    const animate = () => {
      ctx.clearRect(0, 0, size, size);
      
      // Draw background circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, innerRadius + 5, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0f';
      ctx.fill();
      ctx.strokeStyle = isListening ? 'rgba(74, 144, 226, 0.6)' : isPlaying ? 'rgba(22, 199, 130, 0.6)' : '#333';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      if (!isActive) {
        // Static microphone icon when idle
        ctx.fillStyle = '#666';
        
        // Mic body
        ctx.beginPath();
        ctx.roundRect(centerX - 8, centerY - 15, 16, 22, 8);
        ctx.fill();
        
        // Mic base
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.roundRect(centerX - 10, centerY + 8, 20, 4, 2);
        ctx.fill();
        
        // Mic stand
        ctx.beginPath();
        ctx.moveTo(centerX, centerY + 12);
        ctx.lineTo(centerX, centerY + 22);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // Base line
        ctx.beginPath();
        ctx.moveTo(centerX - 8, centerY + 22);
        ctx.lineTo(centerX + 8, centerY + 22);
        ctx.stroke();
      } else {
        // Animated waveform bars
        time += 0.1;
        
        barsRef.current.forEach((bar) => {
          // Update bar height with wave motion
          if (isListening) {
            bar.height = 0.4 + Math.sin(time * bar.velocity * 2 + bar.phase) * 0.35 + Math.random() * 0.15;
          } else if (isPlaying) {
            bar.height = 0.5 + Math.sin(time * bar.velocity * 3 + bar.phase) * 0.4 + Math.random() * 0.1;
          }
          
          // Calculate position
          const angleRad = (bar.angle * Math.PI) / 180;
          const barHeight = bar.height * maxBarHeight;
          
          // Start and end points
          const x1 = centerX + Math.cos(angleRad) * innerRadius;
          const y1 = centerY + Math.sin(angleRad) * innerRadius;
          const x2 = centerX + Math.cos(angleRad) * (innerRadius + barHeight);
          const y2 = centerY + Math.sin(angleRad) * (innerRadius + barHeight);
          
          // Draw bar
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          
          if (isListening) {
            // Blue gradient for listening
            const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
            gradient.addColorStop(0, 'rgba(74, 144, 226, 0.4)');
            gradient.addColorStop(1, 'rgba(74, 144, 226, 1)');
            ctx.strokeStyle = gradient;
          } else if (isPlaying) {
            // Green gradient for playing
            const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
            gradient.addColorStop(0, 'rgba(22, 199, 130, 0.4)');
            gradient.addColorStop(1, 'rgba(22, 199, 130, 1)');
            ctx.strokeStyle = gradient;
          }
          
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.stroke();
          
          // Add glow effect
          ctx.shadowBlur = 8;
          ctx.shadowColor = isListening ? 'rgba(74, 144, 226, 0.8)' : 'rgba(22, 199, 130, 0.8)';
          ctx.stroke();
          ctx.shadowBlur = 0;
        });
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [status]);
  
  return (
    <canvas 
      ref={canvasRef}
      style={{
        width: '160px',
        height: '160px',
        display: 'block'
      }}
    />
  );
}

