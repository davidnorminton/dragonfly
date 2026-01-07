#!/usr/bin/env python3
"""
Generate filler audio files for all personas to provide immediate feedback.
These short audio clips play while waiting for the actual AI response.
"""
import json
import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path to import from services
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.tts_service import TTSService


# Filler sentences that sound natural while processing
FILLER_SENTENCES = [
    "Mmm",
    "Let me think",
    "Hmm",
    "Let me see",
    "Alright",
    "Okay",
    "Right",
    "Interesting",
    "Well",
    "So"
]


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
    
    # Create output directory
    output_dir = Path(__file__).parent.parent / "data" / "audio" / "filler_words" / persona_name
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"  📁 Output directory: {output_dir}")
    
    # Generate each filler sentence
    tts = TTSService()
    generated_files = []
    
    for i, sentence in enumerate(FILLER_SENTENCES):
        filename = f"filler_{i:02d}.mp3"
        filepath = output_dir / filename
        
        print(f"  🔊 Generating: '{sentence}' -> {filename}")
        
        try:
            audio_bytes, _ = await tts.generate_audio(
                sentence,
                voice_id=voice_id,
                voice_engine=voice_engine,
                save_to_file=False
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

