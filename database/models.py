"""Database models."""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Enum as SQLEnum, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum
from database.base import Base


class JobStatus(enum.Enum):
    """Job status enumeration."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Job(Base):
    """Job model for tracking service execution."""
    __tablename__ = "jobs"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_id = Column(String, unique=True, index=True, nullable=False)
    service_name = Column(String, nullable=False)
    status = Column(SQLEnum(JobStatus), default=JobStatus.PENDING, nullable=False)
    input_data = Column(JSON, nullable=True)
    output_data = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<Job {self.job_id} - {self.service_name} - {self.status.value}>"


class DeviceConnection(Base):
    """Model for tracking connected devices."""
    __tablename__ = "device_connections"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    device_id = Column(String, unique=True, index=True, nullable=False)
    device_name = Column(String, nullable=False)
    device_type = Column(String, nullable=True)
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    device_metadata = Column("metadata", JSON, nullable=True)  # Column name is "metadata" in DB
    is_connected = Column(String, default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<Device {self.device_id} - {self.device_name}>"


class CollectedData(Base):
    """Model for storing collected data from various sources."""
    __tablename__ = "collected_data"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    source = Column(String, nullable=False, index=True)  # weather, traffic, news, etc.
    data_type = Column(String, nullable=False)  # weather_current, weather_forecast, etc.
    data = Column(JSON, nullable=False)
    collected_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<CollectedData {self.source} - {self.data_type}>"


class ChatMessage(Base):
    """Model for storing chat messages with AI."""
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String, index=True, nullable=True)  # Optional session grouping
    role = Column(String, nullable=False)  # user, assistant, system
    message = Column(Text, nullable=False)
    service_name = Column(String, nullable=True)  # ai_service, rag_service, etc.
    mode = Column(String, nullable=True)  # qa, conversational
    persona = Column(String, nullable=True)  # default, cortana, rick_sanchez, etc.
    message_metadata = Column("metadata", JSON, nullable=True)  # Column name is "metadata" in DB
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<ChatMessage {self.role} - {self.id}>"


class MusicArtist(Base):
    """Artist table."""
    __tablename__ = "music_artists"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    style = Column(String, nullable=True)  # genre/style
    country = Column(String, nullable=True)
    active_years = Column(String, nullable=True)  # e.g., "1980-1995"
    image_path = Column(String, nullable=True)
    extra_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    albums = relationship("MusicAlbum", back_populates="artist", cascade="all, delete-orphan")
    songs = relationship("MusicSong", back_populates="artist", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Artist {self.name}>"


class MusicAlbum(Base):
    """Album table linked to artist."""
    __tablename__ = "music_albums"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    artist_id = Column(Integer, ForeignKey("music_artists.id"), nullable=False, index=True)
    title = Column(String, nullable=False, index=True)
    year = Column(Integer, nullable=True)
    genre = Column(String, nullable=True)
    cover_path = Column(String, nullable=True)
    total_tracks = Column(Integer, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    extra_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("MusicArtist", back_populates="albums")
    songs = relationship("MusicSong", back_populates="album", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Album {self.title} - artist_id={self.artist_id}>"


class MusicSong(Base):
    """Song table linked to album (and artist for quick lookups)."""
    __tablename__ = "music_songs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    album_id = Column(Integer, ForeignKey("music_albums.id"), nullable=False, index=True)
    artist_id = Column(Integer, ForeignKey("music_artists.id"), nullable=False, index=True)
    title = Column(String, nullable=False, index=True)
    track_number = Column(Integer, nullable=True)
    disc_number = Column(Integer, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    file_path = Column(String, nullable=False)  # relative to music root
    bitrate = Column(Integer, nullable=True)  # kbps
    sample_rate = Column(Integer, nullable=True)
    channels = Column(Integer, nullable=True)
    codec = Column(String, nullable=True)
    genre = Column(String, nullable=True)
    year = Column(Integer, nullable=True)
    extra_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    album = relationship("MusicAlbum", back_populates="songs")
    artist = relationship("MusicArtist", back_populates="songs")

    def __repr__(self):
        return f"<Song {self.title} - album_id={self.album_id}>"


class DeviceTelemetry(Base):
    """Model for storing device telemetry data."""
    __tablename__ = "device_telemetry"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    device_id = Column(String, nullable=False, index=True)
    metric_name = Column(String, nullable=False, index=True)
    value = Column(JSON, nullable=False)
    unit = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    def __repr__(self):
        return f"<DeviceTelemetry {self.device_id} - {self.metric_name}>"

