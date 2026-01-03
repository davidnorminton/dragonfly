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
    metadata = Column(JSON, nullable=True)
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

