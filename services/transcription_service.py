"""
Transcription service with multiple provider support.

Supports:
- Deepgram (fastest, cloud)
- Faster Whisper (fast, local)
- Vosk (fallback, local)
"""
import logging
import tempfile
import os
import time
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class TranscriptionService:
    """Handle audio transcription with multiple providers."""
    
    def __init__(self):
        self.deepgram_client = None
        self.faster_whisper_model = None
        self.vosk_model = None
    
    async def transcribe(self, audio_bytes: bytes, filename: str = "audio.webm") -> Tuple[Optional[str], str, float]:
        """
        Transcribe audio using the best available provider.
        
        Priority:
        1. Deepgram (if API key available)
        2. Faster Whisper (if model available)
        3. Vosk (fallback)
        
        Returns:
            (transcript_text, provider_name, latency_ms)
        """
        # Try Deepgram first
        try:
            transcript, latency = await self._transcribe_deepgram(audio_bytes)
            if transcript:
                logger.info(f"[TRANSCRIBE] Deepgram success: {latency:.0f}ms")
                return transcript, "deepgram", latency
        except Exception as e:
            logger.debug(f"[TRANSCRIBE] Deepgram unavailable: {e}")
        
        # Try Faster Whisper
        try:
            transcript, latency = await self._transcribe_faster_whisper(audio_bytes, filename)
            if transcript:
                logger.info(f"[TRANSCRIBE] Faster Whisper success: {latency:.0f}ms")
                return transcript, "faster-whisper", latency
        except Exception as e:
            logger.debug(f"[TRANSCRIBE] Faster Whisper unavailable: {e}")
        
        # Fallback to Vosk
        try:
            transcript, latency = await self._transcribe_vosk(audio_bytes, filename)
            if transcript:
                logger.info(f"[TRANSCRIBE] Vosk success: {latency:.0f}ms")
                return transcript, "vosk", latency
        except Exception as e:
            logger.error(f"[TRANSCRIBE] All providers failed: {e}")
        
        return None, "none", 0.0
    
    async def _transcribe_deepgram(self, audio_bytes: bytes) -> Tuple[Optional[str], float]:
        """Transcribe using Deepgram API."""
        start = time.time()
        
        try:
            from deepgram import DeepgramClient, PrerecordedOptions
            from config.api_key_loader import load_api_keys
            
            # Get API key
            api_keys = await load_api_keys()
            deepgram_key = api_keys.get("deepgram", {}).get("api_key")
            
            if not deepgram_key:
                return None, 0.0
            
            # Initialize client if needed
            if not self.deepgram_client:
                self.deepgram_client = DeepgramClient(deepgram_key)
            
            # Prepare audio source
            source = {
                'buffer': audio_bytes,
            }
            
            # Configure options
            options = PrerecordedOptions(
                model="nova-2",  # Latest, fastest model
                smart_format=True,  # Auto punctuation, formatting
                language="en-US",
                punctuate=True,
            )
            
            # Transcribe
            response = self.deepgram_client.listen.prerecorded.v("1").transcribe_file(
                source,
                options
            )
            
            # Extract transcript
            if response and response.results and response.results.channels:
                transcript = response.results.channels[0].alternatives[0].transcript
                elapsed = (time.time() - start) * 1000
                return transcript.strip(), elapsed
            
            return None, 0.0
            
        except ImportError:
            logger.debug("[TRANSCRIBE] Deepgram SDK not installed")
            return None, 0.0
        except Exception as e:
            logger.warning(f"[TRANSCRIBE] Deepgram error: {e}")
            return None, 0.0
    
    async def _transcribe_faster_whisper(self, audio_bytes: bytes, filename: str) -> Tuple[Optional[str], float]:
        """Transcribe using Faster Whisper (local)."""
        start = time.time()
        
        try:
            from faster_whisper import WhisperModel
            
            # Initialize model if needed (lazy load)
            if not self.faster_whisper_model:
                logger.info("[TRANSCRIBE] Loading Faster Whisper model...")
                self.faster_whisper_model = WhisperModel(
                    "base.en",  # Good balance of speed and accuracy
                    device="cpu",
                    compute_type="int8",  # Optimized for CPU
                    num_workers=2
                )
            
            # Save to temp file
            with tempfile.NamedTemporaryFile(suffix=os.path.splitext(filename)[1] or '.webm', delete=False) as f:
                f.write(audio_bytes)
                temp_path = f.name
            
            try:
                # Transcribe
                segments, info = self.faster_whisper_model.transcribe(
                    temp_path,
                    beam_size=5,
                    language="en"
                )
                
                # Combine segments
                transcript = " ".join([segment.text for segment in segments])
                elapsed = (time.time() - start) * 1000
                
                return transcript.strip(), elapsed
                
            finally:
                # Cleanup temp file
                try:
                    os.unlink(temp_path)
                except:
                    pass
                    
        except ImportError:
            logger.debug("[TRANSCRIBE] Faster Whisper not installed")
            return None, 0.0
        except Exception as e:
            logger.warning(f"[TRANSCRIBE] Faster Whisper error: {e}")
            return None, 0.0
    
    async def _transcribe_vosk(self, audio_bytes: bytes, filename: str) -> Tuple[Optional[str], float]:
        """Transcribe using Vosk (local, fallback)."""
        start = time.time()
        
        try:
            from vosk import Model, KaldiRecognizer
            import wave
            import io
            import json
            import subprocess
            import soundfile as sf
            import numpy as np
            
            # Find Vosk model
            model_root = os.path.join(os.path.dirname(__file__), "..", "models", "vosk")
            preferred = os.path.join(model_root, "vosk-model-en-us-0.22")
            selected_model = None
            
            if os.path.isdir(preferred):
                selected_model = preferred
            elif os.path.isdir(model_root):
                entries = [os.path.join(model_root, d) for d in os.listdir(model_root)]
                dirs = [d for d in entries if os.path.isdir(d)]
                if dirs:
                    selected_model = dirs[0]
            
            if not selected_model or not os.path.isdir(selected_model):
                logger.warning(f"[TRANSCRIBE] Vosk model not found at {model_root}")
                return None, 0.0
            
            # Initialize model if needed
            if not self.vosk_model or self.vosk_model != selected_model:
                logger.info(f"[TRANSCRIBE] Loading Vosk model: {selected_model}")
                self.vosk_model = Model(selected_model)
            
            # Convert to 16k mono WAV (inline implementation)
            wav_bytes = None
            
            # Try ffmpeg first
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1] or ".bin") as inp:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as outp:
                    inp.write(audio_bytes)
                    inp.flush()
                    cmd = [
                        "ffmpeg", "-y", "-i", inp.name,
                        "-ar", "16000", "-ac", "1",
                        "-f", "wav", outp.name
                    ]
                    try:
                        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        with open(outp.name, "rb") as f:
                            wav_bytes = f.read()
                    except Exception:
                        pass
                    finally:
                        try:
                            os.unlink(inp.name)
                        except:
                            pass
                        try:
                            os.unlink(outp.name)
                        except:
                            pass
            
            # Fallback: try soundfile
            if not wav_bytes:
                try:
                    audio, sr = sf.read(io.BytesIO(audio_bytes))
                    if audio.ndim > 1:
                        audio = np.mean(audio, axis=1)
                    target_sr = 16000
                    if sr != target_sr:
                        from scipy import signal
                        num_samples = int(len(audio) * target_sr / sr)
                        audio = signal.resample(audio, num_samples)
                    # Write to WAV
                    wav_io = io.BytesIO()
                    sf.write(wav_io, audio, target_sr, format='WAV')
                    wav_bytes = wav_io.getvalue()
                except Exception:
                    return None, 0.0
            
            if not wav_bytes:
                return None, 0.0
            
            # Transcribe
            wf = wave.open(io.BytesIO(wav_bytes), "rb")
            rec = KaldiRecognizer(self.vosk_model, wf.getframerate())
            
            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break
                rec.AcceptWaveform(data)
            
            result = rec.FinalResult()
            transcript = json.loads(result).get("text", "").strip()
            elapsed = (time.time() - start) * 1000
            
            return transcript if transcript else None, elapsed
            
        except ImportError:
            logger.debug("[TRANSCRIBE] Vosk not installed")
            return None, 0.0
        except Exception as e:
            logger.warning(f"[TRANSCRIBE] Vosk error: {e}")
            return None, 0.0


# Global instance
_transcription_service: Optional[TranscriptionService] = None


def get_transcription_service() -> TranscriptionService:
    """Get or create the global transcription service instance."""
    global _transcription_service
    
    if _transcription_service is None:
        _transcription_service = TranscriptionService()
    
    return _transcription_service
