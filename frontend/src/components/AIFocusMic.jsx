import { useState, useEffect, useRef } from 'react';
import { WaveformMic } from './WaveformMic';
import { getPersonaImageUrl } from '../utils/personaImageHelper';

export function AIFocusMic({ personas, currentPersona, currentTitle, micStatus, showPixelAvatar = false }) {
  const [showAvatar, setShowAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [imageError, setImageError] = useState(false);
  const canvasRef = useRef(null);
  const [mouthOpen, setMouthOpen] = useState(false);
  const [eyeExpression, setEyeExpression] = useState('normal'); // normal, listening, thinking
  const [eyeDirection, setEyeDirection] = useState('center'); // left, center, right
  const [blinkState, setBlinkState] = useState('open'); // open, half, closed
  const animationRef = useRef(null);
  const idleAnimationRef = useRef(null);

  useEffect(() => {
    // Reset state when persona changes
    setImageError(false);
    setShowAvatar(false);
    setAvatarUrl(null);

    if (personas && personas.length > 0 && currentPersona) {
      const currentPersonaData = personas.find(p => p.name === currentPersona);
      
      if (currentPersonaData && currentPersonaData.image_path) {
        const imagePath = currentPersonaData.image_path;
        if (imagePath && 
            imagePath !== 'null' && 
            imagePath !== 'undefined' &&
            String(imagePath).trim() !== '') {
          const url = getPersonaImageUrl(imagePath, currentPersona);
          if (url) {
            setAvatarUrl(url);
            setShowAvatar(true);
          }
        }
      }
    }
  }, [personas, currentPersona]);

  // Animation loop for talking and expressions
  useEffect(() => {
    if (!showPixelAvatar) {
      return;
    }
    
    // Clear any existing animations
    if (animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }
    if (idleAnimationRef.current) {
      clearInterval(idleAnimationRef.current);
      idleAnimationRef.current = null;
    }
    
    // Set expressions based on status
    if (micStatus === 'listening') {
      setEyeExpression('listening');
      setEyeDirection('center');
      setBlinkState('open');
      setMouthOpen(false);
    } else if (micStatus === 'thinking') {
      setEyeExpression('thinking');
      setEyeDirection('center');
      setBlinkState('open');
      // Start mouth animation when thinking (speaking)
      animationRef.current = setInterval(() => {
        setMouthOpen(prev => !prev);
      }, 200); // Toggle every 200ms for talking effect
    } else {
      // Idle state - animate eyes looking around and blinking
      setEyeExpression('normal');
      setMouthOpen(false);
      
      const idleSequence = [
        { direction: 'center', blink: 'open', duration: 1500 },
        { direction: 'right', blink: 'open', duration: 1200 },
        { direction: 'center', blink: 'open', duration: 800 },
        { direction: 'left', blink: 'open', duration: 1200 },
        { direction: 'center', blink: 'open', duration: 1000 },
        { direction: 'center', blink: 'half', duration: 150 },
        { direction: 'center', blink: 'closed', duration: 150 },
        { direction: 'center', blink: 'open', duration: 2000 },
        { direction: 'right', blink: 'open', duration: 1000 },
        { direction: 'center', blink: 'open', duration: 500 },
      ];
      
      let currentStep = 0;
      const runIdleAnimation = () => {
        const step = idleSequence[currentStep];
        setEyeDirection(step.direction);
        setBlinkState(step.blink);
        
        currentStep = (currentStep + 1) % idleSequence.length;
        idleAnimationRef.current = setTimeout(runIdleAnimation, step.duration);
      };
      
      runIdleAnimation();
    }
    
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
      if (idleAnimationRef.current) {
        clearTimeout(idleAnimationRef.current);
      }
    };
  }, [showPixelAvatar, micStatus]);

  useEffect(() => {
    if (!showPixelAvatar) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const size = canvas.width;
    const grid = 32;
    const pixel = Math.floor(size / grid);
    
    // Define colors
    const bg = '#505050';      // dark grey background
    const eyelid = '#505050';  // eyelid (same as background)
    const eyeOutline = '#000000'; // black eye outline
    const eyeWhite = '#FFFFFF'; // eye white
    const iris = '#6B9BD1';    // iris (blue)
    const pupil = '#505050';   // pupil (same as background)
    const mouthLine = '#1A1A1A'; // mouth line (black)
    const mouthOpen = '#1A1A1A'; // mouth open (black)
    
    // Clear and fill background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    
    // Helper function to draw a pixel
    const drawPixel = (x, y, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * pixel, y * pixel, pixel, pixel);
    };
    
    // LEFT EYE - wider, circular with dynamic eyelid position based on expression
    // Determine eyelid position based on expression and blink state
    let eyelidRow = eyeExpression === 'listening' ? 10 : 11; // More open when listening
    if (blinkState === 'half') {
      eyelidRow = 13;
    } else if (blinkState === 'closed') {
      eyelidRow = 16;
    }
    
    // Determine pupil/iris position based on eye direction
    let irisOffset = 0;
    if (eyeDirection === 'left') {
      irisOffset = -2;
    } else if (eyeDirection === 'right') {
      irisOffset = 1;
    }
    
    // Row 8 - outline top corners
    for (let x = 8; x <= 13; x++) drawPixel(x, 8, eyeOutline);
    
    // Row 9 - outline + eyelid
    drawPixel(7, 9, eyeOutline);
    for (let x = 8; x <= 13; x++) drawPixel(x, 9, eyelid);
    drawPixel(14, 9, eyeOutline);
    
    // Row 10 - outline + eyelid or white depending on expression
    drawPixel(6, 10, eyeOutline);
    if (eyelidRow >= 10) {
      for (let x = 7; x <= 14; x++) drawPixel(x, 10, eyelid);
    } else {
      for (let x = 7; x <= 14; x++) drawPixel(x, 10, eyeWhite);
    }
    drawPixel(15, 10, eyeOutline);
    
    // Row 11 - outline + eyelid or white depending on expression
    drawPixel(6, 11, eyeOutline);
    if (eyelidRow >= 11) {
      for (let x = 7; x <= 14; x++) drawPixel(x, 11, eyelid);
    } else {
      for (let x = 7; x <= 14; x++) drawPixel(x, 11, eyeWhite);
    }
    drawPixel(15, 11, eyeOutline);
    
    // Row 12 - outline + white (bottom half visible)
    drawPixel(6, 12, eyeOutline);
    for (let x = 7; x <= 14; x++) drawPixel(x, 12, eyeWhite);
    drawPixel(15, 12, eyeOutline);
    
    // Row 13 - outline + white + iris (with offset)
    drawPixel(6, 13, eyeOutline);
    for (let x = 7; x <= 14; x++) {
      const irisStart = 10 + irisOffset;
      const irisEnd = 11 + irisOffset;
      if (x >= irisStart && x <= irisEnd) {
        drawPixel(x, 13, iris);
      } else {
        drawPixel(x, 13, eyeWhite);
      }
    }
    drawPixel(15, 13, eyeOutline);
    
    // Row 14 - outline + white + iris + pupil (with offset)
    drawPixel(6, 14, eyeOutline);
    for (let x = 7; x <= 14; x++) {
      const irisStart = 10 + irisOffset;
      const pupilPos = 11 + irisOffset;
      if (x === irisStart) {
        drawPixel(x, 14, iris);
      } else if (x === pupilPos) {
        drawPixel(x, 14, pupil);
      } else {
        drawPixel(x, 14, eyeWhite);
      }
    }
    drawPixel(15, 14, eyeOutline);
    
    // Row 15 - outline + white + iris (with offset)
    drawPixel(6, 15, eyeOutline);
    for (let x = 7; x <= 14; x++) {
      const irisStart = 10 + irisOffset;
      const irisEnd = 11 + irisOffset;
      if (x >= irisStart && x <= irisEnd) {
        drawPixel(x, 15, iris);
      } else {
        drawPixel(x, 15, eyeWhite);
      }
    }
    drawPixel(15, 15, eyeOutline);
    
    // Row 16 - outline + white
    drawPixel(6, 16, eyeOutline);
    for (let x = 7; x <= 14; x++) drawPixel(x, 16, eyeWhite);
    drawPixel(15, 16, eyeOutline);
    
    // Row 17 - outline + white (no lower lid)
    drawPixel(7, 17, eyeOutline);
    for (let x = 8; x <= 13; x++) drawPixel(x, 17, eyeWhite);
    drawPixel(14, 17, eyeOutline);
    
    // Row 18 - outline bottom (no lower lid)
    for (let x = 8; x <= 13; x++) drawPixel(x, 18, eyeOutline);
    
    // RIGHT EYE - wider, circular with dynamic eyelid position (right next to left eye)
    // Row 8 - outline top corners
    for (let x = 18; x <= 23; x++) drawPixel(x, 8, eyeOutline);
    
    // Row 9 - outline + eyelid
    drawPixel(17, 9, eyeOutline);
    for (let x = 18; x <= 23; x++) drawPixel(x, 9, eyelid);
    drawPixel(24, 9, eyeOutline);
    
    // Row 10 - outline + eyelid or white depending on expression
    drawPixel(16, 10, eyeOutline);
    if (eyelidRow >= 10) {
      for (let x = 17; x <= 24; x++) drawPixel(x, 10, eyelid);
    } else {
      for (let x = 17; x <= 24; x++) drawPixel(x, 10, eyeWhite);
    }
    drawPixel(25, 10, eyeOutline);
    
    // Row 11 - outline + eyelid or white depending on expression
    drawPixel(16, 11, eyeOutline);
    if (eyelidRow >= 11) {
      for (let x = 17; x <= 24; x++) drawPixel(x, 11, eyelid);
    } else {
      for (let x = 17; x <= 24; x++) drawPixel(x, 11, eyeWhite);
    }
    drawPixel(25, 11, eyeOutline);
    
    // Row 12 - outline + white (bottom half visible)
    drawPixel(16, 12, eyeOutline);
    for (let x = 17; x <= 24; x++) drawPixel(x, 12, eyeWhite);
    drawPixel(25, 12, eyeOutline);
    
    // Row 13 - outline + white + iris (with offset)
    drawPixel(16, 13, eyeOutline);
    for (let x = 17; x <= 24; x++) {
      const irisStart = 20 + irisOffset;
      const irisEnd = 21 + irisOffset;
      if (x >= irisStart && x <= irisEnd) {
        drawPixel(x, 13, iris);
      } else {
        drawPixel(x, 13, eyeWhite);
      }
    }
    drawPixel(25, 13, eyeOutline);
    
    // Row 14 - outline + white + iris + pupil (with offset)
    drawPixel(16, 14, eyeOutline);
    for (let x = 17; x <= 24; x++) {
      const pupilPos = 20 + irisOffset;
      const irisPos = 21 + irisOffset;
      if (x === pupilPos) {
        drawPixel(x, 14, pupil);
      } else if (x === irisPos) {
        drawPixel(x, 14, iris);
      } else {
        drawPixel(x, 14, eyeWhite);
      }
    }
    drawPixel(25, 14, eyeOutline);
    
    // Row 15 - outline + white + iris (with offset)
    drawPixel(16, 15, eyeOutline);
    for (let x = 17; x <= 24; x++) {
      const irisStart = 20 + irisOffset;
      const irisEnd = 21 + irisOffset;
      if (x >= irisStart && x <= irisEnd) {
        drawPixel(x, 15, iris);
      } else {
        drawPixel(x, 15, eyeWhite);
      }
    }
    drawPixel(25, 15, eyeOutline);
    
    // Row 16 - outline + white
    drawPixel(16, 16, eyeOutline);
    for (let x = 17; x <= 24; x++) drawPixel(x, 16, eyeWhite);
    drawPixel(25, 16, eyeOutline);
    
    // Row 17 - outline + white (no lower lid)
    drawPixel(17, 17, eyeOutline);
    for (let x = 18; x <= 23; x++) drawPixel(x, 17, eyeWhite);
    drawPixel(24, 17, eyeOutline);
    
    // Row 18 - outline bottom (no lower lid)
    for (let x = 18; x <= 23; x++) drawPixel(x, 18, eyeOutline);
    
    // MOUTH - changes based on talking state
    if (mouthOpen) {
      // Open mouth - oval shape
      // Row 21 - top outline
      for (let x = 12; x <= 19; x++) drawPixel(x, 21, mouthLine);
      
      // Row 22 - sides + open
      drawPixel(11, 22, mouthLine);
      for (let x = 12; x <= 19; x++) drawPixel(x, 22, mouthOpen);
      drawPixel(20, 22, mouthLine);
      
      // Row 23 - sides + open
      drawPixel(11, 23, mouthLine);
      for (let x = 12; x <= 19; x++) drawPixel(x, 23, mouthOpen);
      drawPixel(20, 23, mouthLine);
      
      // Row 24 - sides + open
      drawPixel(11, 24, mouthLine);
      for (let x = 12; x <= 19; x++) drawPixel(x, 24, mouthOpen);
      drawPixel(20, 24, mouthLine);
      
      // Row 25 - bottom outline
      for (let x = 12; x <= 19; x++) drawPixel(x, 25, mouthLine);
    } else {
      // Closed mouth - simple line
      // Row 23 - top line
      for (let x = 10; x <= 21; x++) drawPixel(x, 23, mouthLine);
      
      // Row 24 - bottom line
      for (let x = 10; x <= 21; x++) drawPixel(x, 24, mouthLine);
    }
  }, [showPixelAvatar, mouthOpen, eyeExpression, eyeDirection, blinkState]);

  if (showAvatar && avatarUrl && !imageError) {
    return (
      <div className="ai-focus-persona-avatar">
        {showPixelAvatar ? (
          <canvas
            ref={canvasRef}
            width={160}
            height={160}
            className={`ai-focus-pixel-canvas ${
              ['listening', 'processing', 'playing'].includes(micStatus) ? 'active' : ''
            }`}
            aria-label={currentTitle || 'Persona'}
          />
        ) : (
          <img 
            src={avatarUrl} 
            alt={currentTitle || 'Persona'}
            className={`persona-avatar-img ${
              ['listening', 'processing', 'playing'].includes(micStatus) ? 'active' : ''
            }`}
            onError={() => {
              setImageError(true);
              setShowAvatar(false);
            }}
          />
        )}
        {['listening', 'processing', 'playing'].includes(micStatus) && (
          <div className="persona-avatar-pulse"></div>
        )}
      </div>
    );
  }

  return <WaveformMic status={micStatus} />;
}
