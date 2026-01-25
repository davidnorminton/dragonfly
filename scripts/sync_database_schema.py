#!/usr/bin/env python3
"""
Database Schema Sync Script

Checks the database and ensures all tables from models.py exist.
Creates missing tables and updates schemas if there are changes.
"""
import sys
import asyncio
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import inspect, text, MetaData, Table, Column, Integer, String, Text, DateTime, JSON, Boolean, Float, BigInteger, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.exc import OperationalError, ProgrammingError
from database.base import Base, engine, AsyncSessionLocal
# Import all models to ensure they're registered with Base
from database.models import (
    Job, DeviceConnection, CollectedData, ChatMessage, ChatSession, PersonalChat,
    PromptPreset, AIModelCache, VideoMovie, VideoTVShow, VideoTVSeason, VideoTVEpisode,
    VideoSimilarContent, User, VideoPlaybackProgress, ActorFilmography, MovieCastCrew,
    TVShowCastCrew, MusicArtist, MusicAlbum, MusicSong, MusicPlay, MusicPlaylist,
    MusicPlaylistSong, DeviceTelemetry, SystemConfig, ApiKeysConfig, LocationConfig,
    Voice, PersonaConfig, RouterConfig, ExpertTypesConfig, OctopusEnergyConsumption,
    OctopusEnergyTariff, OctopusEnergyTariffRate, ArticleSummary, Alarm, Plot, Story,
    StoryCast, StoryScreenplayVersion, StoryComplete, Course, CourseSection,
    CourseSubsection, Lesson, CourseQuestion, ScraperSource, ScrapedArticle,
    ArticleTextContent, ArticleHtmlContent
)
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def get_all_models():
    """Get all SQLAlchemy models that inherit from Base."""
    # Get all classes registered with Base
    models = []
    for class_obj in Base.registry._class_registry.values():
        # Filter to only include actual model classes (not enums, etc.)
        if (hasattr(class_obj, '__tablename__') and 
            hasattr(class_obj, '__table__') and
            class_obj.__tablename__):
            models.append(class_obj)
    return models


def get_table_columns_from_model(model_class):
    """Extract column definitions from a model class."""
    columns = {}
    for column in model_class.__table__.columns:
        columns[column.name] = {
            'type': column.type,
            'nullable': column.nullable,
            'primary_key': column.primary_key,
            'default': column.default,
            'foreign_key': list(column.foreign_keys)[0] if column.foreign_keys else None
        }
    return columns


async def table_exists(conn, table_name: str) -> bool:
    """Check if a table exists in the database."""
    try:
        result = await conn.execute(text(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = '{table_name}'
            )
        """))
        return result.scalar()
    except Exception as e:
        logger.error(f"Error checking if table {table_name} exists: {e}")
        return False


async def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    try:
        result = await conn.execute(text(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = '{table_name}' 
                AND column_name = '{column_name}'
            )
        """))
        return result.scalar()
    except Exception as e:
        logger.error(f"Error checking if column {column_name} exists in {table_name}: {e}")
        return False


def get_sqlalchemy_type_sql(type_obj):
    """Convert SQLAlchemy type to SQL string."""
    type_str = str(type_obj)
    type_class = type(type_obj).__name__
    
    # Handle common types
    if 'VARCHAR' in type_str or 'String' in type_str or type_class == 'String':
        if hasattr(type_obj, 'length') and type_obj.length:
            return f"VARCHAR({type_obj.length})"
        return "VARCHAR"
    elif 'TEXT' in type_str or 'Text' in type_str or type_class == 'Text':
        return "TEXT"
    elif 'INTEGER' in type_str or 'Integer' in type_str or type_class == 'Integer':
        return "INTEGER"
    elif 'BIGINT' in type_str or 'BigInteger' in type_str or type_class == 'BigInteger':
        return "BIGINT"
    elif 'BOOLEAN' in type_str or 'Boolean' in type_str or type_class == 'Boolean':
        return "BOOLEAN"
    elif 'FLOAT' in type_str or 'Float' in type_str or type_class == 'Float':
        return "FLOAT"
    elif 'TIMESTAMP' in type_str or 'DateTime' in type_str or type_class == 'DateTime':
        return "TIMESTAMP WITH TIME ZONE"
    elif 'JSON' in type_str or type_class == 'JSON':
        return "JSON"
    elif 'ENUM' in type_str or 'Enum' in type_str or type_class == 'ENUM':
        # For enums, try to get the enum name
        if hasattr(type_obj, 'name') and type_obj.name:
            return type_obj.name
        return "VARCHAR"  # Fallback
    else:
        logger.warning(f"Unknown type: {type_obj} ({type_class}), using TEXT as fallback")
        return "TEXT"  # Safe fallback


async def add_column(conn, table_name: str, column_name: str, column_def: dict):
    """Add a column to an existing table."""
    try:
        type_sql = get_sqlalchemy_type_sql(column_def['type'])
        nullable = "NULL" if column_def['nullable'] else "NOT NULL"
        
        # Handle default values
        default_sql = ""
        if column_def.get('default'):
            default = column_def['default']
            if hasattr(default, 'arg'):
                # SQLAlchemy default object
                if hasattr(default.arg, '__call__'):
                    # Callable default (like func.now())
                    if 'now' in str(default.arg).lower():
                        default_sql = "DEFAULT NOW()"
                    else:
                        # Other callable defaults - skip for now
                        pass
                elif isinstance(default.arg, str):
                    # Escape single quotes in strings
                    escaped = default.arg.replace("'", "''")
                    default_sql = f"DEFAULT '{escaped}'"
                elif isinstance(default.arg, (int, float)):
                    default_sql = f"DEFAULT {default.arg}"
                elif isinstance(default.arg, bool):
                    default_sql = f"DEFAULT {str(default.arg).upper()}"
            elif isinstance(default, str):
                escaped = default.replace("'", "''")
                default_sql = f"DEFAULT '{escaped}'"
            elif isinstance(default, (int, float)):
                default_sql = f"DEFAULT {default}"
            elif isinstance(default, bool):
                default_sql = f"DEFAULT {str(default).upper()}"
        
        # Build ALTER TABLE statement
        parts = [f'ALTER TABLE "{table_name}"', f'ADD COLUMN "{column_name}"', type_sql]
        if nullable:
            parts.append(nullable)
        if default_sql:
            parts.append(default_sql)
        
        alter_sql = ' '.join(parts)
        logger.info(f"  Executing: {alter_sql}")
        await conn.execute(text(alter_sql))
        await conn.commit()
        logger.info(f"  ✓ Added column {column_name} to {table_name}")
        return True
    except Exception as e:
        logger.error(f"  ✗ Error adding column {column_name} to {table_name}: {e}", exc_info=True)
        await conn.rollback()
        return False


async def sync_table_schema(conn, model_class):
    """Sync a single table's schema with the model definition."""
    table_name = model_class.__tablename__
    
    # Check if table exists
    exists = await table_exists(conn, table_name)
    
    if not exists:
        # Create the entire table
        logger.info(f"Creating table {table_name}...")
        try:
            # Use SQLAlchemy to create the table
            def create_table_sync(sync_conn):
                model_class.__table__.create(sync_conn, checkfirst=True)
            
            await conn.run_sync(create_table_sync)
            await conn.commit()
            logger.info(f"✓ Created table {table_name}")
            return True
        except Exception as e:
            logger.error(f"Error creating table {table_name}: {e}", exc_info=True)
            await conn.rollback()
            return False
    else:
        # Table exists - check for missing columns
        logger.info(f"Checking schema for table {table_name}...")
        model_columns = get_table_columns_from_model(model_class)
        
        # Get existing columns from database
        def get_columns_sync(sync_conn):
            inspector = inspect(sync_conn)
            return inspector.get_columns(table_name)
        
        existing_columns_list = await conn.run_sync(get_columns_sync)
        existing_columns = {col['name']: col for col in existing_columns_list}
        
        changes_made = False
        
        # Check for missing columns
        for col_name, col_def in model_columns.items():
            if col_name not in existing_columns:
                logger.info(f"  Missing column: {col_name}")
                success = await add_column(conn, table_name, col_name, col_def)
                if success:
                    changes_made = True
                else:
                    logger.warning(f"  Failed to add column {col_name}")
        
        if not changes_made:
            logger.info(f"✓ Table {table_name} schema is up to date")
        else:
            logger.info(f"✓ Updated schema for table {table_name}")
        
        return True


async def create_missing_enums(conn):
    """Create missing ENUM types in PostgreSQL."""
    # Find all Enum columns in models
    enum_types = {}
    for model_class in get_all_models():
        if hasattr(model_class, '__table__'):
            for column in model_class.__table__.columns:
                if isinstance(column.type, SQLEnum):
                    enum_name = column.type.name
                    if not enum_name:
                        # Try to infer from the enum class
                        if hasattr(column.type, 'enum_class'):
                            enum_name = column.type.enum_class.__name__.lower()
                        else:
                            enum_name = f"{model_class.__tablename__}_{column.name}_enum"
                    
                    # Get enum values
                    if hasattr(column.type, 'enums'):
                        enum_values = [e.value if hasattr(e, 'value') else str(e) for e in column.type.enums]
                    elif hasattr(column.type, 'enum_class'):
                        # Get from enum class
                        enum_class = column.type.enum_class
                        enum_values = [e.value for e in enum_class]
                    else:
                        logger.warning(f"Could not extract enum values for {enum_name}")
                        continue
                    
                    # Store with name as key to avoid duplicates
                    if enum_name not in enum_types:
                        enum_types[enum_name] = enum_values
    
    # Check and create enum types
    for enum_name, enum_values in enum_types.items():
        try:
            # Check if enum exists
            result = await conn.execute(text(f"""
                SELECT EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = '{enum_name}'
                )
            """))
            exists = result.scalar()
            
            if not exists:
                # Create enum type - escape single quotes in values
                escaped_values = [v.replace("'", "''") for v in enum_values]
                values_str = ', '.join([f"'{v}'" for v in escaped_values])
                create_enum_sql = f"CREATE TYPE {enum_name} AS ENUM ({values_str})"
                logger.info(f"Creating ENUM type {enum_name} with values: {enum_values}")
                await conn.execute(text(create_enum_sql))
                await conn.commit()
                logger.info(f"✓ Created ENUM type {enum_name}")
            else:
                logger.debug(f"ENUM type {enum_name} already exists")
        except Exception as e:
            logger.warning(f"Could not create ENUM {enum_name}: {e}")
            await conn.rollback()


async def main():
    """Main function to sync database schema."""
    logger.info("=" * 80)
    logger.info("Database Schema Sync Script")
    logger.info("=" * 80)
    
    try:
        async with engine.begin() as conn:
            # First, create any missing ENUM types
            logger.info("\n📋 Step 1: Checking for missing ENUM types...")
            await create_missing_enums(conn)
            
            # Get all models
            logger.info("\n📋 Step 2: Checking all tables...")
            all_models = [cls for cls in get_all_models() 
                         if hasattr(cls, '__tablename__') and cls.__tablename__]
            
            logger.info(f"Found {len(all_models)} models to check")
            
            created_count = 0
            updated_count = 0
            error_count = 0
            
            for model_class in all_models:
                table_name = model_class.__tablename__
                try:
                    exists_before = await table_exists(conn, table_name)
                    success = await sync_table_schema(conn, model_class)
                    exists_after = await table_exists(conn, table_name)
                    
                    if success:
                        if not exists_before and exists_after:
                            created_count += 1
                        elif exists_before:
                            # Check if we made updates
                            model_columns = get_table_columns_from_model(model_class)
                            def get_cols_sync(sync_conn):
                                inspector = inspect(sync_conn)
                                return inspector.get_columns(table_name)
                            existing_columns_list = await conn.run_sync(get_cols_sync)
                            existing_columns = {col['name'] for col in existing_columns_list}
                            if len(model_columns) > len(existing_columns):
                                updated_count += 1
                    else:
                        error_count += 1
                        logger.error(f"✗ Failed to sync table {table_name}")
                except Exception as e:
                    logger.error(f"✗ Error processing table {table_name}: {e}", exc_info=True)
                    error_count += 1
            
            logger.info("\n" + "=" * 80)
            logger.info("Schema Sync Summary:")
            logger.info(f"  Total models checked: {len(all_models)}")
            logger.info(f"  Tables created: {created_count}")
            logger.info(f"  Tables updated: {updated_count}")
            logger.info(f"  Errors: {error_count}")
            logger.info("=" * 80)
            
            if error_count > 0:
                logger.warning("⚠️  Some tables had errors. Check the logs above.")
                return 1
            else:
                logger.info("✓ Database schema is synchronized!")
                return 0
                
    except Exception as e:
        logger.error(f"Fatal error in schema sync: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
