"""Database models."""
from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Text, JSON, Enum as SQLEnum, ForeignKey, Float, Boolean
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
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)  # Link to user
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


class VideoMovie(Base):
    """Movie table for video library."""
    __tablename__ = "video_movies"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False, index=True)
    file_path = Column(String, nullable=False, unique=True)
    file_size = Column(BigInteger, nullable=True)  # Size in bytes (BigInteger supports files > 2GB)
    duration = Column(BigInteger, nullable=True)  # Duration in seconds (BigInteger for safety)
    year = Column(Integer, nullable=True)
    uk_certification = Column(String, nullable=True)  # UK rating: U, PG, 12, 12A, 15, 18, R18
    resolution = Column(String, nullable=True)  # 1080p, 4K, etc.
    codec = Column(String, nullable=True)  # h264, h265, etc.
    description = Column(Text, nullable=True)
    poster_path = Column(String, nullable=True)
    extra_metadata = Column("metadata", JSON, nullable=True)  # Column name is "metadata" in DB
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<VideoMovie {self.title}>"


class VideoTVShow(Base):
    """TV Show table."""
    __tablename__ = "video_tv_shows"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False, unique=True, index=True)
    directory_path = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    poster_path = Column(String, nullable=True)
    year = Column(Integer, nullable=True)
    extra_metadata = Column("metadata", JSON, nullable=True)  # Column name is "metadata" in DB
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    seasons = relationship("VideoTVSeason", back_populates="show", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<VideoTVShow {self.title}>"


class VideoTVSeason(Base):
    """TV Season table."""
    __tablename__ = "video_tv_seasons"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    show_id = Column(Integer, ForeignKey("video_tv_shows.id"), nullable=False, index=True)
    season_number = Column(Integer, nullable=False)
    directory_path = Column(String, nullable=False)
    poster_path = Column(String, nullable=True)
    extra_metadata = Column("metadata", JSON, nullable=True)  # Column name is "metadata" in DB
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    show = relationship("VideoTVShow", back_populates="seasons")
    episodes = relationship("VideoTVEpisode", back_populates="season", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<VideoTVSeason {self.show.title if self.show else 'Unknown'} S{self.season_number}>"


class VideoTVEpisode(Base):
    """TV Episode table."""
    __tablename__ = "video_tv_episodes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    season_id = Column(Integer, ForeignKey("video_tv_seasons.id"), nullable=False, index=True)
    episode_number = Column(Integer, nullable=False)
    title = Column(String, nullable=True)
    file_path = Column(String, nullable=False, unique=True)
    file_size = Column(BigInteger, nullable=True)  # Size in bytes (BigInteger supports files > 2GB)
    duration = Column(BigInteger, nullable=True)  # Duration in seconds (BigInteger for safety)
    resolution = Column(String, nullable=True)
    codec = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    thumbnail_path = Column(String, nullable=True)
    extra_metadata = Column("metadata", JSON, nullable=True)  # Column name is "metadata" in DB
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    season = relationship("VideoTVSeason", back_populates="episodes")

    def __repr__(self):
        return f"<VideoTVEpisode S{self.season.season_number if self.season else '?'}E{self.episode_number}>"


class VideoSimilarContent(Base):
    """Store AI-generated similar movies/shows recommendations."""
    __tablename__ = "video_similar_content"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    content_type = Column(String, nullable=False, index=True)  # 'movie' or 'tv_show'
    content_id = Column(Integer, nullable=False, index=True)  # ID of movie or TV show
    similar_items = Column(JSON, nullable=False)  # List of similar movies/shows with titles, years, reasons
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<VideoSimilarContent {self.content_type} {self.content_id}>"


class User(Base):
    """User profile model."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False, index=True)
    birthday = Column(DateTime(timezone=True), nullable=True)
    profile_picture = Column(String, nullable=True)  # Path to profile picture file
    pass_code = Column(String, nullable=True)  # User pass code
    is_admin = Column(Boolean, default=False, nullable=False)
    preferred_persona = Column(String, nullable=True)  # User's preferred persona name
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<User {self.name} (Admin: {self.is_admin})>"


class VideoPlaybackProgress(Base):
    """Track video playback progress for resume functionality."""
    __tablename__ = "video_playback_progress"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    video_type = Column(String, nullable=False, index=True)  # 'movie' or 'episode'
    video_id = Column(Integer, nullable=False, index=True)  # ID of movie or episode
    position = Column(Float, nullable=False)  # Current playback position in seconds
    duration = Column(Float)  # Total duration in seconds
    last_played = Column(DateTime(timezone=True), server_default=func.now())
    completed = Column(Boolean, default=False)  # Mark as completed if watched >90%
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<VideoPlaybackProgress {self.video_type}:{self.video_id} @ {self.position}s>"


class ActorFilmography(Base):
    """Actor filmography data from TMDB."""
    __tablename__ = 'actor_filmography'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    actor_name = Column(String, nullable=False, index=True)
    tmdb_person_id = Column(Integer, index=True)  # TMDB person ID
    profile_path = Column(String)  # Actor's profile image URL
    filmography = Column(JSON)  # List of movies with details
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ActorFilmography {self.actor_name}>"


class MovieCastCrew(Base):
    """Movie cast and crew data from TMDB."""
    __tablename__ = 'movie_cast_crew'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    movie_title = Column(String, nullable=False, index=True)
    movie_year = Column(Integer, index=True)
    tmdb_id = Column(Integer, index=True)  # TMDB movie ID
    cast = Column(JSON)  # List of cast members with name, character, profile_path
    director = Column(JSON)  # Object with name, profile_path
    writer = Column(JSON)  # Object with name, profile_path
    producer = Column(JSON)  # Object with name, profile_path
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<MovieCastCrew {self.movie_title} ({self.movie_year})>"


class TVShowCastCrew(Base):
    """TV show cast and crew data from TMDB."""
    __tablename__ = 'tv_show_cast_crew'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    show_title = Column(String, nullable=False, index=True)
    show_year = Column(Integer, index=True)
    tmdb_id = Column(Integer, index=True)  # TMDB TV show ID
    cast = Column(JSON)  # List of cast members with name, character, profile_path
    creator = Column(JSON)  # Object with name, profile_path
    writer = Column(JSON)  # Object with name, profile_path
    producer = Column(JSON)  # Object with name, profile_path
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<TVShowCastCrew {self.show_title} ({self.show_year})>"


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
    name = Column(String, nullable=False, index=True)  # Removed unique constraint, now unique per user
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)  # Link to user
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


class Voice(Base):
    """Voice configuration for personas."""
    __tablename__ = "voices"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    persona_name = Column(String, unique=True, nullable=False, index=True)  # e.g., "cortana", "rick", "rick_computer", "holly"
    fish_audio_id = Column(String, nullable=False)  # Fish Audio voice ID
    voice_engine = Column(String, nullable=True, default="s1")  # Voice engine (s1, s1-mini, etc.)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<Voice {self.persona_name} - {self.fish_audio_id}>"


class PersonaConfig(Base):
    """Persona configuration."""
    __tablename__ = "persona_configs"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False, index=True)  # e.g., "default", "cortana", "rick_sanchez"
    title = Column(String, nullable=True)  # Display title
    config_data = Column(JSON, nullable=False)  # Full persona config (anthropic, fish_audio, filler, etc.)
    is_active = Column(String, default="false")  # Whether this is the current persona
    voice_id = Column(Integer, ForeignKey("voices.id"), nullable=True, index=True)  # Link to voice in voices table
    image_path = Column(String, nullable=True)  # Path to persona image file
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    voice = relationship("Voice", foreign_keys=[voice_id])
    
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


class Plot(Base):
    """Model for storing story plot details."""
    __tablename__ = "plots"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    details = Column(Text, nullable=False)  # Plot details/description
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationship to stories
    stories = relationship("Story", back_populates="plot")
    
    def __repr__(self):
        return f"<Plot {self.id}>"


class Story(Base):
    """Model for storing stories."""
    __tablename__ = "stories"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False, index=True)
    plot_id = Column(Integer, ForeignKey("plots.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # Link to user who created it
    narrator_persona = Column(String, nullable=True, index=True)  # Persona name for narrator
    screenplay = Column(Text, nullable=True)  # Generated screenplay JSON
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    plot = relationship("Plot", back_populates="stories")
    cast = relationship("StoryCast", back_populates="story", cascade="all, delete-orphan")
    screenplay_versions = relationship("StoryScreenplayVersion", back_populates="story", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Story {self.title}>"


class StoryCast(Base):
    """Model for storing story cast (personas with custom context)."""
    __tablename__ = "story_cast"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False, index=True)
    persona_name = Column(String, nullable=False, index=True)  # Name of the persona
    custom_context = Column(Text, nullable=True)  # Custom context for this persona in this story
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship
    story = relationship("Story", back_populates="cast")

    def __repr__(self):
        return f"<StoryCast {self.persona_name} for story {self.story_id}>"


class StoryScreenplayVersion(Base):
    """Model for storing screenplay versions/history for a story."""
    __tablename__ = "story_screenplay_versions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False, index=True)
    screenplay = Column(Text, nullable=False)  # JSON screenplay data
    version_number = Column(Integer, nullable=False, default=1)  # Version number
    is_active = Column(Boolean, default=False, index=True)  # Which version is currently active
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship
    story = relationship("Story", back_populates="screenplay_versions")

    def __repr__(self):
        return f"<StoryScreenplayVersion {self.id} for story {self.story_id} v{self.version_number}>"


class StoryComplete(Base):
    """Model for storing completed/built stories with audio."""
    __tablename__ = "stories_complete"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False, index=True)  # Story title
    image = Column(String, nullable=True)  # Image path (placeholder for now)
    story = Column(Text, nullable=False)  # Formatted screenplay text: <speaker>#text
    audio = Column(String, nullable=False)  # Path to complete audio file
    narrator = Column(String, nullable=True)  # Narrator persona name
    cast = Column("cast", JSON, nullable=True)  # Cast personas: [{"persona_name": "...", "custom_context": "..."}]
    screenplay = Column(Text, nullable=True)  # Original screenplay JSON used to create audio
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<StoryComplete {self.id}: {self.title}>"


class Course(Base):
    """Model for storing courses."""
    __tablename__ = "courses"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # Link to user who created it
    title = Column(String, nullable=False, index=True)
    original_prompt = Column(Text, nullable=False)  # Original user prompt for generating the course
    pinned = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    sections = relationship("CourseSection", back_populates="course", cascade="all, delete-orphan", order_by="CourseSection.order_index")
    questions = relationship("CourseQuestion", back_populates="course", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Course {self.id}: {self.title}>"


class CourseSection(Base):
    """Model for storing course sections."""
    __tablename__ = "course_sections"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=True)  # Summary/description of what this section should teach
    order_index = Column(Integer, nullable=False, index=True)  # Order within the course (0, 1, 2, ...)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    course = relationship("Course", back_populates="sections")
    lesson = relationship("Lesson", back_populates="section", uselist=False, cascade="all, delete-orphan")
    questions = relationship("CourseQuestion", back_populates="section", cascade="all, delete-orphan")
    subsections = relationship("CourseSubsection", back_populates="section", cascade="all, delete-orphan", order_by="CourseSubsection.order_index")
    
    def __repr__(self):
        return f"<CourseSection {self.id}: {self.title} (order: {self.order_index})>"


class CourseSubsection(Base):
    """Model for storing course subsections."""
    __tablename__ = "course_subsections"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    section_id = Column(Integer, ForeignKey("course_sections.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=True)
    order_index = Column(Integer, nullable=False, index=True)  # Order within the section (0, 1, 2, ...)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    section = relationship("CourseSection", back_populates="subsections")
    
    def __repr__(self):
        return f"<CourseSubsection {self.id}: {self.title} (order: {self.order_index})>"


class Lesson(Base):
    """Model for storing lesson content."""
    __tablename__ = "lessons"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    section_id = Column(Integer, ForeignKey("course_sections.id"), nullable=False, index=True, unique=True)  # One lesson per section
    content = Column(Text, nullable=False)  # Markdown/rich text lesson content
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    section = relationship("CourseSection", back_populates="lesson")
    
    def __repr__(self):
        return f"<Lesson {self.id} for section {self.section_id}>"


class CourseQuestion(Base):
    """Model for storing course Q&A."""
    __tablename__ = "course_questions"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    section_id = Column(Integer, ForeignKey("course_sections.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    course = relationship("Course", back_populates="questions")
    section = relationship("CourseSection", back_populates="questions")
    
    def __repr__(self):
        return f"<CourseQuestion {self.id} for course {self.course_id}>"


class ScraperSource(Base):
    """Model for storing web scraper source URLs (category pages)."""
    __tablename__ = "scraper_sources"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    url = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=True)  # Optional friendly name for the source
    is_active = Column(Boolean, default=True)  # Enable/disable scraping for this source
    last_scraped = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    articles = relationship("ScrapedArticle", back_populates="source", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<ScraperSource {self.id}: {self.url}>"


class ScrapedArticle(Base):
    """Model for storing scraped article content."""
    __tablename__ = "scraped_articles"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    source_id = Column(Integer, ForeignKey("scraper_sources.id"), nullable=False, index=True)
    url = Column(String, nullable=False, unique=True, index=True)
    title = Column(String, nullable=True)
    content = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    author = Column(String, nullable=True)
    published_date = Column(DateTime(timezone=True), nullable=True)
    image_path = Column(String, nullable=True)  # Local path to saved image
    image_url = Column(String, nullable=True)  # Original image URL
    article_metadata = Column(JSON, nullable=True)  # Store additional metadata
    scraped_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    source = relationship("ScraperSource", back_populates="articles")
    
    def __repr__(self):
        return f"<ScrapedArticle {self.id}: {self.title}>"

