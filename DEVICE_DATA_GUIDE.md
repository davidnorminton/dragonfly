# Device Data Sending Guide

Devices can send data to the Dragonfly Home Assistant in several simple ways via WebSocket.

## Connection

Connect to: `ws://localhost:8765`

## Method 1: Register First, Then Send Data (Recommended)

1. **Register the device:**
```json
{
  "type": "device_register",
  "device_id": "sensor-001",
  "device_name": "Temperature Sensor",
  "device_type": "sensor",
  "metadata": {
    "location": "living_room"
  }
}
```

2. **Send telemetry data:**
```json
{
  "type": "telemetry",
  "data": {
    "temperature": {"value": 23.5, "unit": "celsius"},
    "humidity": {"value": 45, "unit": "percent"}
  }
}
```

## Method 2: Send Data with Device ID (Auto-registration)

Send data directly with device information - the device will be auto-registered:

```json
{
  "type": "telemetry",
  "device_id": "sensor-001",
  "device_name": "Temperature Sensor",
  "device_type": "sensor",
  "data": {
    "temperature": 23.5,
    "humidity": 45
  }
}
```

## Method 3: Simple JSON Format (No Type Field)

Send simple JSON - all top-level keys (except reserved fields) become metrics:

```json
{
  "device_id": "sensor-001",
  "temperature": 23.5,
  "humidity": 45,
  "status": "active"
}
```

Reserved fields (ignored as metrics): `device_id`, `device_name`, `device_type`, `metadata`, `type`, `timestamp`

## Data Formats

### Structured Format (with units)
```json
{
  "type": "telemetry",
  "data": {
    "temperature": {"value": 23.5, "unit": "celsius"},
    "pressure": {"value": 1013.25, "unit": "hPa"}
  }
}
```

### Simple Format (values only)
```json
{
  "type": "telemetry",
  "data": {
    "temperature": 23.5,
    "motion_detected": true,
    "battery_level": 85
  }
}
```

## Response Format

All data submissions receive a confirmation:

```json
{
  "type": "data_received",
  "device_id": "sensor-001",
  "metrics_stored": 2,
  "message": "Successfully stored 2 metric(s)"
}
```

## Examples

### Python Example

```python
import asyncio
import json
import websockets

async def send_data():
    async with websockets.connect("ws://localhost:8765") as ws:
        # Register device
        await ws.send(json.dumps({
            "type": "device_register",
            "device_id": "my-sensor",
            "device_name": "My Sensor",
            "device_type": "sensor"
        }))
        print(await ws.recv())
        
        # Send data
        await ws.send(json.dumps({
            "type": "telemetry",
            "data": {
                "temperature": 23.5,
                "humidity": 45
            }
        }))
        print(await ws.recv())

asyncio.run(send_data())
```

### JavaScript/Node.js Example

```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8765');

ws.on('open', () => {
  // Register device
  ws.send(JSON.stringify({
    type: 'device_register',
    device_id: 'my-sensor',
    device_name: 'My Sensor',
    device_type: 'sensor'
  }));
  
  // Send data
  ws.on('message', (data) => {
    console.log('Response:', JSON.parse(data));
    
    ws.send(JSON.stringify({
      type: 'telemetry',
      data: {
        temperature: 23.5,
        humidity: 45
      }
    }));
  });
});
```

### Arduino/ESP32 Example (Pseudo-code)

```cpp
#include <WebSocketsClient.h>

WebSocketsClient webSocket;

void sendTelemetry() {
  String json = "{";
  json += "\"type\":\"telemetry\",";
  json += "\"device_id\":\"esp32-001\",";
  json += "\"data\":{";
  json += "\"temperature\":" + String(temp) + ",";
  json += "\"humidity\":" + String(humidity);
  json += "}";
  json += "}";
  
  webSocket.sendTXT(json);
}
```

## Testing

Run the test script:

```bash
source venv/bin/activate
python test_device_data.py
```

This will test all three methods of sending data.

## Notes

- Data is stored in the `device_telemetry` table
- Each metric becomes a separate row in the database
- Timestamps are automatically added
- The frontend at http://localhost:1337 displays all telemetry data
- Devices remain connected and can send multiple data packets
- Data is queryable via the REST API at `/api/telemetry/latest`


