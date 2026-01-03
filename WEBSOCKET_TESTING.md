# WebSocket Testing Guide

There are several ways to test the WebSocket connection to Dragonfly:

## Option 1: Python Test Script (Recommended)

Run the test script:

```bash
source venv/bin/activate
python test_websocket.py
```

This will:
- Connect to the WebSocket server
- Register a test device
- Submit a job
- Check job status
- Send a data message

## Option 2: Browser-Based Tester

1. Open `test_websocket_simple.html` in your browser
2. Click "Connect" to connect to the WebSocket server
3. Use the buttons to test different operations:
   - **Register Device**: Register a test device
   - **Submit Job**: Submit an AI service job
   - **Check Status**: Check the status of a job (enter Job ID first)
4. All messages and responses will be displayed in the output area

## Option 3: Command Line with Python Interactive

```python
import asyncio
import json
import websockets

async def test():
    async with websockets.connect("ws://localhost:8765") as ws:
        # Register device
        await ws.send(json.dumps({
            "type": "device_register",
            "device_id": "test-001",
            "device_name": "Test Device",
            "device_type": "sensor"
        }))
        print(await ws.recv())
        
        # Submit job
        await ws.send(json.dumps({
            "type": "job",
            "service_name": "ai_service",
            "data": {"question": "Hello!"}
        }))
        print(await ws.recv())

asyncio.run(test())
```

## Option 4: Using websocat (if installed)

```bash
# Install websocat: brew install websocat
echo '{"type":"device_register","device_id":"test-001","device_name":"Test"}' | websocat ws://localhost:8765
```

## WebSocket Message Types

### Device Registration
```json
{
  "type": "device_register",
  "device_id": "device-001",
  "device_name": "My Device",
  "device_type": "sensor",
  "metadata": {}
}
```

### Submit Job
```json
{
  "type": "job",
  "service_name": "ai_service",
  "data": {
    "question": "Your question here"
  }
}
```

### Check Job Status
```json
{
  "type": "job_status",
  "job_id": "job-uuid-here"
}
```

### Send Data
```json
{
  "type": "data",
  "data": {
    "sensor_reading": 23.5
  }
}
```

## Expected Responses

- **device_register**: `{"type": "device_registered", "device_id": "..."}`
- **job**: `{"type": "job_submitted", "job_id": "...", "service_name": "..."}`
- **job_status**: `{"type": "job_status", "job_id": "...", "status": {...}}`
- **data**: `{"type": "data_received", "message": "Data received successfully"}`
- **error**: `{"type": "error", "message": "Error description"}`

