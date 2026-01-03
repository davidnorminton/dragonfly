# Dragonfly Home Assistant

An always-listening home assistant with local AI processing, modular data collection, and WebSocket connectivity.

## Features

- **Core Processing Unit**: Accepts data via WebSockets and manages job execution
- **Services**: Modular service architecture for AI and RAG processing
- **Data Collection**: Extensible module system for collecting weather, traffic, news, and more
- **Database**: SQL database (SQLite by default, easily switchable to PostgreSQL)
- **Web GUI**: Real-time web interface for monitoring and control
- **Device Connectivity**: WebSocket-based communication with home devices

## Project Structure

```
dragonfly/
├── core/              # Core processing unit
│   ├── processor.py   # Main processor coordinator
│   ├── job_manager.py # Job queue and execution
│   └── websocket_server.py # WebSocket server
├── services/          # Service modules
│   ├── base_service.py
│   ├── ai_service.py  # General AI questions
│   └── rag_service.py # RAG for personal/device data
├── data_collectors/   # Modular data collectors
│   └── base_collector.py
├── database/          # Database models and setup
│   ├── base.py
│   └── models.py
├── web/              # Web GUI
│   └── main.py       # FastAPI application
├── config/           # Configuration
│   └── settings.py
└── main.py           # Application entry point
```

## Installation

1. **Clone the repository** (or navigate to the project directory)

2. **Create a virtual environment**:
```bash
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate  # On Windows
```

3. **Install dependencies**:
```bash
pip install -r requirements.txt
```

4. **Create a `.env` file** (optional, for custom configuration):
```env
HOST=0.0.0.0
PORT=1337
WEBSOCKET_PORT=8765
DATABASE_URL=sqlite+aiosqlite:///./dragonfly.db
LOG_LEVEL=INFO
```

## Usage

### Running the Application

**Option 1: Using the run script**
```bash
./run.sh
```

**Option 2: Manual activation**
```bash
source venv/bin/activate  # Activate virtual environment
python main.py
```

The application will start:
- **Web GUI**: http://localhost:8000
- **WebSocket Server**: ws://localhost:8765

### WebSocket API

Connect to `ws://localhost:8765` and send JSON messages:

#### Submit a Job
```json
{
  "type": "job",
  "service_name": "ai_service",
  "data": {
    "question": "What is the weather today?"
  }
}
```

#### Check Job Status
```json
{
  "type": "job_status",
  "job_id": "your-job-id"
}
```

#### Register a Device
```json
{
  "type": "device_register",
  "device_id": "device-001",
  "device_name": "Living Room Sensor",
  "device_type": "sensor",
  "metadata": {}
}
```

### HTTP API

#### Submit a Job
```bash
curl -X POST http://localhost:1337/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "service_name": "ai_service",
    "data": {"question": "Hello!"}
  }'
```

#### Get Job Status
```bash
curl http://localhost:1337/api/jobs/{job_id}
```

## Architecture

### Core Components

1. **Processor**: Main coordinator that manages all components
2. **Job Manager**: Handles job queue and asynchronous execution
3. **WebSocket Server**: Receives data and commands from clients
4. **Services**: Execute specific tasks (AI, RAG, etc.)
5. **Database**: Stores jobs, device connections, and collected data

### Service System

Services extend `BaseService` and implement the `execute()` method. They are registered with the processor and can be called via jobs.

### Data Collectors

Data collectors extend `BaseCollector` and implement the `collect()` method. They can be easily added to collect data from various sources.

## Development

### Adding a New Service

1. Create a new file in `services/`
2. Extend `BaseService`
3. Implement the `execute()` method
4. Register the service in `main.py`

Example:
```python
from services.base_service import BaseService

class MyService(BaseService):
    def __init__(self):
        super().__init__("my_service")
    
    async def execute(self, input_data):
        # Your logic here
        return {"result": "success"}
```

### Adding a Data Collector

1. Create a new file in `data_collectors/`
2. Extend `BaseCollector`
3. Implement `collect()` and `get_data_type()` methods

## Configuration

Configuration is managed through environment variables or a `.env` file. See `config/settings.py` for all available options.

## Database

The application uses SQLAlchemy with async support. By default, it uses SQLite, but can be configured to use PostgreSQL or other databases by changing the `DATABASE_URL` in settings.

## Platform Support

- ✅ macOS (tested on Darwin)
- ✅ Raspberry Pi (ARM64/ARMv7)
- ✅ Linux
- ✅ Windows (with adjustments)

## Roadmap

- [ ] Audio processing for always-listening functionality
- [ ] Local AI model integration (Whisper for speech, local LLM)
- [ ] RAG implementation with vector database
- [ ] Data collector implementations (weather, traffic, news)
- [ ] Device integration examples
- [ ] Authentication and security
- [ ] Docker support

## License

[Add your license here]

## Contributing

[Add contributing guidelines here]

