# Dragonfly Home Assistant

An always-listening home assistant with local AI processing, modular data collection, and WebSocket connectivity.

## Features

- **Core Processing Unit**: Accepts data via WebSockets and manages job execution
- **Services**: Modular service architecture for AI and RAG processing
- **Data Collection**: Extensible module system for collecting weather, traffic, news, and more
- **Database**: SQL database (SQLite by default, easily switchable to PostgreSQL)
- **Web GUI**: Real-time web interface for monitoring and control
- **Device Connectivity**: WebSocket-based communication with home devices
- **AI Chat**: Interactive chat interface with multiple personas and conversational modes
- **Text-to-Speech**: Audio generation for AI responses using Fish Audio

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
│   ├── rag_service.py # RAG for personal/device data
│   ├── tts_service.py # Text-to-speech service
│   └── article_summarizer.py # News article summarization
├── data_collectors/   # Modular data collectors
│   ├── base_collector.py
│   ├── weather_collector.py
│   ├── news_collector.py
│   └── traffic_collector.py
├── database/          # Database models and setup
│   ├── base.py
│   └── models.py
├── web/              # Web GUI (FastAPI backend)
│   ├── main.py       # FastAPI application
│   └── static/       # Frontend build output
├── frontend/         # React frontend
│   ├── src/          # React source code
│   └── package.json  # Frontend dependencies
├── config/           # Configuration
│   ├── settings.py
│   ├── personas/     # AI persona configurations
│   ├── api_keys.json # API keys (not in git)
│   └── location.json # Location configuration
├── data/             # Application data
│   ├── audio/        # Generated audio files
│   └── transcripts/  # Chat transcripts
├── tests/            # Test suite
│   ├── unit/         # Unit tests
│   └── integration/  # Integration tests
└── main.py           # Application entry point
```

## Installation

### Raspberry Pi (ARM) Quick Start with PostgreSQL

#### 1) System prep (Pi OS / Debian)
- Update packages:
```bash
sudo apt update && sudo apt upgrade -y
```
- Install build essentials and Python tooling:
```bash
sudo apt install -y python3 python3-venv python3-pip git curl build-essential libasound2-dev unzip
```
- Install Node.js (for frontend build):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```
- Install PostgreSQL:
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```
- Install ffmpeg (for audio conversion to Vosk):
```bash
sudo apt install -y ffmpeg
```

#### 2) Database setup (Postgres)
```bash
sudo -u postgres psql -c "CREATE ROLE dragonfly WITH LOGIN PASSWORD 'dragonfly';"
sudo -u postgres psql -c "CREATE DATABASE dragonfly OWNER dragonfly;"
```
Connection string (use in `.env`):  
`DATABASE_URL=postgresql+asyncpg://dragonfly:dragonfly@localhost:5432/dragonfly`

#### 3) Project setup
```bash
git clone https://github.com/davidnorminton/dragonfly.git
cd dragonfly
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

#### 4) Configure environment
Create `.env` in project root (minimum):
```env
HOST=0.0.0.0
PORT=1337
WEBSOCKET_PORT=8765
DATABASE_URL=postgresql+asyncpg://dragonfly:dragonfly@localhost:5432/dragonfly
LOG_LEVEL=INFO
```
Add API keys in `config/api_keys.json` (copy from `config/api_keys.json.example`).

Minimal `.env` example (copy/paste):
```env
HOST=0.0.0.0
PORT=1337
WEBSOCKET_PORT=8765
DATABASE_URL=postgresql+asyncpg://dragonfly:dragonfly@localhost:5432/dragonfly
LOG_LEVEL=INFO
```

ARM build tips (Pi):
- If `asyncpg` build fails, ensure: `sudo apt install -y build-essential python3-dev libpq-dev` then rerun `pip install -r requirements.txt`.
- If Node installs slow, use official NodeSource repo (already shown) or install the `nodejs` package from Debian backports if on older Pi OS.

#### 5) Frontend build (on the Pi)
```bash
cd frontend
npm install
npm run build
cd ..
```

#### 6) Run the server
```bash
source venv/bin/activate
python main.py
```
Access:
- Web GUI: `http://<pi-ip>:1337`
- WebSocket: `ws://<pi-ip>:8765`

#### 7) Offline transcription (Vosk) on Pi
- A Vosk model is required. The install script downloads `vosk-model-en-us-0.22` to `models/vosk/`.
- If you need to download manually:
```bash
mkdir -p models/vosk
cd models/vosk
wget https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip
unzip vosk-model-en-us-0.22.zip
```
- Ensure ffmpeg is installed (`sudo apt install -y ffmpeg`).
- The backend uses the model at `models/vosk/vosk-model-en-us-0.22` for local transcription.

#### 7) Optional: system service
Create `/etc/systemd/system/dragonfly.service` (edit paths as needed):
```
[Unit]
Description=Dragonfly Home Assistant
After=network.target postgresql.service

[Service]
WorkingDirectory=/home/pi/dragonfly
ExecStart=/home/pi/dragonfly/venv/bin/python /home/pi/dragonfly/main.py
Environment=DATABASE_URL=postgresql+asyncpg://dragonfly:dragonfly@localhost:5432/dragonfly
Environment=HOST=0.0.0.0
Environment=PORT=1337
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable dragonfly
sudo systemctl start dragonfly
```

#### 8) Troubleshooting on Pi
- If `asyncpg` fails to build, ensure `build-essential` is installed and rerun `pip install -r requirements.txt`.
- If port 1337 is in use, set `PORT` in `.env`.
- If frontend is slow to build, consider `npm ci --omit=dev` after an initial build.

### Prerequisites

- Python 3.9 or higher
- Node.js 16 or higher (for frontend)
- npm or yarn (for frontend dependencies)

### Backend Setup

1. **Clone the repository** (or navigate to the project directory)

2. **Create a virtual environment**:
```bash
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate  # On Windows
```

3. **Install Python dependencies**:
```bash
pip install -r requirements.txt
```

4. **Set up configuration files**:
   - Copy `config/api_keys.json.example` to `config/api_keys.json` and add your API keys
   - Configure location in `config/location.json` (created on first run if not exists)
   - Persona configurations are in `config/personas/` (default, cortana, rick_sanchez, etc.)

5. **Create a `.env` file** (optional, for custom configuration):
```env
HOST=0.0.0.0
PORT=1337
WEBSOCKET_PORT=8765
DATABASE_URL=postgresql+asyncpg://dragonfly:dragonfly@localhost:5432/dragonfly
LOG_LEVEL=INFO
```

### Frontend Setup

1. **Navigate to the frontend directory**:
```bash
cd frontend
```

2. **Install frontend dependencies**:
```bash
npm install
```

3. **Build the frontend** (required before running the server):
```bash
npm run build
```

4. **Return to the project root**:
```bash
cd ..
```

## Running the System

### Starting the Server

**Option 1: Using the run script** (if available)
```bash
./run.sh
```

**Option 2: Manual activation**
```bash
source venv/bin/activate  # Activate virtual environment (if not already active)
python main.py
```

The application will start:
- **Web GUI**: http://localhost:1337
- **WebSocket Server**: ws://localhost:8765

### Development Mode (Frontend)

For frontend development with hot-reload:

1. **In one terminal**, start the backend:
```bash
source venv/bin/activate
python main.py
```

2. **In another terminal**, start the frontend dev server:
```bash
cd frontend
npm run dev
```

The frontend dev server will typically run on a different port (e.g., http://localhost:5173). Update API calls to point to the backend server (http://localhost:1337).

## Testing

### Running Tests

The project uses `pytest` for testing. Tests are organized into unit tests and integration tests.

**Run all tests**:
```bash
source venv/bin/activate  # Ensure virtual environment is active
pytest
```

**Run only unit tests**:
```bash
pytest tests/unit/
```

**Run only integration tests**:
```bash
pytest tests/integration/
```

**Run a specific test file**:
```bash
pytest tests/unit/test_ai_service.py
```

**Run with verbose output**:
```bash
pytest -v
```

**Run with coverage report**:
```bash
pytest --cov=services --cov=data_collectors --cov=web --cov=config --cov-report=html
```

Coverage reports will be generated in:
- Terminal output (summary)
- `htmlcov/index.html` (detailed HTML report)
- `coverage.xml` (XML format)

**View HTML coverage report**:
```bash
open htmlcov/index.html  # macOS
# or
xdg-open htmlcov/index.html  # Linux
# or
start htmlcov/index.html  # Windows
```

### Test Configuration

Test configuration is in `pytest.ini`. The test suite includes:
- Unit tests for services, data collectors, and config loaders
- Integration tests for API endpoints and WebSocket connections
- Fixtures for test database and mock configurations (see `tests/conftest.py`)

## Clearing Cache and Data

### Database Cache

The application caches collected data (weather, traffic, news) in the database's `collected_data` table. To clear cached data:

**Option 1: Delete specific cached data via Python**:
```bash
python3 -c "
from database.base import AsyncSessionLocal
from database.models import CollectedData
from sqlalchemy import delete
import asyncio

async def clear_cache():
    async with AsyncSessionLocal() as session:
        await session.execute(delete(CollectedData))
        await session.commit()
        print('Cache cleared')

asyncio.run(clear_cache())
"
```

**Option 2: Delete the entire database** (will remove all data including chat history):
```bash
rm dragonfly.db
# Database will be recreated on next startup
```

### Python Cache

Clear Python bytecode cache (`__pycache__` directories):
```bash
find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete
find . -type f -name "*.pyo" -delete
```

### Frontend Build Cache

Clear frontend build cache and rebuild:
```bash
cd frontend
rm -rf dist/ .vite/ node_modules/.vite/
npm run build
cd ..
```

### Test Coverage Cache

Clear test coverage files:
```bash
rm -rf htmlcov/ .coverage coverage.xml .pytest_cache/
```

### Application Data

Clear generated audio files:
```bash
rm -rf data/audio/*.mp3
```

Clear chat transcripts:
```bash
rm -rf data/transcripts/*/
```

Clear all application data (audio + transcripts):
```bash
rm -rf data/audio/* data/transcripts/*/
```

### Complete Clean (All Caches and Generated Files)

To clear everything (cache, database, build files, test coverage):

```bash
# Database
rm -f dragonfly.db

# Python cache
find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete

# Frontend build
rm -rf frontend/dist/ frontend/.vite/ frontend/node_modules/.vite/

# Test coverage
rm -rf htmlcov/ .coverage coverage.xml .pytest_cache/

# Application data (optional - removes audio and transcripts)
# rm -rf data/audio/* data/transcripts/*/
```

**Note**: Clearing the database will remove all chat history, device connections, and cached data. The database will be recreated automatically on next startup.

## Configuration

### API Keys

API keys are stored in `config/api_keys.json` (not in git). Copy `config/api_keys.json.example` and add your keys:

```json
{
  "anthropic": {
    "api_key": "your-anthropic-key"
  },
  "fish_audio": {
    "api_key": "your-fish-audio-key",
    "voice_id": "voice-id",
    "voice_engine": "s1"
  },
  "bbc_weather": {
    "location_id": "location-id"
  },
  "waze": {
    "api_key": "your-waze-api-key"
  }
}
```

### Location Configuration

Location is configured in `config/location.json`. Edit this file or use the Settings page in the web GUI.

### Persona Configuration

AI personas are configured in `config/personas/`. Each persona has its own configuration file (e.g., `default.config`, `cortana.config`, `rick_sanchez.config`). Edit these files or use the Settings page in the web GUI.

## Usage

### Web GUI

Access the web interface at http://localhost:1337 after starting the server. The GUI provides:
- Real-time system monitoring (CPU, RAM, Disk, Uptime)
- Weather and traffic information
- News feed
- Interactive AI chat with multiple personas
- Device management
- Settings configuration

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

#### Get Chat History
```bash
curl "http://localhost:1337/api/chat?limit=50&offset=0&session_id=your-session-id&mode=qa"
```

#### Send Chat Message
```bash
curl -X POST http://localhost:1337/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "session_id": "your-session-id",
    "mode": "qa"
  }'
```

## Architecture

### Core Components

1. **Processor**: Main coordinator that manages all components
2. **Job Manager**: Handles job queue and asynchronous execution
3. **WebSocket Server**: Receives data and commands from clients
4. **Services**: Execute specific tasks (AI, RAG, TTS, etc.)
5. **Database**: Stores jobs, device connections, collected data, and chat messages

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

### Running in Development

For frontend development with hot-reload, run the frontend dev server separately (see "Development Mode (Frontend)" section above).

## Database

The application uses SQLAlchemy with async support. By default, it uses SQLite (`dragonfly.db`), but can be configured to use PostgreSQL or other databases by changing the `DATABASE_URL` in settings or `.env` file.

## Platform Support

- ✅ macOS (tested on Darwin)
- ✅ Raspberry Pi (ARM64/ARMv7)
- ✅ Linux
- ✅ Windows (with adjustments)

## Troubleshooting

### Port Already in Use

If port 1337 is already in use, either:
- Stop the process using the port
- Change the port in `.env` file: `PORT=1338`

### Database Locked Errors

If you see "database is locked" errors:
- Ensure only one instance of the server is running
- Wait a moment and retry (SQLite has a 30-second timeout)
- If persistent, restart the server

### Frontend Not Updating

If frontend changes aren't appearing:
- Rebuild the frontend: `cd frontend && npm run build && cd ..`
- Clear browser cache
- Restart the server

### Tests Failing

If tests are failing:
- Ensure virtual environment is activated
- Reinstall dependencies: `pip install -r requirements.txt`
- Clear test cache: `rm -rf .pytest_cache/`
- Check that the database file isn't locked (stop the server if running)

## License

[Add your license here]

## Contributing

[Add contributing guidelines here]
