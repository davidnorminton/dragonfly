#!/usr/bin/env python3
"""Test script for sending device data to Dragonfly."""
import asyncio
import json
import websockets
import sys
import time


async def test_device_data():
    """Test sending device data."""
    uri = "ws://localhost:8765"
    
    try:
        print(f"Connecting to {uri}...")
        async with websockets.connect(uri) as websocket:
            print("✓ Connected!\n")
            
            # Test 1: Register device first, then send data
            print("Test 1: Register device and send structured data...")
            await websocket.send(json.dumps({
                "type": "device_register",
                "device_id": "sensor-001",
                "device_name": "Temperature Sensor",
                "device_type": "sensor"
            }))
            response = await websocket.recv()
            print(f"Registration: {json.loads(response)}\n")
            
            # Send structured telemetry data
            await websocket.send(json.dumps({
                "type": "telemetry",
                "data": {
                    "temperature": {"value": 23.5, "unit": "celsius"},
                    "humidity": {"value": 45, "unit": "percent"},
                    "pressure": {"value": 1013.25, "unit": "hPa"}
                }
            }))
            response = await websocket.recv()
            print(f"Data response: {json.loads(response)}\n")
            
            # Test 2: Send data without registering (with device_id in message)
            print("Test 2: Send data without prior registration...")
            await websocket.send(json.dumps({
                "type": "telemetry",
                "device_id": "sensor-002",
                "device_name": "Motion Sensor",
                "device_type": "sensor",
                "data": {
                    "motion_detected": True,
                    "battery_level": 85
                }
            }))
            response = await websocket.recv()
            print(f"Data response: {json.loads(response)}\n")
            
            # Test 3: Send raw JSON data (no type field)
            print("Test 3: Send raw JSON data (simple format)...")
            await websocket.send(json.dumps({
                "device_id": "sensor-003",
                "temperature": 25.0,
                "humidity": 50,
                "status": "active"
            }))
            response = await websocket.recv()
            print(f"Data response: {json.loads(response)}\n")
            
            # Test 4: Send multiple readings
            print("Test 4: Send multiple temperature readings...")
            for i in range(3):
                await websocket.send(json.dumps({
                    "type": "telemetry",
                    "device_id": "sensor-001",
                    "data": {
                        "temperature": 23.5 + i * 0.5,
                        "timestamp": time.time()
                    }
                }))
                response = await websocket.recv()
                print(f"Reading {i+1}: {json.loads(response)}")
            
            print("\n✓ All tests completed!")
            
    except websockets.exceptions.ConnectionRefused:
        print(f"✗ Connection refused. Is the server running on {uri}?")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(test_device_data())

