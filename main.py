"""Main entry point for Dragonfly Home Assistant."""
import asyncio
import logging
import sys
from config.settings import settings
from core.processor import Processor
from services.ai_service import AIService
from services.rag_service import RAGService
import uvicorn
from web.main import app

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        *([logging.FileHandler(settings.log_file)] if settings.log_file else [])
    ]
)

logger = logging.getLogger(__name__)


async def setup_processor():
    """Setup and configure the processor with services."""
    processor = Processor()
    
    # Register services
    ai_service = AIService()
    rag_service = RAGService()
    
    processor.register_service("ai_service", ai_service.execute)
    processor.register_service("rag_service", rag_service.execute)
    
    return processor


async def run_processor(processor: Processor):
    """Run the processor in the background."""
    await processor.start()
    try:
        # Keep running
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        await processor.stop()


async def main():
    """Main function."""
    logger.info("Starting Dragonfly Home Assistant...")
    
    # Setup processor
    processor = await setup_processor()
    
    # Set processor in web app (for API endpoints)
    import web.main
    web.main.processor = processor
    
    # Start processor in background
    processor_task = asyncio.create_task(run_processor(processor))
    
    # Start web server
    config = uvicorn.Config(
        app,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower()
    )
    server = uvicorn.Server(config)
    
    try:
        await server.serve()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        processor_task.cancel()
        await processor.stop()
        await processor_task


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Application terminated")

