"""
Performance profiling utility for AI Focus Mode.

This module provides utilities to measure and track performance metrics
across the AI Focus Mode pipeline.
"""
import time
import logging
from typing import Dict, Optional
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class PerformanceProfiler:
    """
    Track performance metrics for AI Focus Mode interactions.
    
    Usage:
        profiler = PerformanceProfiler()
        profiler.start()
        
        profiler.mark("transcription_start")
        # ... do transcription ...
        profiler.mark("transcription_complete")
        
        profiler.mark("ai_first_chunk")
        # ... AI generates ...
        profiler.mark("ai_complete")
        
        report = profiler.get_report()
    """
    
    def __init__(self, session_id: Optional[str] = None):
        self.session_id = session_id
        self.start_time = 0.0
        self.events = {}
        self.is_active = False
    
    def start(self):
        """Start the profiler."""
        self.start_time = time.time()
        self.is_active = True
        self.events = {}
        logger.info(f"[PROFILER] Started profiling session: {self.session_id}")
    
    def mark(self, event_name: str):
        """Mark a timing event."""
        if not self.is_active:
            return
        
        elapsed = (time.time() - self.start_time) * 1000  # ms
        self.events[event_name] = elapsed
        logger.info(f"[PROFILER] {event_name}: {elapsed:.2f}ms")
    
    def stop(self):
        """Stop the profiler."""
        self.is_active = False
        total_time = (time.time() - self.start_time) * 1000
        logger.info(f"[PROFILER] Stopped profiling. Total time: {total_time:.2f}ms")
        return total_time
    
    def get_report(self) -> Dict[str, float]:
        """Get performance report with calculated metrics."""
        report = {
            "events": self.events.copy(),
            "calculated": {}
        }
        
        # Calculate durations between events
        if "transcription_start" in self.events and "transcription_complete" in self.events:
            report["calculated"]["transcription_duration"] = (
                self.events["transcription_complete"] - self.events["transcription_start"]
            )
        
        if "ai_first_chunk" in self.events and "ai_complete" in self.events:
            report["calculated"]["ai_generation_duration"] = (
                self.events["ai_complete"] - self.events["ai_first_chunk"]
            )
        
        if "tts_first_request" in self.events and "tts_first_chunk" in self.events:
            report["calculated"]["tts_first_chunk_latency"] = (
                self.events["tts_first_chunk"] - self.events["tts_first_request"]
            )
        
        if "audio_play_start" in self.events:
            report["calculated"]["time_to_first_audio"] = self.events["audio_play_start"]
        
        return report
    
    def print_report(self):
        """Print a formatted performance report."""
        report = self.get_report()
        
        print("\n" + "="*80)
        print(f"PERFORMANCE REPORT - Session: {self.session_id}")
        print("="*80)
        
        print("\n📍 Events Timeline:")
        for event, time_ms in sorted(report["events"].items(), key=lambda x: x[1]):
            print(f"  {event:30} {time_ms:>8.2f}ms")
        
        if report["calculated"]:
            print("\n⏱️  Calculated Durations:")
            for metric, duration in report["calculated"].items():
                print(f"  {metric:30} {duration:>8.2f}ms")
        
        print("\n" + "="*80)
    
    @contextmanager
    def measure(self, event_name: str):
        """Context manager to measure a code block."""
        start = time.time()
        yield
        elapsed = (time.time() - start) * 1000
        self.events[event_name] = elapsed
        logger.info(f"[PROFILER] {event_name}: {elapsed:.2f}ms")


# Global profiler instance for AI Focus Mode
_ai_focus_profiler: Optional[PerformanceProfiler] = None


def get_profiler(session_id: Optional[str] = None) -> PerformanceProfiler:
    """Get or create the global profiler instance."""
    global _ai_focus_profiler
    
    if _ai_focus_profiler is None or session_id != _ai_focus_profiler.session_id:
        _ai_focus_profiler = PerformanceProfiler(session_id)
    
    return _ai_focus_profiler


def clear_profiler():
    """Clear the global profiler instance."""
    global _ai_focus_profiler
    _ai_focus_profiler = None
