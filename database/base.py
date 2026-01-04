"""Database base setup."""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from config.settings import settings

# Create async engine
# For SQLite, add connection args for better concurrency handling
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {
        "timeout": 30.0,  # Increase timeout for locked database
    }

engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
    connect_args=connect_args if connect_args else {},
    pool_pre_ping=True  # Verify connections before using them
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Base class for models
Base = declarative_base()


async def get_db() -> AsyncSession:
    """Dependency for getting database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database tables."""
    # Import models to ensure they're registered with Base
    from database import models  # noqa: F401
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

