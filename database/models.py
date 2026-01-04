"""Database models."""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Enum as SQLEnum
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
    
    id = Column(Integer, primary_key=True, index=True)
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
    
    id = Column(Integer, primary_key=True, index=True)
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
    
    id = Column(Integer, primary_key=True, index=True)
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
    
    id = Column(Integer, primary_key=True, index=True)
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


class DeviceTelemetry(Base):
    """Model for storing device telemetry data."""
    __tablename__ = "device_telemetry"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, nullable=False, index=True)
    metric_name = Column(String, nullable=False, index=True)
    value = Column(JSON, nullable=False)
    unit = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    def __repr__(self):
        return f"<DeviceTelemetry {self.device_id} - {self.metric_name}>"

