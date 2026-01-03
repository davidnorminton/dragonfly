"""WebSocket server for receiving data and commands."""
import asyncio
import json
import logging
from typing import Dict, Set, Optional, Any
from datetime import datetime
import websockets
from websockets.server import WebSocketServerProtocol
from core.job_manager import JobManager
from database.base import AsyncSessionLocal
from database.models import DeviceConnection
from sqlalchemy import select

logger = logging.getLogger(__name__)


class WebSocketServer:
    """WebSocket server for handling client connections."""
    
    def __init__(self, host: str, port: int, job_manager: JobManager):
        self.host = host
        self.port = port
        self.job_manager = job_manager
        self.connected_clients: Set[WebSocketServerProtocol] = set()
        self.device_sessions: Dict[str, WebSocketServerProtocol] = {}  # device_id -> websocket
        self.server = None
        
    async def register_client(self, websocket: WebSocketServerProtocol, device_id: Optional[str] = None):
        """Register a new client connection."""
        self.connected_clients.add(websocket)
        
        if device_id:
            self.device_sessions[device_id] = websocket
            # Update device connection in database
            await self._update_device_connection(device_id, is_connected=True)
            logger.info(f"Device connected: {device_id}")
        else:
            logger.info(f"Client connected (no device ID): {websocket.remote_address}")
    
    async def unregister_client(self, websocket: WebSocketServerProtocol, device_id: Optional[str] = None):
        """Unregister a client connection."""
        self.connected_clients.discard(websocket)
        
        if device_id and device_id in self.device_sessions:
            del self.device_sessions[device_id]
            await self._update_device_connection(device_id, is_connected=False)
            logger.info(f"Device disconnected: {device_id}")
        else:
            logger.info(f"Client disconnected: {websocket.remote_address}")
    
    async def _update_device_connection(self, device_id: str, is_connected: bool):
        """Update device connection status in database."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(DeviceConnection).where(DeviceConnection.device_id == device_id)
            )
            device = result.scalar_one_or_none()
            
            if device:
                device.is_connected = "true" if is_connected else "false"
                device.last_seen = datetime.utcnow()
            else:
                # Create new device entry
                device = DeviceConnection(
                    device_id=device_id,
                    device_name=device_id,  # Default name, can be updated later
                    is_connected="true" if is_connected else "false"
                )
                session.add(device)
            
            await session.commit()
    
    async def handle_message(self, websocket: WebSocketServerProtocol, message: Dict[str, Any]):
        """Handle incoming WebSocket message."""
        message_type = message.get("type")
        
        try:
            if message_type == "job":
                # Submit a job
                service_name = message.get("service_name")
                input_data = message.get("data", {})
                job_id = message.get("job_id")
                
                if not service_name:
                    await self.send_error(websocket, "Missing service_name in job message")
                    return
                
                job_id = await self.job_manager.submit_job(
                    service_name=service_name,
                    input_data=input_data,
                    job_id=job_id
                )
                
                await self.send_response(websocket, {
                    "type": "job_submitted",
                    "job_id": job_id,
                    "service_name": service_name
                })
                
            elif message_type == "job_status":
                # Check job status
                job_id = message.get("job_id")
                if not job_id:
                    await self.send_error(websocket, "Missing job_id in job_status message")
                    return
                
                status = await self.job_manager.get_job_status(job_id)
                await self.send_response(websocket, {
                    "type": "job_status",
                    "job_id": job_id,
                    "status": status
                })
                
            elif message_type == "device_register":
                # Register device
                device_id = message.get("device_id")
                device_name = message.get("device_name", device_id)
                device_type = message.get("device_type")
                metadata = message.get("metadata", {})
                
                if not device_id:
                    await self.send_error(websocket, "Missing device_id in device_register message")
                    return
                
                await self.register_client(websocket, device_id)
                await self._update_device_info(device_id, device_name, device_type, metadata)
                
                await self.send_response(websocket, {
                    "type": "device_registered",
                    "device_id": device_id
                })
                
            elif message_type == "data":
                # Raw data message (for future use)
                data = message.get("data", {})
                await self.send_response(websocket, {
                    "type": "data_received",
                    "message": "Data received successfully"
                })
                
            else:
                await self.send_error(websocket, f"Unknown message type: {message_type}")
                
        except Exception as e:
            logger.error(f"Error handling message: {e}", exc_info=True)
            await self.send_error(websocket, f"Error processing message: {str(e)}")
    
    async def _update_device_info(self, device_id: str, device_name: str, 
                                   device_type: Optional[str], metadata: Dict):
        """Update device information in database."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(DeviceConnection).where(DeviceConnection.device_id == device_id)
            )
            device = result.scalar_one_or_none()
            
            if device:
                device.device_name = device_name
                device.device_type = device_type
                device.metadata = metadata
                device.last_seen = datetime.utcnow()
            else:
                device = DeviceConnection(
                    device_id=device_id,
                    device_name=device_name,
                    device_type=device_type,
                    metadata=metadata,
                    is_connected="true"
                )
                session.add(device)
            
            await session.commit()
    
    async def send_response(self, websocket: WebSocketServerProtocol, data: Dict[str, Any]):
        """Send a response message to a client."""
        try:
            await websocket.send(json.dumps(data))
        except Exception as e:
            logger.error(f"Error sending response: {e}", exc_info=True)
    
    async def send_error(self, websocket: WebSocketServerProtocol, error_message: str):
        """Send an error message to a client."""
        await self.send_response(websocket, {
            "type": "error",
            "message": error_message
        })
    
    async def broadcast(self, message: Dict[str, Any], exclude: Optional[WebSocketServerProtocol] = None):
        """Broadcast a message to all connected clients."""
        disconnected = set()
        message_str = json.dumps(message)
        
        for client in self.connected_clients:
            if client == exclude:
                continue
            try:
                await client.send(message_str)
            except Exception:
                disconnected.add(client)
        
        # Remove disconnected clients
        for client in disconnected:
            await self.unregister_client(client)
    
    async def client_handler(self, websocket: WebSocketServerProtocol, path: str):
        """Handle a client connection."""
        await self.register_client(websocket)
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_message(websocket, data)
                except json.JSONDecodeError:
                    await self.send_error(websocket, "Invalid JSON format")
                except Exception as e:
                    logger.error(f"Error processing message: {e}", exc_info=True)
                    await self.send_error(websocket, f"Error: {str(e)}")
        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            logger.error(f"Client handler error: {e}", exc_info=True)
        finally:
            await self.unregister_client(websocket)
    
    async def start(self):
        """Start the WebSocket server."""
        self.server = await websockets.serve(
            self.client_handler,
            self.host,
            self.port,
            ping_interval=20,
            ping_timeout=10
        )
        logger.info(f"WebSocket server started on ws://{self.host}:{self.port}")
    
    async def stop(self):
        """Stop the WebSocket server."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("WebSocket server stopped")

