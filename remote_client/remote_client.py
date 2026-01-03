#!/usr/bin/env python3
"""
Remote WebSocket client for Dragonfly Home Assistant.
Run this on another machine to connect to the Dragonfly server.
"""
import asyncio
import json
import websockets
import sys
import argparse


async def connect_and_send(host: str, port: int, device_id: str, data: dict):
    """Connect to remote Dragonfly server and send data."""
    uri = f"ws://{host}:{port}"
    
    try:
        print(f"Connecting to {uri}...")
        async with websockets.connect(uri) as websocket:
            print("✓ Connected!\n")
            
            # Register device (optional if device_id is in data)
            if device_id:
                print(f"Registering device: {device_id}")
                await websocket.send(json.dumps({
                    "type": "device_register",
                    "device_id": device_id,
                    "device_name": device_id,
                    "device_type": "remote_device"
                }))
                response = await websocket.recv()
                print(f"Registration: {json.loads(response)}\n")
            
            # Send data
            print("Sending data...")
            message = {
                "type": "telemetry",
                "data": data
            }
            if device_id:
                message["device_id"] = device_id
            
            await websocket.send(json.dumps(message))
            response = await websocket.recv()
            result = json.loads(response)
            print(f"Response: {result}\n")
            
            if result.get("type") == "data_received":
                print(f"✓ Successfully sent data! Stored {result.get('metrics_stored', 0)} metric(s)")
            else:
                print(f"✗ Error: {result}")
            
    except websockets.exceptions.ConnectionRefused:
        print(f"✗ Connection refused. Is the server running on {host}:{port}?")
        print(f"  Make sure:")
        print(f"  1. The Dragonfly server is running")
        print(f"  2. The host IP address is correct")
        print(f"  3. Firewall allows connections on port {port}")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)


async def interactive_mode(host: str, port: int, device_id: str):
    """Interactive mode for sending multiple messages."""
    uri = f"ws://{host}:{port}"
    
    try:
        print(f"Connecting to {uri}...")
        async with websockets.connect(uri) as websocket:
            print("✓ Connected! (Type 'exit' to quit)\n")
            
            # Register device
            if device_id:
                await websocket.send(json.dumps({
                    "type": "device_register",
                    "device_id": device_id,
                    "device_name": device_id,
                    "device_type": "remote_device"
                }))
                await websocket.recv()
            
            # Interactive loop
            while True:
                try:
                    print("\nEnter JSON data to send (or 'exit' to quit):")
                    user_input = input("> ").strip()
                    
                    if user_input.lower() in ('exit', 'quit', 'q'):
                        break
                    
                    if not user_input:
                        continue
                    
                    # Parse JSON
                    try:
                        data = json.loads(user_input)
                    except json.JSONDecodeError:
                        print("✗ Invalid JSON. Please try again.")
                        continue
                    
                    # Send data
                    message = {
                        "type": "telemetry",
                        "data": data
                    }
                    if device_id:
                        message["device_id"] = device_id
                    
                    await websocket.send(json.dumps(message))
                    response = await websocket.recv()
                    result = json.loads(response)
                    print(f"Response: {result}")
                    
                except KeyboardInterrupt:
                    break
                except Exception as e:
                    print(f"✗ Error: {e}")
            
            print("\nDisconnected.")
            
    except websockets.exceptions.ConnectionRefused:
        print(f"✗ Connection refused. Is the server running on {host}:{port}?")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Remote WebSocket client for Dragonfly")
    parser.add_argument("host", help="Server IP address or hostname")
    parser.add_argument("-p", "--port", type=int, default=8765, help="WebSocket port (default: 8765)")
    parser.add_argument("-d", "--device-id", help="Device ID (optional)")
    parser.add_argument("-i", "--interactive", action="store_true", help="Interactive mode")
    parser.add_argument("-j", "--json", help="JSON data to send (as string)")
    
    args = parser.parse_args()
    
    if args.interactive:
        device_id = args.device_id or f"remote-{asyncio.get_event_loop().time()}"
        asyncio.run(interactive_mode(args.host, args.port, device_id))
    else:
        if args.json:
            try:
                data = json.loads(args.json)
            except json.JSONDecodeError:
                print("✗ Invalid JSON in --json argument")
                sys.exit(1)
        else:
            # Example data
            data = {
                "temperature": 23.5,
                "humidity": 45,
                "status": "online"
            }
            print("No data provided. Using example data:")
            print(json.dumps(data, indent=2))
            print()
        
        device_id = args.device_id or f"remote-{int(asyncio.get_event_loop().time())}"
        asyncio.run(connect_and_send(args.host, args.port, device_id, data))


if __name__ == "__main__":
    main()

