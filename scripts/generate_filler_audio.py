#!/usr/bin/env python3
"""
Generate filler audio files for all personas to provide immediate feedback.
These short audio clips play while waiting for the actual AI response.
Each persona gets AI-generated filler sentences that match their personality.
"""
import json
import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path to import from services
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.tts_service import TTSService
from services.ai_service import AIService


async def generate_filler_sentences_for_persona(persona_name: str, persona_config: dict) -> list:
    """
    Use AI to generate persona-appropriate filler sentences.
    
    Args:
        persona_name: Name of the persona
        persona_config: Persona configuration dictionary
    
    Returns:
        List of filler sentences appropriate for this persona
    """
    print(f"\n🤖 Asking AI to generate filler sentences for {persona_name}...")
    
    # Get persona prompt context if available
    persona_context = ""
    if "anthropic" in persona_config:
        prompt_context = persona_config["anthropic"].get("prompt_context", "")
        # Extract just the personality description (first few lines)
        if prompt_context:
            lines = prompt_context.split('\n')
            personality_lines = [l for l in lines[:10] if l.strip() and not l.startswith('#')]
            persona_context = ' '.join(personality_lines[:3])
    
    # Create prompt for AI to generate filler sentences
    prompt = f"""You are helping create voice assistant filler phrases for a persona named "{persona_name}".

{f"Persona description: {persona_context}" if persona_context else ""}

Generate exactly 10 short filler sentences (5-15 words each) that this persona would say while thinking or processing a request. These should:
- Sound natural and conversational
- Match the persona's personality and speaking style
- Indicate the system is thinking/processing
- Be SHORT enough to play as quick audio clips (1-3 seconds when spoken)
- Vary in style (some acknowledgements, some thinking sounds, some brief comments)

Examples of good filler phrases:
- "Let me think about that for a moment"
- "Hmm, interesting question"
- "Alright, let me check on that"
- "Give me just a second here"
- "Okay, processing that now"

Return ONLY a JSON array of 10 strings, nothing else. No markdown, no explanation, just the JSON array.
Example format: ["phrase 1", "phrase 2", ...]"""

    try:
        ai = AIService()
        result = await ai.execute({"question": prompt})
        
        if result.get("error"):
            print(f"  ⚠️  AI generation failed: {result.get('error')}")
            return None
        
        response_text = result.get("answer", "").strip()
        
        # Try to parse the JSON response
        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            lines = response_text.split('\n')
            response_text = '\n'.join(lines[1:-1])
        
        # Remove any "json" language indicator
        response_text = response_text.replace("```json", "").replace("```", "").strip()
        
        filler_sentences = json.loads(response_text)
        
        if isinstance(filler_sentences, list) and len(filler_sentences) >= 10:
            print(f"  ✅ Generated {len(filler_sentences)} filler sentences")
            for i, sentence in enumerate(filler_sentences[:10], 1):
                print(f"     {i}. {sentence}")
            return filler_sentences[:10]
        else:
            print(f"  ⚠️  Invalid response format or not enough sentences")
            return None
            
    except json.JSONDecodeError as e:
        print(f"  ❌ Failed to parse AI response as JSON: {e}")
        print(f"  Response was: {response_text[:200]}")
        return None
    except Exception as e:
        print(f"  ❌ Error generating sentences: {e}")
        return None


async def generate_filler_for_persona(persona_name: str, persona_config: dict):
    """Generate filler audio files for a specific persona."""
    print(f"\n🎤 Generating filler audio for persona: {persona_name}")
    
    # Get Fish Audio config
    fish_cfg = persona_config.get("fish_audio", {})
    voice_id = fish_cfg.get("voice_id")
    voice_engine = fish_cfg.get("voice_engine", "s1-mini")
    
    if not voice_id:
        print(f"  ⚠️  No voice ID found for {persona_name}, skipping...")
        return []
    
    # Generate persona-specific filler sentences using AI
    filler_sentences = await generate_filler_sentences_for_persona(persona_name, persona_config)
    
    if not filler_sentences:
        print(f"  ⚠️  Using default filler sentences as fallback")
        filler_sentences = [
            "Let me think about that",
            "Hmm, interesting",
            "Give me a moment",
            "Let me check",
            "Alright",
            "Okay",
            "One second",
            "Processing that",
            "Let me see",
            "Working on it"
        ]
    
    # Create output directory
    output_dir = Path(__file__).parent.parent / "data" / "audio" / "filler_words" / persona_name
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"  📁 Output directory: {output_dir}")
    
    # Generate each filler sentence
    tts = TTSService()
    generated_files = []
    
    for i, sentence in enumerate(filler_sentences):
        filename = f"filler_{i:02d}.mp3"
        filepath = output_dir / filename
        
        print(f"  🔊 Generating: '{sentence}' -> {filename}")
        
        try:
            # Use the simple HTTP method for reliability
            audio_bytes = await tts.generate_audio_simple(
                sentence,
                voice_id=voice_id,
                voice_engine=voice_engine
            )
            
            if audio_bytes:
                # Save the audio file
                with open(filepath, 'wb') as f:
                    f.write(audio_bytes)
                
                # Store relative path from config directory
                relative_path = f"../data/audio/filler_words/{persona_name}/{filename}"
                generated_files.append(relative_path)
                print(f"    ✅ Saved ({len(audio_bytes)} bytes)")
            else:
                print(f"    ❌ Failed to generate audio")
                
        except Exception as e:
            print(f"    ❌ Error: {e}")
    
    return generated_files


async def main():
    """Generate filler audio for all personas."""
    print("🎵 Filler Audio Generator for Dragonfly AI")
    print("=" * 60)
    
    # Load personas
    config_dir = Path(__file__).parent.parent / "config" / "personas"
    
    if not config_dir.exists():
        print(f"❌ Persona config directory not found: {config_dir}")
        return
    
    persona_files = list(config_dir.glob("*.config"))
    
    if not persona_files:
        print(f"❌ No persona config files found in {config_dir}")
        return
    
    print(f"📋 Found {len(persona_files)} persona(s)")
    
    # Generate filler audio for each persona
    updated_configs = {}
    
    for persona_file in persona_files:
        persona_name = persona_file.stem
        
        try:
            with open(persona_file, 'r') as f:
                config = json.load(f)
            
            # Generate filler audio
            filler_paths = await generate_filler_for_persona(persona_name, config)
            
            if filler_paths:
                # Add filler paths to config
                config["filler_audio"] = filler_paths
                updated_configs[persona_file] = config
                print(f"  ✅ Generated {len(filler_paths)} filler audio files")
            else:
                print(f"  ⚠️  No filler audio generated")
                
        except Exception as e:
            print(f"  ❌ Error processing {persona_name}: {e}")
    
    # Update persona config files
    if updated_configs:
        print(f"\n💾 Updating {len(updated_configs)} persona config file(s)...")
        
        for persona_file, config in updated_configs.items():
            try:
                with open(persona_file, 'w') as f:
                    json.dump(config, f, indent=2)
                print(f"  ✅ Updated {persona_file.name}")
            except Exception as e:
                print(f"  ❌ Failed to update {persona_file.name}: {e}")
    
    print("\n" + "=" * 60)
    print("✨ Filler audio generation complete!")
    print(f"📁 Files saved to: data/audio/filler_words/")


if __name__ == "__main__":
    asyncio.run(main())

