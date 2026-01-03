#!/usr/bin/env python3
"""Test script for WebSocket connection to Dragonfly."""
import asyncio
import json
import websockets
import sys


async def test_websocket():
    """Test connecting to the WebSocket server."""
    uri = "ws://localhost:8765"
    
    try:
        print(f"Connecting to {uri}...")
        async with websockets.connect(uri) as websocket:
            print("✓ Connected successfully!\n")
            
            # Test 1: Register a device
            print("Test 1: Registering a test device...")
            register_message = {
                "type": "device_register",
                "device_id": "test-device-001",
                "device_name": "Test Temperature Sensor",
                "device_type": "sensor",
                "metadata": {
                    "location": "living_room",
                    "version": "1.0"
                }
            }
            await websocket.send(json.dumps(register_message))
            response = await websocket.recv()
            print(f"Response: {json.loads(response)}\n")
            
            # Test 2: Submit a job
            print("Test 2: Submitting a job...")
            job_message = {
                "type": "job",
                "service_name": "ai_service",
                "data": {
                    "question": "What is the weather today?"
                }
            }
            await websocket.send(json.dumps(job_message))
            response = await websocket.recv()
            job_response = json.loads(response)
            print(f"Response: {job_response}\n")
            
            if job_response.get("type") == "job_submitted":
                job_id = job_response.get("job_id")
                
                # Test 3: Check job status
                print(f"Test 3: Checking job status for {job_id}...")
                status_message = {
                    "type": "job_status",
                    "job_id": job_id
                }
                await websocket.send(json.dumps(status_message))
                response = await websocket.recv()
                status_response = json.loads(response)
                print(f"Response: {status_response}\n")
            
            # Test 4: Send a data message
            print("Test 4: Sending a data message...")
            data_message = {
                "type": "data",
                "data": {
                    "sensor_reading": 23.5,
                    "unit": "celsius"
                }
            }
            await websocket.send(json.dumps(data_message))
            response = await websocket.recv()
            print(f"Response: {json.loads(response)}\n")
            
            print("All tests completed!")
            
    except websockets.exceptions.ConnectionRefused:
        print(f"✗ Connection refused. Is the server running on {uri}?")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(test_websocket())

