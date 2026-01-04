"""Utility for saving chat transcripts to JSON files."""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any


def get_transcripts_directory() -> Path:
    """Get the path to the transcripts directory."""
    return Path(__file__).parent.parent / "data" / "transcripts"


def save_transcript(question: str, answer: str, persona: str, model: str, session_id: str = None, audio_file: str = None, mode: str = "qa", expert_type: str = "general") -> str:
    """
    Save a chat transcript to a JSON file organized by mode and persona/expert.
    
    Args:
        question: The user's question
        answer: The AI's answer
        persona: The persona name used
        model: The AI model used
        session_id: Optional session ID
        audio_file: Optional path to audio file for the answer
        mode: Chat mode ("qa" or "conversational")
        expert_type: Expert type for conversational mode (e.g., "therapist", "doctor", "engineer")
    
    Returns:
        Path to the saved transcript file
    """
    transcripts_dir = get_transcripts_directory()
    
    # Organize transcripts by mode and persona/expert
    if mode == "qa":
        # QA mode: organize by persona (default, cortana, rick_sanchez, etc.)
        mode_dir = transcripts_dir / "qa" / persona
    else:
        # Conversational mode: organize by expert type (therapist, doctor, engineer, etc.)
        mode_dir = transcripts_dir / "conversational" / expert_type
    
    # Ensure directory exists
    mode_dir.mkdir(parents=True, exist_ok=True)
    
    # Create transcript data
    transcript = {
        "question": question,
        "answer": answer,
        "persona": persona,
        "model": model,
        "datetime": datetime.now().isoformat(),
        "session_id": session_id,
        "mode": mode,
        "expert_type": expert_type if mode == "conversational" else None
    }
    
    # Add audio file reference if provided
    if audio_file:
        transcript["audio_file"] = audio_file
    
    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"transcript_{timestamp}.json"
    filepath = mode_dir / filename
    
    # Save to file
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(transcript, f, indent=2, ensure_ascii=False)
    
    return str(filepath)

