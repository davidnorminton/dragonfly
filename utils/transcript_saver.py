"""Utility for saving chat transcripts to JSON files."""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any


def get_transcripts_directory() -> Path:
    """Get the path to the transcripts directory."""
    return Path(__file__).parent.parent / "data" / "transcripts"


def save_transcript(question: str, answer: str, persona: str, model: str, session_id: str = None) -> str:
    """
    Save a chat transcript to a JSON file.
    
    Args:
        question: The user's question
        answer: The AI's answer
        persona: The persona name used
        model: The AI model used
        session_id: Optional session ID
    
    Returns:
        Path to the saved transcript file
    """
    transcripts_dir = get_transcripts_directory()
    transcripts_dir.mkdir(parents=True, exist_ok=True)
    
    # Create transcript data
    transcript = {
        "question": question,
        "answer": answer,
        "persona": persona,
        "model": model,
        "datetime": datetime.now().isoformat(),
        "session_id": session_id
    }
    
    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"transcript_{timestamp}.json"
    filepath = transcripts_dir / filename
    
    # Save to file
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(transcript, f, indent=2, ensure_ascii=False)
    
    return str(filepath)

