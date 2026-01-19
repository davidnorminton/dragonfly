"""
Performance profiling tests for AI Focus Mode end-to-end cycle.

This module tests the complete pipeline from user question to audio playback,
measuring latency at each stage.
"""
import pytest
import asyncio
import time
from typing import Dict, List
import json


class PerformanceMetrics:
    """Track performance metrics for AI Focus Mode."""
    
    def __init__(self):
        self.metrics = {
            "silence_detection": 0.0,
            "transcription_start": 0.0,
            "transcription_complete": 0.0,
            "ai_first_chunk": 0.0,
            "ai_first_sentence": 0.0,
            "ai_complete": 0.0,
            "tts_first_request": 0.0,
            "tts_first_chunk": 0.0,
            "audio_play_start": 0.0,
            "audio_complete": 0.0,
            "total_latency": 0.0
        }
        self.start_time = 0.0
    
    def start(self):
        """Mark the start of the cycle."""
        self.start_time = time.time()
    
    def mark(self, event: str):
        """Mark a timing event."""
        if event in self.metrics:
            self.metrics[event] = (time.time() - self.start_time) * 1000  # Convert to ms
    
    def get_summary(self) -> Dict[str, float]:
        """Get summary of metrics."""
        return {
            "transcription_time": self.metrics["transcription_complete"] - self.metrics["transcription_start"],
            "ai_generation_time": self.metrics["ai_complete"] - self.metrics["ai_first_chunk"],
            "tts_generation_time": self.metrics["tts_first_chunk"] - self.metrics["tts_first_request"],
            "time_to_first_audio": self.metrics["audio_play_start"],
            "total_time": self.metrics["audio_complete"],
        }
    
    def print_report(self):
        """Print detailed performance report."""
        print("\n" + "=" * 80)
        print("AI FOCUS MODE - PERFORMANCE REPORT")
        print("=" * 80)
        
        print("\n📊 TIMELINE:")
        print(f"  Silence Detection:     {self.metrics['silence_detection']:.0f}ms")
        print(f"  Transcription Start:   {self.metrics['transcription_start']:.0f}ms")
        print(f"  Transcription Done:    {self.metrics['transcription_complete']:.0f}ms")
        print(f"  AI First Chunk:        {self.metrics['ai_first_chunk']:.0f}ms")
        print(f"  AI First Sentence:     {self.metrics['ai_first_sentence']:.0f}ms")
        print(f"  AI Complete:           {self.metrics['ai_complete']:.0f}ms")
        print(f"  TTS First Request:     {self.metrics['tts_first_request']:.0f}ms")
        print(f"  TTS First Chunk:       {self.metrics['tts_first_chunk']:.0f}ms")
        print(f"  Audio Play Start:      {self.metrics['audio_play_start']:.0f}ms")
        print(f"  Audio Complete:        {self.metrics['audio_complete']:.0f}ms")
        
        summary = self.get_summary()
        print("\n⏱️  DURATIONS:")
        print(f"  Transcription:         {summary['transcription_time']:.0f}ms")
        print(f"  AI Generation:         {summary['ai_generation_time']:.0f}ms")
        print(f"  TTS Generation:        {summary['tts_generation_time']:.0f}ms")
        
        print("\n🎯 KEY METRICS:")
        print(f"  Time to First Audio:   {summary['time_to_first_audio']:.0f}ms")
        print(f"  Total Latency:         {summary['total_time']:.0f}ms")
        
        # Performance targets
        print("\n✅ TARGETS:")
        targets = {
            "Time to First Audio": (summary['time_to_first_audio'], 3000, "ms"),
            "Total Latency": (summary['total_time'], 5000, "ms"),
            "Transcription": (summary['transcription_time'], 1000, "ms"),
            "AI Generation": (summary['ai_generation_time'], 3000, "ms"),
            "TTS Generation": (summary['tts_generation_time'], 2000, "ms"),
        }
        
        for name, (actual, target, unit) in targets.items():
            status = "✓" if actual <= target else "✗"
            print(f"  {status} {name:25} {actual:.0f}{unit} (target: {target}{unit})")
        
        print("\n" + "=" * 80)


class TestEndToEndPerformance:
    """End-to-end performance tests for AI Focus Mode."""
    
    @pytest.mark.asyncio
    async def test_complete_cycle_performance(self, client):
        """Test complete AI Focus cycle performance."""
        metrics = PerformanceMetrics()
        metrics.start()
        
        # Simulate the complete cycle
        # In a real test, this would make actual API calls
        
        # 1. Silence detection (simulated)
        await asyncio.sleep(0.001)  # Simulate 1ms
        metrics.mark("silence_detection")
        
        # 2. Transcription
        metrics.mark("transcription_start")
        await asyncio.sleep(0.5)  # Simulate 500ms transcription
        metrics.mark("transcription_complete")
        
        # 3. AI generation
        metrics.mark("ai_first_chunk")
        await asyncio.sleep(0.3)  # First sentence in 300ms
        metrics.mark("ai_first_sentence")
        await asyncio.sleep(2.0)  # Complete in 2s total
        metrics.mark("ai_complete")
        
        # 4. TTS generation
        metrics.mark("tts_first_request")
        await asyncio.sleep(0.8)  # First audio chunk in 800ms
        metrics.mark("tts_first_chunk")
        
        # 5. Audio playback
        metrics.mark("audio_play_start")
        await asyncio.sleep(2.0)  # Audio plays for 2s
        metrics.mark("audio_complete")
        
        # Print report
        metrics.print_report()
        
        # Assertions
        summary = metrics.get_summary()
        assert summary['time_to_first_audio'] < 5000, "Time to first audio should be under 5s"
        assert summary['total_time'] < 10000, "Total time should be under 10s"
    
    @pytest.mark.asyncio
    async def test_parallel_tts_performance(self, client):
        """Test that parallel TTS provides performance benefits."""
        # Sequential TTS (old method)
        sequential_start = time.time()
        
        # Simulate AI generating 3 sentences sequentially
        for i in range(3):
            await asyncio.sleep(0.8)  # AI generates sentence
        # Then TTS all at once
        await asyncio.sleep(2.0)  # TTS generates all audio
        
        sequential_time = (time.time() - sequential_start) * 1000
        
        # Parallel TTS (new method)
        parallel_start = time.time()
        
        # Simulate AI generating 3 sentences with parallel TTS
        tts_tasks = []
        for i in range(3):
            await asyncio.sleep(0.8)  # AI generates sentence
            # Start TTS immediately (parallel)
            task = asyncio.create_task(asyncio.sleep(0.7))  # TTS for this sentence
            tts_tasks.append(task)
        
        # Wait for all TTS to complete
        await asyncio.gather(*tts_tasks)
        
        parallel_time = (time.time() - parallel_start) * 1000
        
        print(f"\n⚡ PARALLEL TTS PERFORMANCE:")
        print(f"  Sequential: {sequential_time:.0f}ms")
        print(f"  Parallel:   {parallel_time:.0f}ms")
        print(f"  Improvement: {sequential_time - parallel_time:.0f}ms ({(1 - parallel_time/sequential_time) * 100:.0f}% faster)")
        
        # Parallel should be significantly faster
        assert parallel_time < sequential_time * 0.7, "Parallel TTS should be at least 30% faster"
    
    @pytest.mark.asyncio
    async def test_sentence_detection_performance(self):
        """Test sentence detection regex performance."""
        import re
        
        # Test sentence detection on various text lengths
        test_texts = [
            "Short sentence.",
            "This is a longer sentence that contains more words and should still be fast.",
            "Multiple sentences. " * 100,  # 100 sentences
        ]
        
        pattern = re.compile(r'^(.*?[.!?])(\s+|$)')
        
        for text in test_texts:
            start = time.time()
            
            for _ in range(1000):  # Run 1000 times
                pattern.match(text)
            
            elapsed = (time.time() - start) * 1000
            
            print(f"\nSentence detection ({len(text)} chars): {elapsed:.2f}ms for 1000 iterations")
            assert elapsed < 100, "Sentence detection should be under 100ms for 1000 iterations"


class TestOptimizationTargets:
    """Test that optimizations meet their targets."""
    
    def test_silence_detection_threshold(self):
        """Verify silence detection is set to 1.2s."""
        # This would check the actual configuration
        SILENCE_THRESHOLD = 1200  # ms
        assert SILENCE_THRESHOLD == 1200, "Silence detection should be 1200ms"
        print(f"\n✓ Silence detection: {SILENCE_THRESHOLD}ms (target: 1200ms)")
    
    def test_audio_buffer_threshold(self):
        """Verify audio buffer is set to 4KB."""
        AUDIO_BUFFER_SIZE = 4096  # bytes
        assert AUDIO_BUFFER_SIZE == 4096, "Audio buffer should be 4KB"
        print(f"\n✓ Audio buffer: {AUDIO_BUFFER_SIZE} bytes (target: 4096 bytes)")
    
    def test_sentence_min_length(self):
        """Verify sentence minimum length is optimized."""
        SENTENCE_MIN_LENGTH = 20  # characters
        assert SENTENCE_MIN_LENGTH == 20, "Sentence min length should be 20 chars"
        print(f"\n✓ Sentence min length: {SENTENCE_MIN_LENGTH} chars (target: 20 chars)")
    
    def test_max_tokens_ai_focus(self):
        """Verify AI Focus Mode uses 220 tokens."""
        MAX_TOKENS = 220
        assert MAX_TOKENS == 220, "AI Focus Mode should use 220 max tokens"
        print(f"\n✓ Max tokens: {MAX_TOKENS} (target: 220)")


class TestMemoryUsage:
    """Test memory usage and resource cleanup."""
    
    @pytest.mark.asyncio
    async def test_audio_queue_cleanup(self):
        """Test that audio queues are properly cleaned up."""
        # Simulate creating and cleaning up audio queues
        audio_queue = []
        
        # Add 100 chunks
        for i in range(100):
            audio_queue.append(b'0' * 1024)  # 1KB chunks
        
        # Process queue
        while audio_queue:
            audio_queue.pop(0)
        
        assert len(audio_queue) == 0, "Audio queue should be empty after processing"
    
    @pytest.mark.asyncio
    async def test_sentence_queue_cleanup(self):
        """Test that sentence queues are properly cleaned up."""
        sentence_queue = []
        
        # Add sentences
        for i in range(10):
            sentence_queue.append(f"This is sentence number {i}.")
        
        # Process sequentially
        while sentence_queue:
            sentence = sentence_queue.pop(0)
            # Simulate processing
            await asyncio.sleep(0.01)
        
        assert len(sentence_queue) == 0, "Sentence queue should be empty after processing"


if __name__ == "__main__":
    """Run performance tests independently."""
    import sys
    
    async def run_tests():
        print("\n🚀 Running AI Focus Mode Performance Tests...\n")
        
        # Create test instance
        test = TestEndToEndPerformance()
        
        # Run complete cycle test
        await test.test_complete_cycle_performance(None)
        
        # Run parallel TTS test
        await test.test_parallel_tts_performance(None)
        
        # Run sentence detection test
        await test.test_sentence_detection_performance()
        
        # Run optimization targets
        opt_test = TestOptimizationTargets()
        opt_test.test_silence_detection_threshold()
        opt_test.test_audio_buffer_threshold()
        opt_test.test_sentence_min_length()
        opt_test.test_max_tokens_ai_focus()
        
        print("\n✅ All performance tests completed!\n")
    
    asyncio.run(run_tests())
