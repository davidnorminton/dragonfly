"""Database models."""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Enum as SQLEnum, ForeignKey, Float, Boolean
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


class ChatSession(Base):
    """Model for storing chat session metadata including titles."""
    __tablename__ = "chat_sessions"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=True)
    pinned = Column(Boolean, default=False, nullable=False)
    preset_id = Column(Integer, ForeignKey('prompt_presets.id'), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<ChatSession {self.session_id} - {self.title}>"


class PromptPreset(Base):
    """Model for storing custom prompt presets with context, temperature, and top_p."""
    __tablename__ = "prompt_presets"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False, index=True)
    context = Column(Text, nullable=False)  # Custom system prompt/context
    temperature = Column(Float, nullable=True)  # Optional temperature override
    top_p = Column(Float, nullable=True)  # Optional top_p override
    is_system = Column(Boolean, default=False, nullable=False)  # System presets cannot be deleted
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<PromptPreset {self.name}>"


class AIModelCache(Base):
    """Model for caching AI model lists from providers."""
    __tablename__ = "ai_model_cache"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    provider = Column(String, nullable=False, unique=True, index=True)  # anthropic, openai, etc.
    models = Column(JSON, nullable=False)  # List of available models
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<AIModelCache {self.provider}>"


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
    play_count = Column(Integer, default=0, nullable=False)  # Total play count
    extra_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    album = relationship("MusicAlbum", back_populates="songs")
    artist = relationship("MusicArtist", back_populates="songs")
    plays = relationship("MusicPlay", back_populates="song", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Song {self.title} - album_id={self.album_id}>"


class MusicPlay(Base):
    """Track individual song plays for analytics."""
    __tablename__ = "music_plays"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    song_id = Column(Integer, ForeignKey("music_songs.id"), nullable=False, index=True)
    played_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    play_duration_seconds = Column(Integer, nullable=True)  # How long they listened
    completed = Column(String, default="true")  # Whether they finished the song

    song = relationship("MusicSong", back_populates="plays")

    def __repr__(self):
        return f"<MusicPlay song_id={self.song_id} at {self.played_at}>"


class MusicPlaylist(Base):
    """User playlists."""
    __tablename__ = "music_playlists"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    songs = relationship("MusicPlaylistSong", back_populates="playlist", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Playlist {self.name}>"


class MusicPlaylistSong(Base):
    """Songs inside playlists."""
    __tablename__ = "music_playlist_songs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    playlist_id = Column(Integer, ForeignKey("music_playlists.id", ondelete="CASCADE"), nullable=False, index=True)
    file_path = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    artist = Column(String, nullable=True)
    album = Column(String, nullable=True)
    track_number = Column(Integer, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    playlist = relationship("MusicPlaylist", back_populates="songs")

    def __repr__(self):
        return f"<PlaylistSong {self.title} - playlist_id={self.playlist_id}>"


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


class SystemConfig(Base):
    """System configuration settings."""
    __tablename__ = "system_config"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    config_key = Column(String, unique=True, nullable=False, index=True)  # e.g., "paths", "server", "ai"
    config_value = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<SystemConfig {self.config_key}>"


class ApiKeysConfig(Base):
    """API keys configuration."""
    __tablename__ = "api_keys_config"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    service_name = Column(String, unique=True, nullable=False, index=True)  # e.g., "anthropic", "perplexity"
    api_key = Column(String, nullable=True)
    config_data = Column(JSON, nullable=True)  # For additional config like voice_id, location_id, etc.
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<ApiKeysConfig {self.service_name}>"


class LocationConfig(Base):
    """Location configuration."""
    __tablename__ = "location_config"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    city = Column(String, nullable=True)
    region = Column(String, nullable=True)
    postcode = Column(String, nullable=True)
    display_name = Column(String, nullable=True)
    location_id = Column(String, nullable=True)  # For BBC Weather or other services
    extra_data = Column(JSON, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<LocationConfig {self.display_name}>"


class PersonaConfig(Base):
    """Persona configuration."""
    __tablename__ = "persona_configs"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False, index=True)  # e.g., "default", "cortana", "rick_sanchez"
    title = Column(String, nullable=True)  # Display title
    config_data = Column(JSON, nullable=False)  # Full persona config (anthropic, fish_audio, filler, etc.)
    is_active = Column(String, default="false")  # Whether this is the current persona
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<PersonaConfig {self.name}>"


class RouterConfig(Base):
    """Router configuration for classifying inputs."""
    __tablename__ = "router_config"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    config_data = Column(JSON, nullable=False)  # Full router config
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<RouterConfig>"


class ExpertTypesConfig(Base):
    """Expert types configuration."""
    __tablename__ = "expert_types_config"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    expert_type = Column(String, unique=True, nullable=False, index=True)  # e.g., "therapist", "engineer"
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    system_prompt = Column(Text, nullable=False)
    icon = Column(String, nullable=True)
    extra_data = Column(JSON, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<ExpertTypesConfig {self.expert_type}>"


class OctopusEnergyConsumption(Base):
    """Model for storing Octopus Energy consumption readings."""
    __tablename__ = "octopus_energy_consumption"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    interval_start = Column(DateTime(timezone=True), nullable=False, index=True)
    interval_end = Column(DateTime(timezone=True), nullable=False)
    consumption = Column(Float, nullable=False)  # kWh
    meter_point = Column(String, nullable=False, index=True)
    meter_serial = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<OctopusEnergyConsumption {self.interval_start} - {self.consumption} kWh>"


class OctopusEnergyTariff(Base):
    """Model for storing Octopus Energy tariff information."""
    __tablename__ = "octopus_energy_tariff"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    meter_point = Column(String, nullable=False, index=True)
    tariff_code = Column(String, nullable=True)
    product_name = Column(String, nullable=True)
    is_prepay = Column(String, default="false")
    unit_rate = Column(Float, nullable=True)  # pence per kWh
    standing_charge = Column(Float, nullable=True)  # pence per day
    valid_from = Column(DateTime(timezone=True), nullable=False)
    valid_to = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<OctopusEnergyTariff {self.meter_point} - {self.unit_rate}p/kWh>"


class OctopusEnergyTariffRate(Base):
    """Model for storing historical Octopus Energy tariff rates (half-hourly for Agile tariffs)."""
    __tablename__ = "octopus_energy_tariff_rates"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    meter_point = Column(String, nullable=False, index=True)
    tariff_code = Column(String, nullable=False, index=True)
    valid_from = Column(DateTime(timezone=True), nullable=False, index=True)
    valid_to = Column(DateTime(timezone=True), nullable=False)
    unit_rate = Column(Float, nullable=False)  # pence per kWh
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<OctopusEnergyTariffRate {self.valid_from} - {self.unit_rate}p/kWh>"


class ArticleSummary(Base):
    """Model for storing article summaries."""
    __tablename__ = "article_summaries"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    article_url = Column(String, nullable=False, index=True, unique=True)
    article_title = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<ArticleSummary {self.article_url[:50]}...>"


class AlarmType(enum.Enum):
    """Alarm type enumeration."""
    TIME = "time"
    # Future types: reminder, notification, etc.


class Alarm(Base):
    """Model for storing alarms."""
    __tablename__ = "alarms"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    alarm_type = Column(SQLEnum(AlarmType), nullable=False, default=AlarmType.TIME)
    alarm_time = Column(DateTime(timezone=True), nullable=False, index=True)  # When the alarm should trigger (time only, date ignored for recurring)
    reason = Column(Text, nullable=True)  # User-provided reason/description
    audio_file = Column(String, nullable=True)  # Path to audio file to play (deprecated - use default from settings)
    is_active = Column(String, default="true")  # Whether alarm is active
    triggered = Column(String, default="false")  # Whether alarm has been triggered (for one-time alarms)
    triggered_at = Column(DateTime(timezone=True), nullable=True)  # When it was triggered
    recurring_days = Column(JSON, nullable=True)  # List of days of week (0=Monday, 6=Sunday) for recurring alarms. Null = one-time alarm
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<Alarm {self.alarm_type.value} at {self.alarm_time}>"

