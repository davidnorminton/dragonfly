# Remote Connection Guide

You can connect to the Dragonfly WebSocket server from another machine on your network.

## Finding Your Server's IP Address

On the Mac running the Dragonfly server, find your IP address:

```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Or use this command for a cleaner output
ipconfig getifaddr en0  # For WiFi
ipconfig getifaddr en1  # For Ethernet
```

Or in System Settings:
- System Settings → Network → Your connection → Details → IP Address

## Using the Remote Client Script

### Option 1: Send a Single Message

On the remote machine, copy the `remote_client.py` script and run:

```bash
# Basic usage (sends example data)
python3 remote_client.py <SERVER_IP>

# With custom data
python3 remote_client.py <SERVER_IP> --json '{"temperature": 25.0, "humidity": 50}'

# With device ID
python3 remote_client.py <SERVER_IP> --device-id my-sensor-001 --json '{"temperature": 25.0}'
```

### Option 2: Interactive Mode

```bash
python3 remote_client.py <SERVER_IP> --interactive --device-id my-sensor-001
```

Then type JSON data and press Enter to send:
```
> {"temperature": 23.5, "humidity": 45}
> {"pressure": 1013.25}
> exit
```

## Using Python Directly (No Script Needed)

On the remote machine, install websockets:

```bash
pip3 install websockets
```

Then run:

```python
import asyncio
import json
import websockets

async def send_data():
    # Replace 192.168.1.100 with your server's IP
    uri = "ws://192.168.1.100:8765"
    
    async with websockets.connect(uri) as ws:
        # Send data
        await ws.send(json.dumps({
            "type": "telemetry",
            "device_id": "remote-sensor-001",
            "device_name": "Remote Sensor",
            "data": {
                "temperature": 23.5,
                "humidity": 45
            }
        }))
        
        response = await ws.recv()
        print(json.loads(response))

asyncio.run(send_data())
```

## Using curl with websocat

If you have `websocat` installed on the remote machine:

```bash
# Install websocat (if not installed)
# macOS: brew install websocat
# Linux: See https://github.com/vi/websocat

# Send data
echo '{"type":"telemetry","device_id":"remote-001","data":{"temperature":23.5}}' | \
  websocat ws://192.168.1.100:8765
```

## Using wscat (Node.js)

If you have Node.js installed:

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c ws://192.168.1.100:8765

# Then type JSON messages:
{"type":"telemetry","device_id":"remote-001","data":{"temperature":23.5}}
```

## Network Requirements

1. **Firewall**: Make sure the server's firewall allows incoming connections on port 8765
   - macOS: System Settings → Network → Firewall → Options → Add port 8765

2. **Same Network**: Both machines should be on the same network (or configure port forwarding for remote access)

3. **Server Binding**: The server should bind to `0.0.0.0` (which it does by default), not just `127.0.0.1`

## Example: Complete Remote Setup

**On Server Mac:**
```bash
# Find IP address
ipconfig getifaddr en0
# Output: 192.168.1.100

# Start server
cd /path/to/dragonfly
source venv/bin/activate
python main.py
```

**On Remote Mac:**
```bash
# Option 1: Use the remote client script
python3 remote_client.py 192.168.1.100 --interactive --device-id remote-sensor

# Option 2: Use Python directly
python3 -c "
import asyncio, json, websockets
async def send():
    async with websockets.connect('ws://192.168.1.100:8765') as ws:
        await ws.send(json.dumps({'type':'telemetry','device_id':'remote-001','data':{'temp':23.5}}))
        print(await ws.recv())
asyncio.run(send())
"
```

## Troubleshooting

**Connection Refused:**
- Check if server is running
- Verify IP address is correct
- Check firewall settings
- Ensure both machines are on the same network

**Connection Timeout:**
- Check network connectivity: `ping <SERVER_IP>`
- Verify port 8765 is open
- Check firewall rules

**SSL/TLS Errors:**
- The current server uses `ws://` (not `wss://`), so no SSL is required
- For production, consider using `wss://` with SSL certificates

