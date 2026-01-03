"""Job manager for handling asynchronous job execution."""
import asyncio
import uuid
import logging
from datetime import datetime
from typing import Dict, Optional, Callable, Any
from enum import Enum
from database.models import JobStatus, Job
from database.base import AsyncSessionLocal
from sqlalchemy import select

logger = logging.getLogger(__name__)


class JobManager:
    """Manages job queue and execution."""
    
    def __init__(self, max_concurrent_jobs: int = 10):
        self.max_concurrent_jobs = max_concurrent_jobs
        self.job_queue: asyncio.Queue = asyncio.Queue()
        self.active_jobs: Dict[str, asyncio.Task] = {}
        self.job_handlers: Dict[str, Callable] = {}
        self._running = False
        self._worker_tasks: list[asyncio.Task] = []
        
    def register_handler(self, service_name: str, handler: Callable):
        """Register a handler function for a service."""
        self.job_handlers[service_name] = handler
        logger.info(f"Registered handler for service: {service_name}")
    
    async def submit_job(
        self,
        service_name: str,
        input_data: Optional[Dict[str, Any]] = None,
        job_id: Optional[str] = None
    ) -> str:
        """
        Submit a job to the queue.
        
        Args:
            service_name: Name of the service to execute
            input_data: Input data for the job
            job_id: Optional custom job ID
            
        Returns:
            Job ID
        """
        if job_id is None:
            job_id = str(uuid.uuid4())
        
        # Create job record in database
        async with AsyncSessionLocal() as session:
            job = Job(
                job_id=job_id,
                service_name=service_name,
                status=JobStatus.PENDING,
                input_data=input_data or {}
            )
            session.add(job)
            await session.commit()
        
        # Add to queue
        await self.job_queue.put({
            "job_id": job_id,
            "service_name": service_name,
            "input_data": input_data or {}
        })
        
        logger.info(f"Job submitted: {job_id} - {service_name}")
        return job_id
    
    async def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status from database."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Job).where(Job.job_id == job_id)
            )
            job = result.scalar_one_or_none()
            
            if job:
                return {
                    "job_id": job.job_id,
                    "service_name": job.service_name,
                    "status": job.status.value,
                    "input_data": job.input_data,
                    "output_data": job.output_data,
                    "error_message": job.error_message,
                    "created_at": job.created_at.isoformat() if job.created_at else None,
                    "started_at": job.started_at.isoformat() if job.started_at else None,
                    "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                }
        return None
    
    async def _execute_job(self, job_data: Dict[str, Any]):
        """Execute a single job."""
        job_id = job_data["job_id"]
        service_name = job_data["service_name"]
        input_data = job_data["input_data"]
        
        logger.info(f"Starting job execution: {job_id} - {service_name}")
        
        # Update job status to running
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Job).where(Job.job_id == job_id)
            )
            job = result.scalar_one_or_none()
            if job:
                job.status = JobStatus.RUNNING
                job.started_at = datetime.utcnow()
                await session.commit()
        
        # Execute handler
        try:
            handler = self.job_handlers.get(service_name)
            if handler is None:
                raise ValueError(f"No handler registered for service: {service_name}")
            
            # Call the handler (should be async)
            if asyncio.iscoroutinefunction(handler):
                output_data = await handler(input_data)
            else:
                output_data = handler(input_data)
            
            # Update job status to completed
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Job).where(Job.job_id == job_id)
                )
                job = result.scalar_one_or_none()
                if job:
                    job.status = JobStatus.COMPLETED
                    job.output_data = output_data
                    job.completed_at = datetime.utcnow()
                    await session.commit()
            
            logger.info(f"Job completed: {job_id} - {service_name}")
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Job failed: {job_id} - {service_name} - {error_msg}", exc_info=True)
            
            # Update job status to failed
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Job).where(Job.job_id == job_id)
                )
                job = result.scalar_one_or_none()
                if job:
                    job.status = JobStatus.FAILED
                    job.error_message = error_msg
                    job.completed_at = datetime.utcnow()
                    await session.commit()
        
        finally:
            # Remove from active jobs
            if job_id in self.active_jobs:
                del self.active_jobs[job_id]
    
    async def _worker(self, worker_id: int):
        """Worker coroutine that processes jobs from the queue."""
        logger.info(f"Worker {worker_id} started")
        while self._running:
            try:
                # Get job from queue with timeout
                job_data = await asyncio.wait_for(
                    self.job_queue.get(),
                    timeout=1.0
                )
                
                # Check if we can run more jobs
                if len(self.active_jobs) >= self.max_concurrent_jobs:
                    # Put job back and wait
                    await self.job_queue.put(job_data)
                    await asyncio.sleep(0.1)
                    continue
                
                # Create task for job execution
                task = asyncio.create_task(self._execute_job(job_data))
                self.active_jobs[job_data["job_id"]] = task
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Worker {worker_id} error: {e}", exc_info=True)
        
        logger.info(f"Worker {worker_id} stopped")
    
    async def start(self):
        """Start the job manager."""
        if self._running:
            logger.warning("Job manager is already running")
            return
        
        self._running = True
        # Start worker tasks
        num_workers = min(self.max_concurrent_jobs, 5)  # Limit to 5 workers
        self._worker_tasks = [
            asyncio.create_task(self._worker(i))
            for i in range(num_workers)
        ]
        logger.info(f"Job manager started with {num_workers} workers")
    
    async def stop(self):
        """Stop the job manager."""
        if not self._running:
            return
        
        self._running = False
        
        # Wait for all workers to finish
        if self._worker_tasks:
            await asyncio.gather(*self._worker_tasks, return_exceptions=True)
        
        # Cancel active jobs
        for job_id, task in self.active_jobs.items():
            if not task.done():
                task.cancel()
                logger.info(f"Cancelled job: {job_id}")
        
        logger.info("Job manager stopped")

