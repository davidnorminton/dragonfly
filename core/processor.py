"""Main processing unit that coordinates all components."""
import asyncio
import logging
from typing import Optional
from core.job_manager import JobManager
from core.websocket_server import WebSocketServer
from config.settings import settings
from database.base import init_db

logger = logging.getLogger(__name__)


class Processor:
    """Main processing unit for the home assistant."""
    
    def __init__(self):
        self.job_manager = JobManager(max_concurrent_jobs=settings.max_concurrent_jobs)
        self.websocket_server = WebSocketServer(
            host=settings.host,
            port=settings.websocket_port,
            job_manager=self.job_manager
        )
        self._running = False
    
    def register_service(self, service_name: str, handler):
        """Register a service handler with the job manager."""
        self.job_manager.register_handler(service_name, handler)
        logger.info(f"Service registered: {service_name}")
    
    async def start(self):
        """Start the processor."""
        if self._running:
            logger.warning("Processor is already running")
            return
        
        logger.info("Starting Dragonfly processor...")
        
        # Initialize database
        await init_db()
        logger.info("Database initialized")
        
        # Start job manager
        await self.job_manager.start()
        logger.info("Job manager started")
        
        # Start WebSocket server
        await self.websocket_server.start()
        logger.info("WebSocket server started")
        
        self._running = True
        logger.info("Dragonfly processor is running")
    
    async def stop(self):
        """Stop the processor."""
        if not self._running:
            return
        
        logger.info("Stopping Dragonfly processor...")
        
        # Stop WebSocket server
        await self.websocket_server.stop()
        
        # Stop job manager
        await self.job_manager.stop()
        
        self._running = False
        logger.info("Dragonfly processor stopped")
    
    async def run(self):
        """Run the processor (blocking)."""
        await self.start()
        try:
            # Keep running until interrupted
            while self._running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            logger.info("Received interrupt signal")
        finally:
            await self.stop()

