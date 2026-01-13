#!/usr/bin/env python3
"""
Migration script to move voice IDs from persona configs to the new voices table.
Extracts voice IDs for: cortana, rick, rick_computer (or rick's computer), and holly.
"""
import asyncio
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.base import AsyncSessionLocal, init_db
from database.models import PersonaConfig, Voice
from sqlalchemy import select


async def migrate_voices():
    """Migrate voice IDs from persona configs to voices table."""
    await init_db()
    
    # Personas to migrate
    personas_to_migrate = ["cortana", "rick", "rick_computer", "holly"]
    
    async with AsyncSessionLocal() as session:
        migrated_count = 0
        
        for persona_name in personas_to_migrate:
            try:
                # Try exact match first
                result = await session.execute(
                    select(PersonaConfig).where(PersonaConfig.name == persona_name)
                )
                persona = result.scalar_one_or_none()
                
                # If not found, try variations
                if not persona:
                    if persona_name == "rick":
                        result = await session.execute(
                            select(PersonaConfig).where(PersonaConfig.name.like("%rick%"))
                        )
                        personas = result.scalars().all()
                        if personas:
                            persona = personas[0]  # Take first match
                            print(f"  Found persona '{persona.name}' for 'rick'")
                    elif persona_name == "rick_computer":
                        # Try various forms of "rick's computer" or "rick computer"
                        result = await session.execute(
                            select(PersonaConfig).where(
                                (PersonaConfig.name.like("%rick%computer%")) |
                                (PersonaConfig.name.like("%rick_computer%")) |
                                (PersonaConfig.name.like("%ricks_computer%"))
                            )
                        )
                        personas = result.scalars().all()
                        if personas:
                            persona = personas[0]
                            print(f"  Found persona '{persona.name}' for 'rick_computer'")
                            # Keep persona_name as "rick_computer" for the voices table
                            # (don't change it to match the actual persona name)
                
                if not persona:
                    print(f"  ⚠️  Persona '{persona_name}' not found, skipping")
                    continue
                
                # Extract voice ID from config_data
                config_data = persona.config_data or {}
                fish_audio = config_data.get("fish_audio", {})
                voice_id = fish_audio.get("voice_id")
                voice_engine = fish_audio.get("voice_engine", "s1")
                
                if not voice_id:
                    print(f"  ⚠️  No voice_id found in persona '{persona.name}', skipping")
                    continue
                
                # Check if voice already exists
                existing = await session.execute(
                    select(Voice).where(Voice.persona_name == persona_name)
                )
                existing_voice = existing.scalar_one_or_none()
                
                if existing_voice:
                    # Update existing
                    existing_voice.fish_audio_id = voice_id
                    existing_voice.voice_engine = voice_engine
                    print(f"  ✅ Updated voice for '{persona_name}': {voice_id}")
                else:
                    # Create new
                    voice = Voice(
                        persona_name=persona_name,
                        fish_audio_id=voice_id,
                        voice_engine=voice_engine
                    )
                    session.add(voice)
                    print(f"  ✅ Created voice for '{persona_name}': {voice_id}")
                
                migrated_count += 1
                
            except Exception as e:
                print(f"  ❌ Error migrating '{persona_name}': {e}")
                continue
        
        await session.commit()
        print(f"\n✅ Migration complete: {migrated_count} voices migrated")
        
        # Show all voices in table
        result = await session.execute(select(Voice))
        voices = result.scalars().all()
        if voices:
            print(f"\n📋 Voices in table:")
            for voice in voices:
                print(f"   - {voice.persona_name}: {voice.fish_audio_id} (engine: {voice.voice_engine})")


if __name__ == "__main__":
    print("🔄 Migrating voice IDs from persona configs to voices table...\n")
    asyncio.run(migrate_voices())
