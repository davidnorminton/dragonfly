import { useState, useEffect, useRef } from 'react';
import { AIFocusMic } from '../components/AIFocusMic';
import { usePersonas } from '../hooks/usePersonas';
import { aiAPI, aiFocusAPI, chatAPI } from '../services/api';
import { getProfileImageUrl } from '../utils/profileImageHelper';
import { getPersonaImageUrl } from '../utils/personaImageHelper';

export function AIFocusPage({ selectedUser, onNavigate }) {
  const [micStream, setMicStream] = useState(null);
  const [micStatus, setMicStatus] = useState('idle'); // idle | listening | processing | playing | error
  const [micError, setMicError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [routerText, setRouterText] = useState('');
  const [aiResponseText, setAiResponseText] = useState(''); // Display AI response text immediately
  const [audioObj, setAudioObj] = useState(null);
  const [fillerAudioObj, setFillerAudioObj] = useState(null); // Filler audio for immediate feedback
  const [micRestartKey, setMicRestartKey] = useState(0);
  const [aiFocusMode, setAiFocusMode] = useState('question'); // 'question' or 'task'
  const [aiFocusConversations, setAiFocusConversations] = useState([]); // Array of {question, answer, persona, messageId, audioFile} objects
  const [playingAudioId, setPlayingAudioId] = useState(null); // Track which audio is currently playing
  const [aiFocusTitle, setAiFocusTitle] = useState(''); // Chat title for AI focus mode
  const [aiFocusSessions, setAiFocusSessions] = useState([]); // List of AI focus sessions
  const [currentAiFocusSessionId, setCurrentAiFocusSessionId] = useState(null); // Current session ID
  const [aiFocusSessionTitles, setAiFocusSessionTitles] = useState({}); // Session titles
  const [editingAiFocusSessionId, setEditingAiFocusSessionId] = useState(null); // Session being edited
  const [editingAiFocusTitle, setEditingAiFocusTitle] = useState(''); // Title being edited
  const [openAiFocusMenuId, setOpenAiFocusMenuId] = useState(null); // Open menu ID
  const [aiFocusMenuPosition, setAiFocusMenuPosition] = useState({ top: 0, right: 0 }); // Menu position
  const [generatingAiFocusTitle, setGeneratingAiFocusTitle] = useState(null); // Session generating title
  const [deleteConfirmAiFocusSession, setDeleteConfirmAiFocusSession] = useState(null); // Session to delete
  const [showPersonaSelector, setShowPersonaSelector] = useState(false); // Show persona selector popup
  const [showPixelAvatar, setShowPixelAvatar] = useState(false);
  const [useBrowserSpeech, setUseBrowserSpeech] = useState(() => {
    // Load from localStorage
    const saved = localStorage.getItem('aiFocusUseBrowserSpeech');
    return saved === 'true';
  }); // Use browser speech synthesis instead of server TTS
  const [isSpeaking, setIsSpeaking] = useState(false); // Track if speech synthesis is active
  const speechQueueRef = useRef([]); // Queue of text chunks to speak
  const currentUtteranceRef = useRef(null); // Current utterance being spoken
  
  const { selectPersona, currentTitle, personas, currentPersona, reload: reloadPersonas } = usePersonas(selectedUser?.id);
  
  // Save browser speech preference to localStorage
  useEffect(() => {
    localStorage.setItem('aiFocusUseBrowserSpeech', useBrowserSpeech.toString());
  }, [useBrowserSpeech]);
  
  // Browser Speech Synthesis functions
  const stopBrowserSpeech = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      speechQueueRef.current = [];
      currentUtteranceRef.current = null;
      setIsSpeaking(false);
    }
  };
  
  const speakText = (text) => {
    if (!window.speechSynthesis || !text.trim()) return;
    
    // Split text into sentences for better chunking
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      if (trimmed) {
        speechQueueRef.current.push(trimmed);
      }
    });
    
    // Start speaking if not already
    if (!isSpeaking) {
      processNextInQueue();
    }
  };
  
  const processNextInQueue = () => {
    if (speechQueueRef.current.length === 0) {
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
      return;
    }
    
    setIsSpeaking(true);
    const nextText = speechQueueRef.current.shift();
    
    const utterance = new SpeechSynthesisUtterance(nextText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Try to find a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Samantha'))
    ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.onend = () => {
      processNextInQueue();
    };
    
    utterance.onerror = (event) => {
      console.error('[Browser Speech] Error:', event.error);
      processNextInQueue();
    };
    
    currentUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };
  
  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      stopBrowserSpeech();
    };
  }, []);

  // Reload personas when selected user changes
  useEffect(() => {
    if (selectedUser?.id) {
      reloadPersonas();
    }
  }, [selectedUser?.id, reloadPersonas]);

  // Load AI focus sessions on mount
  useEffect(() => {
    if (selectedUser?.id) {
      aiFocusAPI.getSessions(selectedUser.id).then(result => {
        if (result.success && result.sessions) {
          const sessions = result.sessions.filter(s => s.mode === 'question' || s.mode === 'task');
          setAiFocusSessions(sessions);
          const titles = {};
          sessions.forEach(s => {
            if (s.title) titles[s.session_id] = s.title;
          });
          setAiFocusSessionTitles(titles);
        }
      }).catch(err => {
        console.error('[AI FOCUS] Error loading sessions:', err);
      });
    }
    
    // Entering focus mode - pause music and other audio
    window.dispatchEvent(new CustomEvent('enterFocusMode'));
    
    // Stop all other audio elements on the page
    const allAudioElements = document.querySelectorAll('audio');
    allAudioElements.forEach((audio) => {
      try {
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
        }
      } catch (e) {
        console.warn('Error stopping audio:', e);
      }
    });
    
    return () => {
      // Exiting focus mode - resume music if it was playing
      window.dispatchEvent(new CustomEvent('exitFocusMode'));
      
      // Clean up audio
      if (audioObj) {
        try {
          audioObj.pause();
          audioObj.currentTime = 0;
        } catch (e) {
          console.warn('Error stopping audioObj:', e);
        }
      }
      if (fillerAudioObj) {
        try {
          fillerAudioObj.pause();
          fillerAudioObj.currentTime = 0;
        } catch (e) {
          console.warn('Error stopping fillerAudioObj:', e);
        }
      }
    };
  }, [selectedUser?.id]);

  useEffect(() => {
    // Clean up audio on unmount or audio change
    return () => {
      if (audioObj) {
        audioObj.pause();
      }
    };
  }, [audioObj]);

  // Play filler audio for immediate feedback
  const playFillerAudio = async () => {
    try {
      console.log('[FILLER] Requesting filler audio...');
      const fillerResp = await aiAPI.getFillerAudio();
      
      // Handle 204 No Content response (no filler audio available)
      if (fillerResp?.status === 204) {
        console.log('[FILLER] No filler audio available for this persona');
        return;
      }
      
      const blob = fillerResp?.data;

      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        const filler = new Audio(url);
        setFillerAudioObj(filler);

        filler.onended = () => {
          console.log('[FILLER] Filler audio ended');
          setFillerAudioObj(null);
        };

        await filler.play();
        console.log('[FILLER] Playing filler audio');
      }
    } catch (err) {
      // Only log if it's not a 404/204 (no content available)
      const status = err?.response?.status;
      if (status === 404 || status === 204) {
        // Silently handle - no filler audio available is not an error
        console.log('[FILLER] No filler audio available for this persona');
      } else {
        console.error('[FILLER] Failed to play filler audio:', err);
      }
    }
  };

  // Stop filler audio when real audio is ready
  const stopFillerAudio = () => {
    if (fillerAudioObj) {
      console.log('[FILLER] Stopping filler audio');
      fillerAudioObj.pause();
      fillerAudioObj.currentTime = 0;
      setFillerAudioObj(null);
    }
  };

  const beginListening = () => {
    // Only start if not already capturing/playing
    if (!['listening', 'processing', 'playing'].includes(micStatus)) {
      setMicStatus('listening');
      setMicRestartKey((k) => k + 1);
    }
  };

  // Manage microphone capture in AI focus mode
  useEffect(() => {
    let cancelled = false;
    let mediaRecorder;
    let analyser;
    let audioContext;
    let silenceStart = 0;
    let silenceTimer;
    let chunks = [];

    const stopRecording = async () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    };

    const startMic = async () => {
      setMicError('');
      setTranscript('');
      setAiResponseText('Listening...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setMicStream(stream);

        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        mediaRecorder = new MediaRecorder(stream);
        chunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
          if (chunks.length === 0) return;
          
          // Play filler audio immediately while transcription happens
          playFillerAudio();
          
          const blob = new Blob(chunks, { type: 'audio/webm' });
          await sendForTranscription(blob);
        };
        mediaRecorder.start();

        const detectSilence = () => {
          const buffer = new Uint8Array(analyser.fftSize);
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buffer.length);
          // Increase threshold slightly to ignore more background noise
          const threshold = 0.04; // silence threshold
          const now = performance.now();

          if (rms < threshold) {
            if (silenceStart === 0) silenceStart = now;
            if (now - silenceStart > 1200) { // Reduced from 2000ms for faster response
              stopRecording();
              return;
            }
          } else {
            silenceStart = 0;
          }
          silenceTimer = requestAnimationFrame(detectSilence);
        };
        silenceTimer = requestAnimationFrame(detectSilence);
      } catch (err) {
        setMicStatus('error');
        setMicError(err?.message || 'Microphone access denied');
      }
    };

    const sendForTranscription = async (blob) => {
      setMicStatus('thinking');
      try {
        const fd = new FormData();
        fd.append('file', blob, 'audio.webm');
        const resp = await fetch('/api/transcribe', {
          method: 'POST',
          body: fd,
        });
        const data = await resp.json();
        console.log('Transcribe response', data);
        if (data.router_model || data.router_prompt || data.router_input) {
          console.log('Router meta', {
            model: data.router_model,
            prompt: data.router_prompt,
            input: data.router_input,
            output_raw: data.router_answer,
            output_parsed: data.router_parsed,
            error: data.router_error,
          });
        }
        if (data.success) {
          const transcript = data.transcript || '';
          console.log('Transcript:', transcript);
          
          // Handle based on AI focus mode
          if (aiFocusMode === 'question') {
            // Direct AI question mode - stream text AND generate audio in parallel
            try {
              console.log('[QUESTION MODE] Starting parallel streaming pipeline...');
              const startTime = Date.now();
              
              let responseText = '';
              let firstTextChunk = null;
              let firstAudioChunk = null;
              
              // Parallel TTS generation state
              let accumulatedTextForSentences = '';
              let audioStreamStarted = false;
              let mediaSource = null;
              let sourceBuffer = null;
              let audioQueue = [];
              let isAppending = false;
              let audioStarted = false;
              let audioElement = null;
              let totalAudioBytes = 0;
              const sentenceMinLength = 20; // Min chars before considering a sentence (reduced from 30 for faster response)
              
              // Sentence processing queue to prevent overlapping audio
              const sentenceQueue = [];
              let isProcessingSentence = false;
              
              // Stop any existing audio before starting a new response
              if (audioObj) {
                try {
                  audioObj.pause();
                  audioObj.currentTime = 0;
                } catch (e) {
                  console.warn('[AI FOCUS] Error stopping previous audio:', e);
                }
              }
              stopFillerAudio();
              stopBrowserSpeech(); // Stop any browser speech synthesis

              // Step 1: Stream text from AI and display it
              console.log('[STREAM] Streaming text response with parallel TTS...');
              
              // Add question to conversation
              const currentQuestion = transcript;
              // Capture the persona at the time the question is asked (before it might change)
              const personaAtQuestionTime = currentPersona;
              
              // CRITICAL: Ensure we have a session ID - create one if we don't have one
              // Once a session ID is established for a chat, it NEVER changes, regardless of persona switches
              let sessionIdToUse = currentAiFocusSessionId;
              if (!sessionIdToUse) {
                // No session ID yet - create a new one and set it immediately
                sessionIdToUse = `ai-focus-${aiFocusMode}-${Date.now()}`;
                console.log('[AI FOCUS] No session ID, creating new one:', sessionIdToUse);
                setCurrentAiFocusSessionId(sessionIdToUse);
                
                // Create temp title
                const tempTitle = currentQuestion.length > 30 
                  ? `${currentQuestion.substring(0, 30)}...`
                  : currentQuestion;
                setAiFocusTitle(tempTitle);
                
                // Create session in database immediately
                aiFocusAPI.createSession(sessionIdToUse, selectedUser?.id).then(sessionResult => {
                  if (sessionResult.success) {
                    if (sessionResult.title) {
                      setAiFocusTitle(sessionResult.title);
                      setAiFocusSessionTitles(prev => ({
                        ...prev,
                        [sessionIdToUse]: sessionResult.title
                      }));
                    }
                    
                    // Add to sessions list
                    setAiFocusSessions(prev => {
                      const exists = prev.some(s => s.session_id === sessionIdToUse);
                      if (!exists) {
                        return [{
                          session_id: sessionIdToUse,
                          title: sessionResult.title || tempTitle,
                          mode: aiFocusMode,
                          pinned: false
                        }, ...prev].slice(0, 20);
                      }
                      return prev;
                    });
                  }
                }).catch(err => {
                  console.error('[AI FOCUS] Error creating session:', err);
                });
              }
              
              // CRITICAL: sessionIdToUse is now guaranteed to be set and will NEVER change for this chat
              // Persona switches will NOT affect this session ID
              console.log('[AI FOCUS] Question asked with session ID:', sessionIdToUse, 'Persona:', personaAtQuestionTime);
              
              let savedMessageId = null; // Store message ID for audio file update
              
              setAiFocusConversations(prev => [...prev, { question: currentQuestion, answer: '', isStreaming: true, messageId: null, persona: personaAtQuestionTime }]);
              setMicStatus('thinking');
              
              // Function to generate audio for a sentence (called sequentially)
              const generateAudioForSentence = async (sentence) => {
                try {
                  console.log(`[PARALLEL TTS] Generating audio for sentence: "${sentence.substring(0, 50)}..."`);
                  const response = await fetch('/api/ai/text-to-audio-stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: sentence })
                  });
                  
                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                  }
                  
                  const reader = response.body.getReader();
                  
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                      console.log(`[PARALLEL TTS] Finished sentence audio generation`);
                      break;
                    }
                    
                    if (firstAudioChunk === null) {
                      firstAudioChunk = Date.now() - startTime;
                      console.log(`[PARALLEL TTS] First audio chunk in ${firstAudioChunk}ms`);
                      stopFillerAudio();
                    }
                    
                    totalAudioBytes += value.length;
                    
                    // Add audio chunk to queue for sequential playback
                    if (isAppending || audioQueue.length > 0) {
                      audioQueue.push(value);
                    } else if (sourceBuffer && !sourceBuffer.updating) {
                      isAppending = true;
                      sourceBuffer.appendBuffer(value);
                    } else {
                      audioQueue.push(value);
                    }
                    
                    // Start playback once we have enough data
                    if (!audioStarted && totalAudioBytes > 4096 && audioElement) {
                      audioStarted = true;
                      try {
                        await audioElement.play();
                        console.log(`[PARALLEL TTS] Audio playback started in ${Date.now() - startTime}ms`);
                        setMicStatus('thinking');
                      } catch (playErr) {
                        console.error('[PARALLEL TTS] Audio play failed:', playErr);
                      }
                    }
                  }
                } catch (err) {
                  console.error('[PARALLEL TTS] Error generating audio for sentence:', err);
                }
              };
              
              // Process sentences from queue sequentially
              const processSentenceQueue = async () => {
                if (isProcessingSentence || sentenceQueue.length === 0) {
                  return;
                }
                
                isProcessingSentence = true;
                
                while (sentenceQueue.length > 0) {
                  const sentence = sentenceQueue.shift();
                  console.log(`[PARALLEL TTS] Processing queued sentence (${sentenceQueue.length} remaining)`);
                  await generateAudioForSentence(sentence);
                }
                
                isProcessingSentence = false;
                console.log(`[PARALLEL TTS] Sentence queue empty`);
              };
              
              // Initialize audio stream on first sentence
              const initializeAudioStream = () => {
                return new Promise((resolve) => {
                  if (audioStreamStarted) {
                    resolve();
                    return;
                  }
                  audioStreamStarted = true;
                  
                  console.log('[PARALLEL TTS] Initializing audio stream');
                  mediaSource = new MediaSource();
                  audioElement = new Audio();
                  audioElement.src = URL.createObjectURL(mediaSource);
                  setAudioObj(audioElement);
                  
                  mediaSource.addEventListener('sourceopen', () => {
                    console.log('[PARALLEL TTS] MediaSource opened and ready');
                    sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
                    
                    sourceBuffer.addEventListener('updateend', () => {
                      isAppending = false;
                      // Process next chunk in queue
                      if (audioQueue.length > 0 && !isAppending) {
                        isAppending = true;
                        const nextChunk = audioQueue.shift();
                        sourceBuffer.appendBuffer(nextChunk);
                      }
                    });
                    
                    resolve(); // MediaSource is now ready
                  });
                  
                  audioElement.onended = () => {
                    console.log('[PARALLEL TTS] Audio ended');
                    setMicStatus('idle');
                    setAiResponseText('');
                    URL.revokeObjectURL(audioElement.src);
                  };
                  
                  audioElement.onplay = () => {
                    setMicStatus('thinking');
                  };
                  
                  audioElement.onerror = (err) => {
                    console.error('[PARALLEL TTS] Audio error:', err, audioElement.error);
                    setMicStatus('idle');
                    setAiResponseText('');
                  };
                });
              };
              
              // Pass session_id and persona to include conversation context
              // Use the established session ID - it will never change for this chat
              await aiAPI.askQuestionStream({ 
                question: transcript, 
                user_id: selectedUser?.id,
                session_id: sessionIdToUse, // Use the established session ID
                persona: personaAtQuestionTime // Pass the persona that was active when question was asked
              }, (data) => {
                if (data.chunk) {
                  if (firstTextChunk === null) {
                    firstTextChunk = Date.now() - startTime;
                    console.log(`[STREAM] First text chunk in ${firstTextChunk}ms`);
                  }
                  responseText += data.chunk;
                  accumulatedTextForSentences += data.chunk;
                  setAiResponseText(responseText);
                  
                  // Check for complete sentences and generate audio immediately
                  // Look for sentence endings: . ! ? followed by space or end of text
                  const sentenceMatch = accumulatedTextForSentences.match(/^(.*?[.!?])(\s+|$)/);
                  if (sentenceMatch && sentenceMatch[1].length >= sentenceMinLength) {
                    const completeSentence = sentenceMatch[1].trim();
                    accumulatedTextForSentences = accumulatedTextForSentences.slice(sentenceMatch[0].length);
                    
                    console.log(`[PARALLEL TTS] Detected complete sentence (${completeSentence.length} chars): "${completeSentence.substring(0, 50)}..."`);
                    
                    // Use browser speech synthesis if enabled
                    if (useBrowserSpeech) {
                      console.log('[Browser Speech] Speaking sentence...');
                      stopFillerAudio(); // Stop filler audio when speech starts
                      speakText(completeSentence);
                    } else {
                      // Add sentence to server TTS queue
                      sentenceQueue.push(completeSentence);
                      console.log(`[PARALLEL TTS] Added to queue (queue size: ${sentenceQueue.length})`);
                      
                      // Initialize audio stream on first sentence and wait for it to be ready
                      if (!audioStreamStarted) {
                        initializeAudioStream().then(() => {
                          console.log('[PARALLEL TTS] Audio stream ready, starting sequential processing');
                          // Start processing sentence queue
                          processSentenceQueue();
                        });
                      } else {
                        // Audio stream already initialized, process queue
                        processSentenceQueue();
                      }
                    }
                  }
                  
                  // Update the last conversation entry with streaming answer
                  setAiFocusConversations(prev => {
                    const updated = [...prev];
                    if (updated.length > 0) {
                      updated[updated.length - 1] = { ...updated[updated.length - 1], answer: responseText, isStreaming: true };
                    }
                    return updated;
                  });
                } else if (data.done) {
                  const textTime = Date.now() - startTime;
                  console.log(`[STREAM] Text complete in ${textTime}ms, length: ${responseText.length}`);
                  responseText = data.full_text || responseText;
                  setAiResponseText(responseText);
                  
                  // Generate audio for any remaining text that hasn't been processed
                  if (accumulatedTextForSentences.trim().length > 0) {
                    console.log(`[PARALLEL TTS] Adding final fragment to queue: "${accumulatedTextForSentences.trim().substring(0, 50)}..."`);
                    
                    // Use browser speech synthesis if enabled
                    if (useBrowserSpeech) {
                      console.log('[Browser Speech] Speaking final fragment...');
                      speakText(accumulatedTextForSentences.trim());
                    } else {
                      sentenceQueue.push(accumulatedTextForSentences.trim());
                      
                      if (!audioStreamStarted) {
                        initializeAudioStream().then(() => {
                          processSentenceQueue().then(() => {
                            console.log('[PARALLEL TTS] All audio generation complete');
                            // Close the media source after all audio is generated
                            setTimeout(() => {
                              if (mediaSource && mediaSource.readyState === 'open') {
                                if (audioQueue.length === 0 && !isAppending) {
                                  mediaSource.endOfStream();
                                }
                              }
                            }, 1000);
                          });
                        });
                      } else {
                        processSentenceQueue().then(() => {
                          console.log('[PARALLEL TTS] All audio generation complete');
                          // Close the media source after all audio is generated
                          setTimeout(() => {
                            if (mediaSource && mediaSource.readyState === 'open') {
                              if (audioQueue.length === 0 && !isAppending) {
                                mediaSource.endOfStream();
                              }
                            }
                          }, 1000);
                        });
                      }
                    }
                  } else if (audioStreamStarted && !useBrowserSpeech) {
                    // If we've already started audio and there's no remaining text, wait for queue to finish then close
                    console.log('[PARALLEL TTS] No remaining text, waiting for queue to finish');
                    // Wait for current processing to complete
                    const waitForQueueComplete = setInterval(() => {
                      if (!isProcessingSentence && sentenceQueue.length === 0) {
                        clearInterval(waitForQueueComplete);
                        console.log('[PARALLEL TTS] Queue complete, finalizing audio stream');
                        setTimeout(() => {
                          if (mediaSource && mediaSource.readyState === 'open') {
                            if (audioQueue.length === 0 && !isAppending) {
                              mediaSource.endOfStream();
                            }
                          }
                        }, 1000);
                      }
                    }, 100);
                  }
                  
                  // Update the last conversation entry with final answer and persona
                  setAiFocusConversations(prev => {
                    const updated = [...prev];
                    if (updated.length > 0) {
                      updated[updated.length - 1] = { 
                        ...updated[updated.length - 1], 
                        answer: responseText, 
                        isStreaming: false,
                        persona: personaAtQuestionTime // Store the persona that answered
                      };
                    }
                    return updated;
                  });
                  
                  // Save message to database (without audio file path yet)
                  // Use the persona that was active when the question was asked
                  // Use the established session ID - it never changes for this chat
                  aiFocusAPI.saveMessage(
                    currentQuestion,
                    responseText,
                    aiFocusMode,
                    personaAtQuestionTime, // Use the persona captured at question time
                    selectedUser?.id,
                    null, // Audio file path will be added after audio is saved
                    sessionIdToUse // Use the established session ID - it never changes
                  ).then(result => {
                    if (result.success) {
                      // CRITICAL: The session_id should match what we sent
                      // If it doesn't, log a warning but use what we sent (sessionIdToUse)
                      const returnedSessionId = result.session_id;
                      console.log('[AI FOCUS] Message saved:', {
                        returned_session_id: returnedSessionId,
                        sent_session_id: sessionIdToUse,
                        message_id: result.message_id
                      });
                      
                      // Ensure the session ID state matches what we're using
                      // This should already be set, but double-check
                      if (currentAiFocusSessionId !== sessionIdToUse) {
                        console.log('[AI FOCUS] Session ID mismatch, updating state:', {
                          current: currentAiFocusSessionId,
                          should_be: sessionIdToUse
                        });
                        setCurrentAiFocusSessionId(sessionIdToUse);
                      }
                      
                      savedMessageId = result.message_id; // Store for audio file update
                      // Update the last conversation entry with message ID, persona, and audio file (if available)
                      setAiFocusConversations(prev => {
                        const updated = [...prev];
                        if (updated.length > 0) {
                          updated[updated.length - 1] = { 
                            ...updated[updated.length - 1], 
                            messageId: result.message_id,
                            persona: personaAtQuestionTime, // Store the persona that answered
                            audioFile: null // Will be updated when audio is saved
                          };
                        }
                        return updated;
                      });
                      
                      // Session should already be created if it was new
                      // Just ensure the title is set if we don't have one
                      if (!aiFocusTitle && currentQuestion) {
                        const tempTitle = currentQuestion.length > 30 
                          ? `${currentQuestion.substring(0, 30)}...`
                          : currentQuestion;
                        setAiFocusTitle(tempTitle);
                      }
                    }
                  }).catch(err => {
                    console.error('[AI FOCUS] Error saving message:', err);
                  });
                }
              });
              
              // Step 2: Save audio file for playback later (do not auto-play again)
              if (responseText) {
                console.log('[STREAM] Saving audio file from completed text...');
                const audioStartTime = Date.now();
                
                // Save audio file asynchronously (no artificial delay)
                // Use promise-based approach instead of setTimeout for better reliability
                (async () => {
                  try {
                    // Wait briefly for savedMessageId to be set (should happen quickly)
                    let attempts = 0;
                    const maxAttempts = 5;
                    let messageIdToUse = savedMessageId;
                    
                    while (!messageIdToUse && attempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 200));
                      messageIdToUse = savedMessageId;
                      attempts++;
                    }
                    
                    if (!messageIdToUse) {
                      // Final fallback: try to get from state
                      const currentConvs = aiFocusConversations;
                      if (currentConvs.length > 0) {
                        messageIdToUse = currentConvs[currentConvs.length - 1]?.messageId;
                      }
                    }
                    
                    if (messageIdToUse) {
                      // Save audio file and update message metadata
                      const audioResult = await aiFocusAPI.saveAudio(responseText, messageIdToUse);
                      if (audioResult.success && audioResult.audio_file_path) {
                        console.log('[AI FOCUS] Audio file saved:', audioResult.audio_file_path);
                        // Update conversation with audio file path
                        setAiFocusConversations(prev => {
                          const updated = [...prev];
                          if (updated.length > 0) {
                            updated[updated.length - 1] = { 
                              ...updated[updated.length - 1], 
                              audioFile: audioResult.audio_file_path
                            };
                          }
                          return updated;
                        });
                      }
                    } else {
                      console.warn('[AI FOCUS] No message ID available after retries');
                    }
                  } catch (audioSaveErr) {
                    console.error('[AI FOCUS] Error saving audio file:', audioSaveErr);
                  }
                })()
                
              } else {
                console.log('[STREAM] No text to generate audio from');
                setMicStatus('idle');
              }
            } catch (err) {
              console.error('[STREAM] Streaming failed:', err);
              stopFillerAudio();
              setMicStatus('idle');
              setAiResponseText('');
            }
          } else {
            // Task mode - use router (to be implemented)
            console.log('[TASK MODE] Using router...');
            stopFillerAudio(); // Stop filler for task mode
            const routedParsed = data.router_parsed;
            const routedRaw = data.router_answer;
            const routedError = data.router_error;
            const fallback = transcript;
            const routerDisplay =
              (routedParsed && (routedParsed.value || routedParsed.type || JSON.stringify(routedParsed))) ||
              (routedRaw && routedRaw.trim()) ||
              (routedError && `Router error: ${routedError}`) ||
              '(no router output)';
            console.log('Router display:', routerDisplay);
            
            // For now, just show a message that task mode isn't implemented yet
            setAiResponseText('Task mode is not yet implemented. Please use Question mode.');
            setMicStatus('idle');
          }

          // Keep transcript/router info only in console (no UI)
          setTranscript('');
          setRouterText('');
        } else {
          // Stay in listening mode on no transcript/error
          console.warn('Transcription failed or empty; continuing to listen', data.error);
          setMicStatus('listening');
          setMicError(data.error || 'Transcription failed');
          setMicRestartKey((k) => k + 1);
        }
      } catch (err) {
        console.error('Transcription failed', err);
        setMicStatus('idle');
        setMicError(err?.message || 'Transcription failed');
      }
    };
    if (micStatus === 'listening') {
      startMic();
    } else {
      // stop mic
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
        setMicStream(null);
      }
      setMicStatus('idle');
      setMicError('');
      setTranscript('');
      setRouterText('');
      if (silenceTimer) cancelAnimationFrame(silenceTimer);
      if (audioContext) audioContext.close().catch(() => {});
    }

    return () => {
      cancelled = true;
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
      }
      if (silenceTimer) cancelAnimationFrame(silenceTimer);
      if (audioContext) audioContext.close().catch(() => {});
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    };
    // Depend on micRestartKey to allow restarting listening after retries
  }, [micRestartKey, micStatus, aiFocusMode, currentPersona, selectedUser?.id, currentAiFocusSessionId, aiFocusTitle, aiFocusConversations]);

  // Auto-scroll conversations to bottom when new messages are added
  const conversationsRef = useRef(null);
  useEffect(() => {
    if (conversationsRef.current) {
      conversationsRef.current.scrollTop = conversationsRef.current.scrollHeight;
    }
  }, [aiFocusConversations]);

  // Close menu when clicking outside
  useEffect(() => {
    if (openAiFocusMenuId) {
      const handleClickOutside = (e) => {
        if (!e.target.closest('.ai-focus-session-menu') && !e.target.closest('.ai-focus-session-menu-btn')) {
          setOpenAiFocusMenuId(null);
        }
      };
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openAiFocusMenuId]);

  // Close persona selector when clicking outside
  useEffect(() => {
    if (showPersonaSelector) {
      const handleClickOutside = (e) => {
        if (!e.target.closest('.ai-focus-persona-selector-popup') && !e.target.closest('.ai-focus-persona-selector-icon')) {
          setShowPersonaSelector(false);
        }
      };
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showPersonaSelector]);

  return (
    <div className="ai-focus-page">
      {/* Left Sidebar */}
      <div className="ai-focus-sidebar">
        <div className="ai-focus-sidebar-content">
          {/* Top bar with New Chat, Mode Indicator, and Persona Selector */}
          <div className="ai-focus-top-bar">
            {/* New Chat icon button */}
            <button
              className="ai-focus-new-chat-icon"
              onClick={async () => {
                if (micStatus !== 'idle') return;
                
                // Generate a new session ID based on timestamp and mode
                const newSessionId = `ai-focus-${aiFocusMode}-${Date.now()}`;
                console.log('[AI FOCUS] Creating new session:', newSessionId);
                
                // Create temp title
                const tempTitle = new Date().toLocaleString();
                
                // Add the new session to the list immediately
                setAiFocusSessions(prev => {
                  const updated = [{
                    session_id: newSessionId,
                    title: tempTitle,
                    mode: aiFocusMode,
                    pinned: false
                  }, ...prev.filter(s => s.session_id !== newSessionId)];
                  return updated.slice(0, 20);
                });
                
                // Set the temp title immediately
                setAiFocusSessionTitles(prev => ({
                  ...prev,
                  [newSessionId]: tempTitle
                }));
                
                // Set the new session ID
                setCurrentAiFocusSessionId(newSessionId);
                setAiFocusTitle(tempTitle);
                setAiFocusConversations([]);
                
                // Create session in database
                aiFocusAPI.createSession(newSessionId, selectedUser?.id).then(result => {
                  if (result.success && result.title) {
                    setAiFocusSessionTitles(prev => ({
                      ...prev,
                      [newSessionId]: result.title
                    }));
                    setAiFocusTitle(result.title);
                    // Update session in list
                    setAiFocusSessions(prev => prev.map(s => 
                      s.session_id === newSessionId 
                        ? { ...s, title: result.title }
                        : s
                    ));
                  }
                }).catch(err => {
                  console.error('[AI FOCUS] Error creating session:', err);
                });
              }}
              disabled={micStatus !== 'idle'}
              title="New Chat"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            
            {/* Mode indicator - in the middle */}
            <div className="ai-focus-mode-indicator">
              {aiFocusMode === 'question' ? 'Ask' : 'Command'}
            </div>
            
            {/* Browser Speech toggle */}
            <button
              className={`ai-focus-speech-toggle ${useBrowserSpeech ? 'active' : ''}`}
              onClick={() => {
                if (useBrowserSpeech) {
                  stopBrowserSpeech();
                }
                setUseBrowserSpeech(!useBrowserSpeech);
              }}
              title={useBrowserSpeech ? 'Browser speech ON - Click to disable' : 'Browser speech OFF - Click to enable'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                {useBrowserSpeech ? (
                  <>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                  </>
                ) : (
                  <line x1="23" y1="9" x2="17" y2="15"/>
                )}
              </svg>
            </button>
            
            {/* Persona selector icon button */}
            <button
              className="ai-focus-persona-selector-icon"
              onClick={() => setShowPersonaSelector(!showPersonaSelector)}
              title="Change Persona"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </button>
          </div>
          
          {/* Avatar container - centered */}
          <div className="ai-focus-avatar-container">
            {/* Avatar near top with room for animation */}
            <div className="ai-focus-sidebar-avatar">
              <div className="ai-focus-avatar-row">
                <div
                  className={`ai-focus-mic ${
                    ['listening', 'thinking'].includes(micStatus) ? 'active' : 'off'
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={beginListening}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && beginListening()}
                  title="Start microphone"
                >
                  <AIFocusMic 
                    personas={personas}
                    currentPersona={currentPersona}
                    currentTitle={currentTitle}
                    micStatus={micStatus}
                    showPixelAvatar={showPixelAvatar}
                  />
                </div>
                <button
                  className="ai-focus-avatar-toggle"
                  onClick={() => setShowPixelAvatar(prev => !prev)}
                  title={showPixelAvatar ? 'Show image' : 'Show pixel canvas'}
                  aria-label={showPixelAvatar ? 'Show image' : 'Show pixel canvas'}
                  type="button"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="3" width="6" height="6"/>
                    <rect x="10.5" y="3" width="4.5" height="4.5"/>
                    <rect x="16.5" y="3" width="4.5" height="4.5"/>
                    <rect x="3" y="10.5" width="4.5" height="4.5"/>
                    <rect x="9" y="9" width="6" height="6"/>
                    <rect x="16.5" y="10.5" width="4.5" height="4.5"/>
                    <rect x="3" y="16.5" width="4.5" height="4.5"/>
                    <rect x="10.5" y="16.5" width="4.5" height="4.5"/>
                    <rect x="16.5" y="16.5" width="4.5" height="4.5"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          {/* Persona selector popup */}
          {showPersonaSelector && (
            <div className="ai-focus-persona-selector-popup">
              <div className="ai-focus-persona-selector-header">
                <h3>Select Persona</h3>
                <button 
                  className="ai-focus-persona-selector-close"
                  onClick={() => setShowPersonaSelector(false)}
                >
                  ✕
                </button>
              </div>
              <div className="ai-focus-persona-selector-list">
                {personas && personas.length > 0 ? (
                  personas.map((persona) => (
                    <button
                      key={persona.name}
                      className={`ai-focus-persona-selector-item ${currentPersona === persona.name ? 'active' : ''}`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          // Only change persona if not already selected and mic is idle
                          if (currentPersona !== persona.name && micStatus === 'idle') {
                            // CRITICAL: Persona switch should NEVER affect the session ID or chat state
                            // The session ID is fixed when the chat starts and never changes
                            // Persona only affects future answers, not the chat structure
                            
                            console.log('[AI FOCUS] Switching persona from', currentPersona, 'to', persona.name);
                            console.log('[AI FOCUS] Current session ID (will NOT change):', currentAiFocusSessionId);
                            console.log('[AI FOCUS] Current conversations count:', aiFocusConversations.length);
                            
                            // Simply change the persona - do NOT touch session ID or conversations
                            // Pass the selected user ID to ensure persona is set for the correct user
                            await selectPersona(persona.name, selectedUser?.id);
                            
                            setShowPersonaSelector(false);
                            
                            // Log for debugging
                            console.log('[AI FOCUS] Persona switched. Session ID remains:', currentAiFocusSessionId);
                            console.log('[AI FOCUS] Conversations remain:', aiFocusConversations.length, 'items');
                            // Persona change only affects future answers - session and chat structure unchanged
                          } else if (currentPersona === persona.name) {
                            // Already selected, just close the popup
                            setShowPersonaSelector(false);
                          }
                        } catch (error) {
                          console.error('[AI FOCUS] Error selecting persona:', error);
                          // On error, try to preserve session state
                          if (currentAiFocusSessionId) {
                            console.log('[AI FOCUS] Error occurred, but preserving session ID:', currentAiFocusSessionId);
                          }
                        }
                      }}
                    >
                      {persona.name}
                    </button>
                  ))
                ) : (
                  <div className="ai-focus-persona-selector-empty">No personas available</div>
                )}
              </div>
            </div>
          )}
          
          {/* Name under avatar */}
          <div className="ai-focus-persona-name">
            {currentTitle || 'AI Assistant'}
          </div>
          
          {/* Status under name (only listening or thinking) */}
          <div className="ai-focus-status">
            {micStatus === 'listening' && 'Listening'}
            {micStatus === 'thinking' && 'Thinking'}
            {micStatus === 'idle' && ''}
            {micStatus === 'error' && `Error: ${micError}`}
          </div>
          
          {/* Chat Sessions List */}
          <div className="ai-focus-sessions">
            
            {/* Questions and Tasks tabs - under New Chat button */}
            <div className="ai-focus-tabs">
              <button
                className={`ai-focus-tab ${aiFocusMode === 'question' ? 'active' : ''}`}
                onClick={() => {
                  if (micStatus === 'idle') {
                    // When switching tabs, keep the current session if it matches the new mode
                    // Only clear if switching to a different mode and current session doesn't match
                    const newMode = 'question';
                    if (aiFocusMode !== newMode) {
                      // Switching to question mode
                      // Check if current session matches question mode
                      if (currentAiFocusSessionId && currentAiFocusSessionId.startsWith(`ai-focus-${newMode}-`)) {
                        // Session already exists for this mode, just switch mode and load it
                        setAiFocusMode(newMode);
                        // Load the session's conversations
                        aiFocusAPI.getHistory(currentAiFocusSessionId).then(data => {
                          if (data && data.messages && data.messages.length > 0) {
                            const conversations = [];
                            let currentConv = null;
                            for (const msg of data.messages) {
                              const role = msg.role;
                              const messageText = msg.message || '';
                              if (role === 'user') {
                                if (currentConv) {
                                  conversations.push(currentConv);
                                }
                                currentConv = {
                                  question: messageText,
                                  answer: '',
                                  persona: null,
                                  messageId: msg.id,
                                  audioFile: null
                                };
                              } else if (role === 'assistant' && currentConv) {
                                currentConv.answer = messageText;
                                currentConv.persona = msg.persona || null;
                                if (msg.message_metadata && msg.message_metadata.audio_file) {
                                  currentConv.audioFile = msg.message_metadata.audio_file;
                                }
                              }
                            }
                            if (currentConv) {
                              conversations.push(currentConv);
                            }
                            const reversedConvs = conversations.reverse();
                            setAiFocusConversations(reversedConvs);
                            // Update title if available
                            const session = aiFocusSessions.find(s => s.session_id === currentAiFocusSessionId);
                            if (session) {
                              setAiFocusTitle(aiFocusSessionTitles[currentAiFocusSessionId] || session.title || '');
                            }
                          } else {
                            setAiFocusConversations([]);
                          }
                        }).catch(err => {
                          console.error('[AI FOCUS] Error loading history:', err);
                          setAiFocusConversations([]);
                        });
                      } else {
                        // Different mode or no session - clear for new session
                        setAiFocusMode(newMode);
                        setCurrentAiFocusSessionId(null);
                        setAiFocusConversations([]);
                        setAiFocusTitle('');
                      }
                    }
                  }
                }}
                disabled={micStatus !== 'idle'}
              >
                Questions
              </button>
              <button
                className={`ai-focus-tab ${aiFocusMode === 'task' ? 'active' : ''}`}
                onClick={() => {
                  if (micStatus === 'idle') {
                    // When switching tabs, keep the current session if it matches the new mode
                    // Only clear if switching to a different mode and current session doesn't match
                    const newMode = 'task';
                    if (aiFocusMode !== newMode) {
                      // Switching to task mode
                      // Check if current session matches task mode
                      if (currentAiFocusSessionId && currentAiFocusSessionId.startsWith(`ai-focus-${newMode}-`)) {
                        // Session already exists for this mode, just switch mode and load it
                        setAiFocusMode(newMode);
                        // Load the session's conversations
                        aiFocusAPI.getHistory(currentAiFocusSessionId).then(data => {
                          if (data && data.messages && data.messages.length > 0) {
                            // Backend returns messages in chronological order (oldest first)
                            // Sort by created_at and id to ensure consistent ordering
                            const sortedMessages = [...data.messages].sort((a, b) => {
                              const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                              const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                              if (timeA !== timeB) {
                                return timeA - timeB; // Older first
                              }
                              // If timestamps are equal, sort by ID (user message should come before assistant)
                              return (a.id || 0) - (b.id || 0);
                            });
                            
                            // Process them to pair user questions with assistant answers
                            const conversations = [];
                            let currentConv = null;
                            
                            // Process messages in order (oldest to newest)
                            for (const msg of sortedMessages) {
                              const role = msg.role;
                              const messageText = msg.message || '';
                              
                              if (role === 'user') {
                                // If we have a previous conversation without an answer, save it
                                if (currentConv && !currentConv.answer) {
                                  conversations.push(currentConv);
                                }
                                // Start a new conversation with the user's question
                                currentConv = {
                                  question: messageText,
                                  answer: '',
                                  persona: null,
                                  messageId: msg.id,
                                  audioFile: null
                                };
                              } else if (role === 'assistant') {
                                if (currentConv) {
                                  // Add answer to current conversation
                                  currentConv.answer = messageText;
                                  currentConv.persona = msg.persona || null;
                                  if (msg.message_metadata && msg.message_metadata.audio_file) {
                                    currentConv.audioFile = msg.message_metadata.audio_file;
                                  }
                                } else {
                                  // Orphaned assistant message (shouldn't happen, but handle it)
                                  console.warn('[AI FOCUS] Found orphaned assistant message:', messageText.substring(0, 50));
                                  currentConv = {
                                    question: '', // No question found
                                    answer: messageText,
                                    persona: msg.persona || null,
                                    messageId: msg.id,
                                    audioFile: msg.message_metadata?.audio_file || null
                                  };
                                }
                                // Save the completed conversation
                                conversations.push(currentConv);
                                currentConv = null; // Reset for next pair
                              }
                            }
                            
                            // If there's a conversation without an answer at the end, save it
                            if (currentConv) {
                              conversations.push(currentConv);
                            }
                            
                            // Conversations are now in chronological order (oldest first)
                            // Don't reverse - display them as-is
                            console.log('[AI FOCUS] Loaded conversations:', conversations.length, 'in chronological order');
                            setAiFocusConversations(conversations);
                            // Update title if available
                            const session = aiFocusSessions.find(s => s.session_id === currentAiFocusSessionId);
                            if (session) {
                              setAiFocusTitle(aiFocusSessionTitles[currentAiFocusSessionId] || session.title || '');
                            }
                          } else {
                            setAiFocusConversations([]);
                          }
                        }).catch(err => {
                          console.error('[AI FOCUS] Error loading history:', err);
                          setAiFocusConversations([]);
                        });
                      } else {
                        // Different mode or no session - clear for new session
                        setAiFocusMode(newMode);
                        setCurrentAiFocusSessionId(null);
                        setAiFocusConversations([]);
                        setAiFocusTitle('');
                      }
                    }
                  }
                }}
                disabled={micStatus !== 'idle'}
              >
                Tasks
              </button>
            </div>
            
            {/* Chat list filtered by current mode */}
            <div className="ai-focus-sessions-list">
              {aiFocusSessions
                .filter(s => s.mode === aiFocusMode)
                .slice(0, 10)
                .map(session => {
                  const title = aiFocusSessionTitles[session.session_id] || 
                    (session.session_id.includes('-') 
                      ? new Date(parseInt(session.session_id.split('-').pop())).toLocaleString()
                      : session.session_id);
                  return (
                    <div
                      key={session.session_id}
                      className={`ai-focus-session-item-wrapper ${currentAiFocusSessionId === session.session_id ? 'active' : ''}`}
                    >
                      {editingAiFocusSessionId === session.session_id ? (
                        <div className="ai-focus-session-title-edit" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingAiFocusTitle}
                            onChange={(e) => setEditingAiFocusTitle(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                chatAPI.updateSessionTitle(session.session_id, editingAiFocusTitle).then(result => {
                                  if (result.success) {
                                    setAiFocusSessionTitles(prev => ({
                                      ...prev,
                                      [session.session_id]: result.title || null
                                    }));
                                    setAiFocusTitle(result.title || editingAiFocusTitle);
                                    setEditingAiFocusSessionId(null);
                                    setEditingAiFocusTitle('');
                                  }
                                }).catch(err => {
                                  console.error('Error saving title:', err);
                                });
                              } else if (e.key === 'Escape') {
                                setEditingAiFocusSessionId(null);
                                setEditingAiFocusTitle('');
                              }
                            }}
                            autoFocus
                            className="ai-focus-title-input"
                          />
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              chatAPI.updateSessionTitle(session.session_id, editingAiFocusTitle).then(result => {
                                if (result.success) {
                                  setAiFocusSessionTitles(prev => ({
                                    ...prev,
                                    [session.session_id]: result.title || null
                                  }));
                                  setAiFocusTitle(result.title || editingAiFocusTitle);
                                  setEditingAiFocusSessionId(null);
                                  setEditingAiFocusTitle('');
                                }
                              }).catch(err => {
                                console.error('Error saving title:', err);
                              });
                            }} 
                            className="ai-focus-title-save"
                          >
                            ✓
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAiFocusSessionId(null);
                              setEditingAiFocusTitle('');
                            }} 
                            className="ai-focus-title-cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <div
                            className={`ai-focus-session-item ${currentAiFocusSessionId === session.session_id ? 'active' : ''}`}
                            onClick={() => {
                              if (micStatus === 'idle') {
                                setCurrentAiFocusSessionId(session.session_id);
                                setAiFocusTitle(title);
                                // Clear conversations first to show loading state
                                setAiFocusConversations([]);
                                // Load chat history for this session
                                const selectedSessionId = session.session_id;
                                console.log('[AI FOCUS] Loading history for session:', selectedSessionId);
                                aiFocusAPI.getHistory(selectedSessionId).then(result => {
                                  console.log('[AI FOCUS] Loaded history result:', result);
                                  // The API returns {messages: [...], total: ..., ...} without a success field
                                  const messages = result.messages || result;
                                  if (messages && Array.isArray(messages) && messages.length > 0) {
                                    // Filter messages to only include those for this specific session_id
                                    const filteredMessages = messages.filter(msg => {
                                      const msgSessionId = msg.session_id || msg.sessionId;
                                      const matches = msgSessionId === selectedSessionId;
                                      if (!matches) {
                                        console.warn('[AI FOCUS] Message filtered out - session_id mismatch:', {
                                          messageSessionId: msgSessionId,
                                          selectedSessionId: selectedSessionId,
                                          messageId: msg.id
                                        });
                                      }
                                      return matches;
                                    });
                                    
                                    console.log('[AI FOCUS] Filtered messages:', filteredMessages.length, 'out of', messages.length);
                                    
                                    // Sort messages by created_at and id to ensure consistent ordering
                                    // This handles cases where messages have the same timestamp
                                    const sortedMessages = [...filteredMessages].sort((a, b) => {
                                      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                                      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                                      if (timeA !== timeB) {
                                        return timeA - timeB; // Older first
                                      }
                                      // If timestamps are equal, sort by ID (user message should come before assistant)
                                      return (a.id || a.message_id || 0) - (b.id || b.message_id || 0);
                                    });
                                    
                                    // Process them to pair user questions with assistant answers
                                    const conversations = [];
                                    let currentConv = null;
                                    
                                    // Process messages in order (oldest to newest)
                                    for (const msg of sortedMessages) {
                                      const role = msg.role || '';
                                      const messageText = msg.message || msg.content || '';
                                      
                                      if (role === 'user') {
                                        // If we have a previous conversation without an answer, save it
                                        if (currentConv && !currentConv.answer) {
                                          conversations.push(currentConv);
                                        }
                                        // Start a new conversation with the user's question
                                        currentConv = {
                                          question: messageText,
                                          answer: '',
                                          persona: null,
                                          messageId: msg.id || msg.message_id || null,
                                          audioFile: null
                                        };
                                      } else if (role === 'assistant') {
                                        if (currentConv) {
                                          // Add answer to current conversation
                                          currentConv.answer = messageText;
                                          currentConv.persona = msg.persona || null;
                                          if (msg.message_metadata && msg.message_metadata.audio_file) {
                                            currentConv.audioFile = msg.message_metadata.audio_file;
                                          }
                                          if (msg.id || msg.message_id) {
                                            currentConv.messageId = msg.id || msg.message_id;
                                          }
                                        } else {
                                          // Orphaned assistant message (shouldn't happen, but handle it)
                                          console.warn('[AI FOCUS] Found orphaned assistant message:', messageText.substring(0, 50));
                                          currentConv = {
                                            question: '', // No question found
                                            answer: messageText,
                                            persona: msg.persona || null,
                                            messageId: msg.id || msg.message_id || null,
                                            audioFile: msg.message_metadata?.audio_file || null
                                          };
                                        }
                                        // Save the completed conversation
                                        conversations.push(currentConv);
                                        currentConv = null; // Reset for next pair
                                      }
                                    }
                                    
                                    // If there's a conversation without an answer at the end, save it
                                    if (currentConv) {
                                      conversations.push(currentConv);
                                    }
                                    
                                    // Conversations are now in chronological order (oldest first)
                                    // Don't reverse - display them as-is
                                    console.log('[AI FOCUS] Processed conversations:', conversations.length, 'in chronological order');
                                    setAiFocusConversations(conversations);
                                  } else {
                                    // No messages or empty result
                                    console.log('[AI FOCUS] No messages found for session:', session.session_id);
                                    setAiFocusConversations([]);
                                  }
                                }).catch(err => {
                                  console.error('[AI FOCUS] Error loading history:', err);
                                  setAiFocusConversations([]);
                                });
                              }
                            }}
                            disabled={micStatus !== 'idle'}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                            <span>{title}</span>
                          </div>
                          <button
                            className="ai-focus-session-menu-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openAiFocusMenuId === session.session_id) {
                                setOpenAiFocusMenuId(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setAiFocusMenuPosition({
                                  top: rect.top,
                                  right: window.innerWidth - rect.right
                                });
                                setOpenAiFocusMenuId(session.session_id);
                              }
                            }}
                            title="More options"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="5" r="1"/>
                              <circle cx="12" cy="12" r="1"/>
                              <circle cx="12" cy="19" r="1"/>
                            </svg>
                          </button>
                          {openAiFocusMenuId === session.session_id && (
                            <div 
                              className="ai-focus-session-menu"
                              style={{
                                top: `${aiFocusMenuPosition.top}px`,
                                right: `${aiFocusMenuPosition.right}px`
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button 
                                className="ai-focus-session-menu-item" 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setOpenAiFocusMenuId(null);
                                  setGeneratingAiFocusTitle(session.session_id);
                                  
                                  try {
                                    console.log('[AI FOCUS] Generating title for session:', session.session_id);
                                    const response = await fetch(`/api/chat/sessions/${session.session_id}/generate-title`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' }
                                    });
                                    
                                    if (!response.ok) {
                                      const errorText = await response.text();
                                      console.error('[AI FOCUS] Generate title failed with status:', response.status, errorText);
                                      throw new Error(`HTTP ${response.status}: ${errorText}`);
                                    }
                                    
                                    const result = await response.json();
                                    console.log('[AI FOCUS] Generate title result:', result);
                                    
                                    if (result.success && result.title) {
                                      // Update local state
                                      setAiFocusSessionTitles(prev => ({
                                        ...prev,
                                        [session.session_id]: result.title
                                      }));
                                      
                                      // Update current title if this is the active session
                                      if (currentAiFocusSessionId === session.session_id) {
                                        setAiFocusTitle(result.title);
                                      }
                                      
                                      // Update session in list
                                      setAiFocusSessions(prev => prev.map(s => 
                                        s.session_id === session.session_id 
                                          ? { ...s, title: result.title }
                                          : s
                                      ));
                                      
                                      console.log('[AI FOCUS] Title generated successfully:', result.title);
                                    } else {
                                      console.error('[AI FOCUS] Failed to generate title:', result.error || 'Unknown error');
                                    }
                                  } catch (error) {
                                    console.error('[AI FOCUS] Error generating title:', error);
                                  } finally {
                                    setGeneratingAiFocusTitle(null);
                                  }
                                }} 
                                disabled={generatingAiFocusTitle === session.session_id}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 2v4M12 18v4M4 12H2M6.314 6.314l-2.828-2.828M20.485 20.485l-2.828-2.828M17.686 6.314l2.828-2.828M3.515 20.485l2.828-2.828M22 12h-2M6.314 17.686l-2.828 2.828M20.485 3.515l2.828-2.828"/>
                                  <circle cx="12" cy="12" r="4"/>
                                </svg>
                                {generatingAiFocusTitle === session.session_id ? 'Generating...' : 'Generate'}
                              </button>
                              <button 
                                className="ai-focus-session-menu-item" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenAiFocusMenuId(null);
                                  setEditingAiFocusSessionId(session.session_id);
                                  setEditingAiFocusTitle(title);
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                                Rename
                              </button>
                              <button 
                                className="ai-focus-session-menu-item ai-focus-session-menu-item-danger" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenAiFocusMenuId(null);
                                  if (confirm('Delete this chat?')) {
                                    chatAPI.deleteSession(session.session_id).then(result => {
                                      if (result.success) {
                                        setAiFocusSessions(prev => prev.filter(s => s.session_id !== session.session_id));
                                        setAiFocusSessionTitles(prev => {
                                          const newTitles = { ...prev };
                                          delete newTitles[session.session_id];
                                          return newTitles;
                                        });
                                        if (currentAiFocusSessionId === session.session_id) {
                                          setCurrentAiFocusSessionId(null);
                                          setAiFocusConversations([]);
                                          setAiFocusTitle('');
                                        }
                                      }
                                    }).catch(err => {
                                      console.error('Error deleting session:', err);
                                    });
                                  }
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                                Delete
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
      
      {/* Right Pane - Questions and Answers */}
      <div className="ai-focus-content">
        <div className="ai-focus-conversations" ref={conversationsRef}>
          {aiFocusConversations.length === 0 ? (
            <div className="ai-focus-empty-state">
              <p>Start a conversation by asking a question or giving a task.</p>
            </div>
          ) : (
            aiFocusConversations.map((conv, index) => {
              const userImageUrl = getProfileImageUrl(selectedUser?.profile_picture, selectedUser?.id);
              const personaName = conv.persona || currentPersona || 'AI Assistant';
              
              // Find the persona object to get image_path
              const personaObj = personas.find(p => p.name === personaName);
              const personaImageUrl = personaObj ? getPersonaImageUrl(personaObj.image_path, personaName) : null;
              
              return (
                <div key={index} className="ai-focus-conversation-item">
                  <div className="ai-focus-question">
                    {userImageUrl ? (
                      <img 
                        src={userImageUrl} 
                        alt={selectedUser?.name || 'User'} 
                        className="ai-focus-user-avatar"
                      />
                    ) : (
                      <div className="ai-focus-user-avatar-placeholder">
                        {selectedUser?.name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <div className="ai-focus-question-text">{conv.question}</div>
                  </div>
                  {conv.answer && (
                    <div className={`ai-focus-answer ${conv.isStreaming ? 'streaming' : ''}`}>
                      <div className="ai-focus-persona-avatar-container">
                        {personaImageUrl ? (
                          <img 
                            src={personaImageUrl} 
                            alt={personaName} 
                            className="ai-focus-persona-avatar"
                            onError={(e) => {
                              // Fallback to placeholder if image fails to load
                              const placeholder = e.target.nextElementSibling;
                              if (placeholder) {
                                e.target.style.display = 'none';
                                placeholder.style.display = 'flex';
                              }
                            }}
                          />
                        ) : (
                          <div className="ai-focus-persona-avatar-placeholder">
                            {personaName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {conv.audioFile && (
                          <button
                            className="ai-focus-audio-play-btn"
                            onClick={async () => {
                              try {
                                // Get audio file URL
                                let audioUrl = conv.audioFile;
                                if (audioUrl.startsWith('data/')) {
                                  audioUrl = `/${audioUrl}`;
                                } else if (!audioUrl.startsWith('/')) {
                                  audioUrl = `/data/audio/${audioUrl.split('/').pop()}`;
                                }
                                
                                // Stop any currently playing audio
                                if (playingAudioId !== null) {
                                  const currentAudio = document.getElementById(`ai-focus-audio-${playingAudioId}`);
                                  if (currentAudio) {
                                    currentAudio.pause();
                                    currentAudio.currentTime = 0;
                                  }
                                }
                                
                                // Play the audio
                                const audioId = conv.messageId || index;
                                setPlayingAudioId(audioId);
                                
                                const audio = new Audio(audioUrl);
                                audio.id = `ai-focus-audio-${audioId}`;
                                
                                audio.onended = () => {
                                  setPlayingAudioId(null);
                                };
                                
                                audio.onerror = (e) => {
                                  console.error('[AI FOCUS] Error playing audio:', e);
                                  setPlayingAudioId(null);
                                };
                                
                                await audio.play();
                              } catch (error) {
                                console.error('[AI FOCUS] Error playing audio:', error);
                                setPlayingAudioId(null);
                              }
                            }}
                            title="Play audio"
                          >
                            {playingAudioId === (conv.messageId || index) ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="6" y="4" width="4" height="16"/>
                                <rect x="14" y="4" width="4" height="16"/>
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                      <div className="ai-focus-answer-text">{conv.answer}</div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
