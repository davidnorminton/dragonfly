#!/usr/bin/env python3
"""Migrate all configuration files to database."""
import asyncio
import json
import sys
from pathlib import Path
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal
from database.models import (
    SystemConfig, ApiKeysConfig, LocationConfig, PersonaConfig,
    RouterConfig, ExpertTypesConfig
)


async def migrate_system_config(session: AsyncSession):
    """Migrate system.json to database."""
    system_config_path = Path(__file__).parent.parent / "config" / "system.json"
    
    if system_config_path.exists():
        with open(system_config_path, 'r') as f:
            config_data = json.load(f)
        
        for key, value in config_data.items():
            existing = await session.scalar(
                select(SystemConfig).where(SystemConfig.config_key == key)
            )
            if existing:
                existing.config_value = value
            else:
                session.add(SystemConfig(config_key=key, config_value=value))
        
        print(f"✅ Migrated system config ({len(config_data)} keys)")
    else:
        print("⚠️  system.json not found, skipping")


async def migrate_api_keys(session: AsyncSession):
    """Migrate api_keys.json to database."""
    api_keys_path = Path(__file__).parent.parent / "config" / "api_keys.json"
    
    if api_keys_path.exists():
        with open(api_keys_path, 'r') as f:
            api_keys_data = json.load(f)
        
        for service_name, service_data in api_keys_data.items():
            api_key = service_data.get("api_key")
            config_data = {k: v for k, v in service_data.items() if k != "api_key"}
            
            existing = await session.scalar(
                select(ApiKeysConfig).where(ApiKeysConfig.service_name == service_name)
            )
            if existing:
                existing.api_key = api_key
                existing.config_data = config_data if config_data else None
            else:
                session.add(ApiKeysConfig(
                    service_name=service_name,
                    api_key=api_key,
                    config_data=config_data if config_data else None
                ))
        
        print(f"✅ Migrated API keys ({len(api_keys_data)} services)")
    else:
        print("⚠️  api_keys.json not found, skipping")


async def migrate_location(session: AsyncSession):
    """Migrate location.json to database."""
    location_path = Path(__file__).parent.parent / "config" / "location.json"
    
    if location_path.exists():
        with open(location_path, 'r') as f:
            location_data = json.load(f)
        
        existing = await session.scalar(select(LocationConfig).limit(1))
        if existing:
            existing.city = location_data.get("city")
            existing.region = location_data.get("region")
            existing.postcode = location_data.get("postcode")
            existing.display_name = location_data.get("display_name")
            existing.location_id = location_data.get("location_id")
        else:
            session.add(LocationConfig(
                city=location_data.get("city"),
                region=location_data.get("region"),
                postcode=location_data.get("postcode"),
                display_name=location_data.get("display_name"),
                location_id=location_data.get("location_id")
            ))
        
        print("✅ Migrated location config")
    else:
        print("⚠️  location.json not found, skipping")


async def migrate_personas(session: AsyncSession):
    """Migrate persona config files to database."""
    personas_dir = Path(__file__).parent.parent / "config" / "personas"
    
    if not personas_dir.exists():
        print("⚠️  personas directory not found, skipping")
        return
    
    persona_files = list(personas_dir.glob("*.config"))
    migrated_count = 0
    
    for persona_file in persona_files:
        persona_name = persona_file.stem
        
        with open(persona_file, 'r') as f:
            persona_data = json.load(f)
        
        title = persona_data.get("title", persona_name)
        is_active = "false"
        
        # Check if this is the current persona
        current_persona_path = Path(__file__).parent.parent / "config" / "current_persona.json"
        if current_persona_path.exists():
            with open(current_persona_path, 'r') as f:
                current_data = json.load(f)
                if current_data.get("persona") == persona_name:
                    is_active = "true"
        
        existing = await session.scalar(
            select(PersonaConfig).where(PersonaConfig.name == persona_name)
        )
        if existing:
            existing.title = title
            existing.config_data = persona_data
            existing.is_active = is_active
        else:
            session.add(PersonaConfig(
                name=persona_name,
                title=title,
                config_data=persona_data,
                is_active=is_active
            ))
        
        migrated_count += 1
    
    print(f"✅ Migrated {migrated_count} persona configs")
    
    # If no active persona set, set default as active
    if current_persona_path.exists():
        with open(current_persona_path, 'r') as f:
            current_data = json.load(f)
            current_persona_name = current_data.get("persona")
            if current_persona_name:
                # Ensure this persona is marked as active
                await session.execute(
                    update(PersonaConfig)
                    .where(PersonaConfig.name == current_persona_name)
                    .values(is_active="true")
                )
                # Mark all others as inactive
                await session.execute(
                    update(PersonaConfig)
                    .where(PersonaConfig.name != current_persona_name)
                    .values(is_active="false")
                )


async def migrate_router(session: AsyncSession):
    """Migrate router.config to database."""
    router_path = Path(__file__).parent.parent / "config" / "router.config"
    
    if router_path.exists():
        with open(router_path, 'r') as f:
            router_data = json.load(f)
        
        existing = await session.scalar(select(RouterConfig).limit(1))
        if existing:
            existing.config_data = router_data
        else:
            session.add(RouterConfig(config_data=router_data))
        
        print("✅ Migrated router config")
    else:
        print("⚠️  router.config not found, skipping")


async def migrate_expert_types(session: AsyncSession):
    """Migrate expert_types.json to database."""
    expert_types_path = Path(__file__).parent.parent / "config" / "expert_types.json"
    
    if expert_types_path.exists():
        with open(expert_types_path, 'r') as f:
            expert_types_data = json.load(f)
        
        for expert_type, expert_data in expert_types_data.items():
            existing = await session.scalar(
                select(ExpertTypesConfig).where(ExpertTypesConfig.expert_type == expert_type)
            )
            if existing:
                existing.name = expert_data.get("name")
                existing.description = expert_data.get("description")
                existing.system_prompt = expert_data.get("system_prompt")
                existing.icon = expert_data.get("icon")
                existing.extra_data = {k: v for k, v in expert_data.items() 
                                     if k not in ["name", "description", "system_prompt", "icon"]}
            else:
                session.add(ExpertTypesConfig(
                    expert_type=expert_type,
                    name=expert_data.get("name"),
                    description=expert_data.get("description"),
                    system_prompt=expert_data.get("system_prompt"),
                    icon=expert_data.get("icon"),
                    extra_data={k: v for k, v in expert_data.items() 
                               if k not in ["name", "description", "system_prompt", "icon"]}
                ))
        
        print(f"✅ Migrated expert types ({len(expert_types_data)} types)")
    else:
        print("⚠️  expert_types.json not found, skipping")


async def main():
    """Run all migrations."""
    print("🔄 Starting configuration migration to database...\n")
    
    # Create tables first
    from database.base import Base, engine
    print("📦 Creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Database tables created\n")
    
    async with AsyncSessionLocal() as session:
        try:
            await migrate_system_config(session)
            await migrate_api_keys(session)
            await migrate_location(session)
            await migrate_personas(session)
            await migrate_router(session)
            await migrate_expert_types(session)
            
            await session.commit()
            print("\n✅ Migration completed successfully!")
        except Exception as e:
            await session.rollback()
            print(f"\n❌ Migration failed: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(main())

