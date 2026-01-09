"""FastAPI application for the web GUI."""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse, JSONResponse
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging
import asyncio
import aiohttp
import json
import mimetypes
import re
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from pathlib import Path
from core.processor import Processor
from services.ai_service import AIService
import tempfile
import subprocess
import os
import soundfile as sf
import numpy as np
import os.path
from collections import defaultdict
from mutagen.mp3 import MP3
from mutagen.easyid3 import EasyID3
from database.base import AsyncSessionLocal, engine
from database.models import DeviceConnection, DeviceTelemetry, ChatMessage, CollectedData, MusicArtist, MusicAlbum, MusicSong, MusicPlaylist, MusicPlaylistSong, OctopusEnergyConsumption, OctopusEnergyTariff, OctopusEnergyTariffRate, ChatSession, ArticleSummary, Alarm, AlarmType, PromptPreset
from sqlalchemy import select, desc, func, or_, delete, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.exc import OperationalError
from pydantic import BaseModel
from config.persona_loader import list_available_personas, get_current_persona_name, set_current_persona, load_persona_config, save_persona_config, create_persona_config
from config.location_loader import load_location_config, get_location_display_name, save_location_config
from config.api_key_loader import load_api_keys, save_api_keys
from config.expert_types_loader import list_expert_types
from config.router_loader import load_router_config, save_router_config
from services.rag_service import RAGService
from services.tts_service import TTSService
from services.ai_service import AIService
from data_collectors.weather_collector import WeatherCollector
from data_collectors.news_collector import NewsCollector
from data_collectors.traffic_collector import TrafficCollector
from services.ai_service import AIService
from services.article_summarizer import ArticleSummarizer
from fastapi.responses import Response
from sqlalchemy.orm.attributes import flag_modified
from utils.transcript_saver import save_transcript
import io
from config.settings import settings
import time
import platform
import socket
import httpx
import sys
import threading
from anthropic import AsyncAnthropic
import signal
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

app = FastAPI(title="Dragonfly Home Assistant")

# Background tasks for Octopus Energy
_octopus_tasks_running = False

async def _get_octopus_api_key() -> Optional[str]:
    """Get Octopus Energy API key from database."""
    try:
        api_keys = await load_api_keys()
        octopus_config = api_keys.get("octopus_energy", {})
        api_key = octopus_config.get("api_key")
        if api_key:
            return api_key
        logger.warning("Octopus Energy API key not found in database")
        return None
    except Exception as e:
        logger.error(f"Error loading Octopus Energy API key: {e}")
        return None

async def _fetch_octopus_consumption_task():
    """Background task to fetch consumption data hourly."""
    api_key = await _get_octopus_api_key()
    if not api_key:
        logger.error("[OCTOPUS TASK] API key not available, skipping consumption fetch")
        return
    
    account_number = await _get_octopus_account_number()
    meter_point = "2343383923410"  # Default fallback
    meter_serial = "22L4381884"  # Default fallback
    
    # Get meter info from account endpoint if account number is available
    if account_number:
        meter_info = await _get_meter_info_from_account(account_number, api_key)
        if meter_info:
            meter_point = meter_info.get("meter_point", meter_point)
            meter_serial = meter_info.get("meter_serial", meter_serial)
            logger.info(f"[OCTOPUS TASK] Using meter point {meter_point}, serial {meter_serial} from account {account_number}")
    
    # Fetch immediately on startup
    first_run = True
    
    while True:
        try:
            if not first_run:
                await asyncio.sleep(3600)  # Wait 1 hour
            first_run = False
            logger.info("[OCTOPUS TASK] Fetching consumption data...")
            
            # Calculate period: last 7 days to catch any missed readings and ensure we get recent data
            now = datetime.now(timezone.utc)
            period_to = now
            period_from = now - timedelta(days=7)
            
            url = f"https://api.octopus.energy/v1/electricity-meter-points/{meter_point}/meters/{meter_serial}/consumption/"
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Handle pagination - fetch all pages
                all_results = []
                next_url = None
                page_count = 0
                
                while True:
                    if next_url:
                        # Fetch next page
                        response = await client.get(next_url, auth=(api_key, ""))
                    else:
                        # First page
                        response = await client.get(
                            url,
                            auth=(api_key, ""),
                            params={
                                "page_size": 1000,  # Increased from 100 to get more data per page
                                "period_from": period_from.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                "period_to": period_to.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                "order_by": "period"
                            }
                        )
                    
                    response.raise_for_status()
                    data = response.json()
                    
                    results = data.get("results", [])
                    all_results.extend(results)
                    page_count += 1
                    logger.info(f"[OCTOPUS TASK] Fetched page {page_count} with {len(results)} readings")
                    
                    # Check for next page
                    next_url = data.get("next")
                    if not next_url:
                        break
                
                logger.info(f"[OCTOPUS TASK] Total readings fetched: {len(all_results)}")
                
                # Log the date range of fetched data
                if all_results:
                    latest_reading = all_results[-1] if all_results else None  # Most recent (last in list after order_by=period)
                    oldest_reading = all_results[0] if all_results else None
                    if latest_reading:
                        latest_date = latest_reading.get("interval_start", "unknown")
                        logger.info(f"[OCTOPUS TASK] Latest reading date: {latest_date}")
                    if oldest_reading:
                        oldest_date = oldest_reading.get("interval_start", "unknown")
                        logger.info(f"[OCTOPUS TASK] Oldest reading date: {oldest_date}")
                
                # Store new readings
                stored_count = 0
                async with AsyncSessionLocal() as session:
                    for reading in all_results:
                        interval_start_str = reading.get("interval_start")
                        consumption = reading.get("consumption")
                        
                        if not interval_start_str or consumption is None:
                            continue
                        
                        try:
                            interval_start = datetime.fromisoformat(interval_start_str.replace('Z', '+00:00'))
                        except Exception:
                            continue
                        
                        # Check if exists
                        existing = await session.execute(
                            select(OctopusEnergyConsumption).where(
                                OctopusEnergyConsumption.interval_start == interval_start,
                                OctopusEnergyConsumption.meter_point == meter_point,
                                OctopusEnergyConsumption.meter_serial == meter_serial
                            )
                        )
                        if existing.scalar_one_or_none():
                            continue
                        
                        interval_end_str = reading.get("interval_end")
                        interval_end = datetime.fromisoformat(interval_end_str.replace('Z', '+00:00')) if interval_end_str else None
                        
                        consumption_record = OctopusEnergyConsumption(
                            interval_start=interval_start,
                            interval_end=interval_end,
                            consumption=consumption,
                            meter_point=meter_point,
                            meter_serial=meter_serial
                        )
                        session.add(consumption_record)
                        stored_count += 1
                    
                    if stored_count > 0:
                        await session.commit()
                        logger.info(f"[OCTOPUS TASK] Stored {stored_count} new consumption readings")
                    else:
                        logger.info("[OCTOPUS TASK] No new consumption readings to store")
        except Exception as e:
            logger.error(f"[OCTOPUS TASK] Error fetching consumption: {e}", exc_info=True)


async def _fetch_historical_tariff_rates(meter_point: str, tariff_code: str, product_code: str, api_key: str, days: int = 7) -> int:
    """Fetch and store historical tariff rates for the specified period. Returns count of rates stored."""
    try:
        now = datetime.now(timezone.utc)
        period_to = now
        period_from = now - timedelta(days=days)
        
        # Construct the unit rates URL
        unit_rates_url = f"https://api.octopus.energy/v1/products/{product_code}/electricity-tariffs/{tariff_code}/standard-unit-rates/"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                unit_rates_url,
                params={
                    "period_from": period_from.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "period_to": period_to.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "page_size": 1000
                }
            )
            
            if response.status_code != 200:
                logger.warning(f"Could not fetch historical tariff rates: {response.status_code}")
                return 0
            
            data = response.json()
            rates = data.get("results", [])
            
            if not rates:
                return 0
            
            # Store rates in database
            stored_count = 0
            async with AsyncSessionLocal() as session:
                for rate in rates:
                    valid_from_str = rate.get("valid_from")
                    valid_to_str = rate.get("valid_to")
                    unit_rate = rate.get("value_inc_vat")
                    
                    if not valid_from_str or unit_rate is None:
                        continue
                    
                    try:
                        valid_from = datetime.fromisoformat(valid_from_str.replace('Z', '+00:00'))
                        valid_to = datetime.fromisoformat(valid_to_str.replace('Z', '+00:00')) if valid_to_str else None
                    except Exception:
                        continue
                    
                    # Check if this rate already exists
                    existing = await session.execute(
                        select(OctopusEnergyTariffRate).where(
                            OctopusEnergyTariffRate.meter_point == meter_point,
                            OctopusEnergyTariffRate.tariff_code == tariff_code,
                            OctopusEnergyTariffRate.valid_from == valid_from
                        )
                    )
                    if existing.scalar_one_or_none():
                        continue
                    
                    # Create new rate record
                    rate_record = OctopusEnergyTariffRate(
                        meter_point=meter_point,
                        tariff_code=tariff_code,
                        valid_from=valid_from,
                        valid_to=valid_to or valid_from + timedelta(minutes=30),
                        unit_rate=unit_rate
                    )
                    session.add(rate_record)
                    stored_count += 1
                
                if stored_count > 0:
                    await session.commit()
                    logger.info(f"Stored {stored_count} historical tariff rates")
            
            return stored_count
    except Exception as e:
        logger.error(f"Error fetching historical tariff rates: {e}", exc_info=True)
        return 0


async def _get_octopus_account_number() -> Optional[str]:
    """Get Octopus Energy account number from system config."""
    try:
        from database.models import SystemConfig
        async with AsyncSessionLocal() as session:
            system_config_result = await session.execute(
                select(SystemConfig).where(SystemConfig.config_key == "system")
            )
            system_config = system_config_result.scalar_one_or_none()
            if system_config and system_config.config_value:
                octopus_config = system_config.config_value.get("octopus", {})
                account_number = octopus_config.get("account_number")
                if account_number:
                    return account_number
        return None
    except Exception as e:
        logger.error(f"Error loading Octopus account number: {e}")
        return None

async def _get_meter_info_from_account(account_number: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Get meter point and serial number from account endpoint.
    Prefers meters with registers (consumption data) over meters without registers.
    """
    try:
        account_data = await _fetch_account_info(account_number, api_key)
        if not account_data:
            return None
        
        # Extract first electricity meter point info
        for property_data in account_data.get("properties", []):
            for mp_data in property_data.get("electricity_meter_points", []):
                mpan = mp_data.get("mpan")
                meters = mp_data.get("meters", [])
                if not meters:
                    continue
                
                # Prefer meter with registers (consumption data)
                meter_with_registers = None
                for meter in meters:
                    registers = meter.get("registers", [])
                    if registers:
                        meter_with_registers = meter
                        break
                
                # Use meter with registers if found, otherwise use first meter
                selected_meter = meter_with_registers if meter_with_registers else meters[0]
                meter_serial = selected_meter.get("serial_number")
                
                if meter_serial:
                    logger.info(f"Selected meter {meter_serial} (has registers: {bool(meter_with_registers)})")
                    return {
                        "meter_point": mpan,
                        "meter_serial": meter_serial
                    }
        return None
    except Exception as e:
        logger.error(f"Error getting meter info from account: {e}")
        return None

async def _fetch_octopus_tariff_task():
    """Background task to fetch tariff data daily."""
    api_key = await _get_octopus_api_key()
    if not api_key:
        logger.error("[OCTOPUS TASK] API key not available, skipping tariff fetch")
        return
    
    account_number = await _get_octopus_account_number()
    if not account_number:
        logger.warning("[OCTOPUS TASK] Account number not configured, using default meter point")
        account_number = None
    
    meter_point = "2343383923410"  # Default fallback
    
    # Get meter point from account if account number is available
    if account_number:
        meter_info = await _get_meter_info_from_account(account_number, api_key)
        if meter_info:
            meter_point = meter_info.get("meter_point", meter_point)
    
    # Fetch immediately on startup
    first_run = True
    
    while True:
        try:
            if not first_run:
                await asyncio.sleep(86400)  # Wait 24 hours
            first_run = False
            logger.info("[OCTOPUS TASK] Fetching tariff data...")
            
            tariff_info = await _fetch_and_store_tariff(meter_point, api_key, account_number)
            if tariff_info:
                logger.info(f"[OCTOPUS TASK] Updated tariff: {tariff_info.get('unit_rate')}p/kWh")
                
                # Also fetch historical rates if we have tariff code
                tariff_code = tariff_info.get("tariff_code")
                if tariff_code:
                    # Extract product code
                    product_code = tariff_code.split("-")[0] if "-" in tariff_code else None
                    if not product_code:
                        parts = tariff_code.split("-")
                        if len(parts) >= 2:
                            product_code = "-".join(parts[:-1])
                    
                    if product_code:
                        # Fetch last 7 days of historical rates
                        stored = await _fetch_historical_tariff_rates(meter_point, tariff_code, product_code, api_key, days=7)
                        if stored > 0:
                            logger.info(f"[OCTOPUS TASK] Stored {stored} historical tariff rates")
            else:
                logger.warning("[OCTOPUS TASK] Could not fetch tariff data")
        except Exception as e:
            logger.error(f"[OCTOPUS TASK] Error fetching tariff: {e}", exc_info=True)


async def _check_alarms_task():
    """Background task to check for alarms that need to be triggered."""
    while True:
        try:
            await asyncio.sleep(60)  # Check every minute
            
            now = datetime.now(timezone.utc)
            current_time = now.time()
            current_weekday = now.weekday()  # 0=Monday, 6=Sunday
            
            async with AsyncSessionLocal() as session:
                # Get all active alarms
                result = await session.execute(
                    select(Alarm)
                    .where(Alarm.is_active == "true")
                )
                all_alarms = result.scalars().all()
                
                alarms_to_trigger = []
                for alarm in all_alarms:
                    alarm_time_only = alarm.alarm_time.time()
                    
                    # Check if time matches (within 1 minute window)
                    time_diff = abs((current_time.hour * 60 + current_time.minute) - 
                                   (alarm_time_only.hour * 60 + alarm_time_only.minute))
                    
                    if time_diff <= 1:  # Within 1 minute window
                        if alarm.recurring_days:
                            # Recurring alarm - check if today is in the recurring days
                            # Convert weekday: Python's weekday() is 0=Monday, 6=Sunday
                            if current_weekday in alarm.recurring_days:
                                alarms_to_trigger.append(alarm)
                        else:
                            # One-time alarm - check if not already triggered
                            if alarm.triggered == "false":
                                alarms_to_trigger.append(alarm)
                                # Mark as triggered for one-time alarms
                                alarm.triggered = "true"
                                alarm.triggered_at = now
                
                if alarms_to_trigger:
                    for alarm in alarms_to_trigger:
                        logger.info(f"[ALARM] Triggered alarm {alarm.id} at {alarm.alarm_time} - Reason: {alarm.reason}")
                    
                    # Commit changes (only for one-time alarms that were marked as triggered)
                    await session.commit()
                    
                    # Note: Audio playback will be handled by frontend polling /api/alarms/check
        except Exception as e:
            logger.error(f"[ALARM TASK] Error checking alarms: {e}", exc_info=True)


@app.on_event("startup")
async def startup_event():
    """Start background tasks on server startup."""
    global _octopus_tasks_running
    if not _octopus_tasks_running:
        _octopus_tasks_running = True
        # Start consumption task (hourly)
        asyncio.create_task(_fetch_octopus_consumption_task())
        # Start tariff task (daily)
        asyncio.create_task(_fetch_octopus_tariff_task())
        logger.info("Started Octopus Energy background tasks (hourly consumption, daily tariff)")
    
    # Start alarm checking task (every minute)
    asyncio.create_task(_check_alarms_task())
    logger.info("Started alarm checking background task")

# Vosk model path (warn if missing)
VOSK_MODEL_PREFERRED = Path(__file__).parent / ".." / "models" / "vosk" / "vosk-model-en-us-0.22"
if not VOSK_MODEL_PREFERRED.exists():
    logger.warning(
        "Vosk model missing at %s. Download from https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip and unzip into models/vosk/",
        VOSK_MODEL_PREFERRED,
    )

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# This will be set by the main application
processor: Optional[Processor] = None
server_start_time: float = time.time()




async def _get_anthropic_api_key() -> Optional[str]:
    """Fetch Anthropic API key from settings, api_keys.json, or env."""
    api_key = settings.ai_api_key or os.getenv("ANTHROPIC_API_KEY")
    if api_key:
        return api_key
    try:
        api_keys = await load_api_keys()
        return api_keys.get("anthropic", {}).get("api_key")
    except Exception as e:
        logger.warning("Failed to load Anthropic API key from config: %s", e)
        return None


async def _run_router_inference(user_text: str) -> Optional[str]:
    """Run Anthropic router model on the given text."""
    cfg = await load_router_config() or {}
    anth_cfg = cfg.get("anthropic", {}) if isinstance(cfg, dict) else {}
    api_key = await _get_anthropic_api_key()
    if not api_key:
        raise RuntimeError("Anthropic API key not configured")
    client = AsyncAnthropic(api_key=api_key)

    model = anth_cfg.get("anthropic_model", settings.ai_model)
    system_prompt = anth_cfg.get("prompt_context")
    max_tokens = anth_cfg.get("max_tokens", 256)
    temperature = anth_cfg.get("temperature")
    top_p = anth_cfg.get("top_p")

    params = {
        "model": model,
        "messages": [{"role": "user", "content": user_text}],
        "max_tokens": max_tokens,
    }
    if system_prompt:
        params["system"] = system_prompt
    if temperature is not None:
        params["temperature"] = temperature
    if top_p is not None:
        params["top_p"] = top_p

    msg = await client.messages.create(**params)
    if not msg.content:
        return None
    output = ""
    for block in msg.content:
        if getattr(block, "type", None) == "text":
            output += block.text or ""
    output = output.strip()
    return output or None


def _parse_router_answer(answer: Optional[str]) -> Optional[Dict[str, Any]]:
    """Best-effort parse of router answer as JSON; returns None on failure."""
    if not answer:
        return None
    try:
        return json.loads(answer)
    except Exception:
        # Some models may wrap in code fences; strip simple fences and retry
        trimmed = answer.strip()
        if trimmed.startswith("```"):
            trimmed = trimmed.strip("`").strip()
            if trimmed.lower().startswith("json"):
                trimmed = trimmed[4:].lstrip()
            try:
                return json.loads(trimmed)
            except Exception:
                return None
        return None


async def route_request(route_type: str, route_value: str, mode: str = "qa") -> Dict[str, Any]:
    """
    Route a request to the appropriate service based on route_type.
    
    Args:
        route_type: Type of route ("question", "task", etc.)
        route_value: The actual query/value to process
        mode: Mode for processing ("qa" or "conversational")
    
    Returns:
        Dict with "success", "result"/"answer" fields
    """
    try:
        logger.info(f"[ROUTE] Routing request: type={route_type}, value={route_value[:100]}, mode={mode}")
        
        if route_type == "question":
            # Route to RAG service for conversational mode, AI service for qa mode
            if mode == "conversational":
                rag_service = RAGService()
                # Use a default session_id if not provided
                result = await rag_service.execute({
                    "question": route_value,
                    "session_id": "default"
                })
                return {
                    "success": True,
                    "result": result.get("answer", ""),
                    "answer": result.get("answer", "")
                }
            else:
                # QA mode - use AI service
                ai_service = AIService()
                result = await ai_service.execute({
                    "question": route_value
                })
                return {
                    "success": True,
                    "result": result.get("answer", ""),
                    "answer": result.get("answer", "")
                }
        
        elif route_type == "task":
            # Handle specific tasks
            task_name = route_value.lower().strip()
            
            if task_name == "get_time":
                from datetime import datetime
                current_time = datetime.now().strftime("%I:%M %p")
                return {
                    "success": True,
                    "result": f"The current time is {current_time}",
                    "answer": f"The current time is {current_time}"
                }
            else:
                # Unknown task - try to handle with AI service
                ai_service = AIService()
                result = await ai_service.execute({
                    "question": f"Please handle this task: {route_value}"
                })
                return {
                    "success": True,
                    "result": result.get("answer", ""),
                    "answer": result.get("answer", "")
                }
        
        else:
            # Unknown route type - default to AI service
            logger.warning(f"[ROUTE] Unknown route_type: {route_type}, defaulting to AI service")
            ai_service = AIService()
            result = await ai_service.execute({
                "question": route_value
            })
            return {
                "success": True,
                "result": result.get("answer", ""),
                "answer": result.get("answer", "")
            }
    
    except Exception as e:
        logger.error(f"[ROUTE] Error routing request: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "result": "",
            "answer": ""
        }


@app.post("/api/system/restart")
async def restart_system():
    """
    Schedule a server restart. Returns immediately, then spawns a new process and exits.
    Frontend should clear caches and reload after calling this.
    """
    try:
        def _restart():
            try:
                # Get the project root directory
                project_root = Path(__file__).parent.parent.resolve()
                venv_python = project_root / "venv" / "bin" / "python"
                
                # Build the restart command
                restart_script = f"""
cd {project_root}
source venv/bin/activate
nohup python -m uvicorn web.main:app --host 0.0.0.0 --port 1337 > /tmp/dragonfly.log 2>&1 &
"""
                
                logger.info(f"Executing restart script from: {project_root}")
                
                # Execute the restart command in a shell after a delay
                subprocess.Popen(
                    ["sh", "-c", f"sleep 1 && {restart_script}"],
                    start_new_session=True,
                    cwd=str(project_root)
                )
                
                # Give the response time to be sent
                time.sleep(0.5)
            finally:
                # Exit the current process
                logger.info("Exiting current process for restart")
                os._exit(0)

        # Run restart in a separate thread after a short delay to let the response flush
        threading.Timer(0.5, _restart).start()
        return {"success": True, "message": "Server restart scheduled"}
    except Exception as e:
        logger.error(f"Failed to schedule restart: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to schedule restart")


@app.post("/api/ai/ask-stream")
async def ai_ask_question_stream(request: Request):
    """
    Streaming AI question endpoint - streams text chunks as they're generated.
    Returns text chunks in real-time.
    """
    try:
        payload = await request.json()
        question = payload.get("question", "")
        
        if not question:
            return JSONResponse(status_code=400, content={"error": "No question provided"})
        
        logger.info(f"[AI ASK STREAM] Question: {question[:100]}...")
        
        from services.ai_service import AIService
        ai = AIService()
        
        async def text_stream_generator():
            try:
                import time
                start_time = time.time()
                first_chunk_time = None
                full_text = []
                chunk_count = 0
                
                logger.info(f"[AI ASK STREAM] 🚀 Starting text stream...")
                
                async for text_chunk in ai.async_stream_execute({"question": question}):
                    chunk_count += 1
                    if first_chunk_time is None:
                        first_chunk_time = time.time() - start_time
                        logger.info(f"[AI ASK STREAM] ⚡ First chunk in {first_chunk_time:.2f}s")
                    full_text.append(text_chunk)
                    # Send as server-sent events format
                    yield f"data: {json.dumps({'chunk': text_chunk})}\n\n"
                
                total_time = time.time() - start_time
                final_text = ''.join(full_text)
                logger.info(f"[AI ASK STREAM] ✅ Complete - Time: {total_time:.2f}s, Chunks: {chunk_count}, Length: {len(final_text)}")
                
                # Send final event with complete text
                yield f"data: {json.dumps({'done': True, 'full_text': final_text})}\n\n"
                
            except Exception as e:
                logger.error(f"[AI ASK STREAM] Error: {e}", exc_info=True)
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return StreamingResponse(
            text_stream_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            }
        )
            
    except Exception as e:
        logger.error(f"[AI ASK STREAM] Failed: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/personas/{persona_name}/filler-words")
async def get_filler_words(persona_name: str):
    """Get list of filler words/audio files for a persona from both filesystem and config."""
    try:
        persona_config = await load_persona_config(persona_name)
        if not persona_config:
            raise HTTPException(status_code=404, detail=f"Persona {persona_name} not found")
        
        # Determine persona folder name (use persona name or 'default')
        persona_folder = persona_name if persona_name != "default" else "default"
        
        # Scan filesystem for filler words
        project_root = Path(__file__).parent.parent
        filler_dir = project_root / "data" / "audio" / "filler_words" / persona_folder
        
        filler_words_dict = {}  # Use dict to avoid duplicates, keyed by filename
        
        # First, scan filesystem for all .mp3 files
        logger.info(f"Scanning filler directory: {filler_dir}")
        logger.info(f"Directory exists: {filler_dir.exists()}, is_dir: {filler_dir.is_dir() if filler_dir.exists() else 'N/A'}")
        
        if filler_dir.exists() and filler_dir.is_dir():
            mp3_files = list(filler_dir.glob("*.mp3"))
            logger.info(f"Found {len(mp3_files)} MP3 files in {filler_dir}")
            for audio_file in mp3_files:
                filename = audio_file.name
                # Extract word/text from filename (remove .mp3, replace _ with space)
                word_text = filename.replace(".mp3", "").replace("_", " ")
                relative_path = f"../data/audio/filler_words/{persona_folder}/{filename}"
                
                filler_words_dict[filename] = {
                    "filename": filename,
                    "path": relative_path,
                    "text": word_text,
                    "source": "filesystem"
                }
                logger.debug(f"Added filler word from filesystem: {filename}")
        else:
            logger.warning(f"Filler directory does not exist or is not a directory: {filler_dir}")
        
        # Then, add any from config that might not be in filesystem
        filler_audio = persona_config.get("filler_audio", [])
        for path in filler_audio:
            filename = Path(path).name
            if filename not in filler_words_dict:
                # File might not exist in filesystem, but is in config
                word_text = filename.replace(".mp3", "").replace("_", " ")
                filler_words_dict[filename] = {
                    "filename": filename,
                    "path": path,
                    "text": word_text,
                    "source": "config"
                }
        
        # Convert to list and sort by filename
        filler_words = sorted(filler_words_dict.values(), key=lambda x: x["filename"])
        
        logger.info(f"Returning {len(filler_words)} filler words for persona {persona_name}")
        
        return {"success": True, "filler_words": filler_words}
    except Exception as e:
        logger.error(f"Error getting filler words: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/personas/{persona_name}/filler-words")
async def create_filler_word(persona_name: str, request: Request):
    """Create a new filler word by generating audio from text."""
    try:
        payload = await request.json()
        text = payload.get("text", "").strip()
        
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        
        # Load persona config to get voice settings
        persona_config = await load_persona_config(persona_name)
        if not persona_config:
            raise HTTPException(status_code=404, detail=f"Persona {persona_name} not found")
        
        fish_audio_config = persona_config.get("fish_audio", {})
        voice_id = fish_audio_config.get("voice_id")
        voice_engine = fish_audio_config.get("voice_engine", "s1")
        
        if not voice_id:
            raise HTTPException(status_code=400, detail="Voice ID not configured for this persona")
        
        # Generate audio using TTS service
        from services.tts_service import TTSService
        tts = TTSService()
        audio_bytes = await tts.generate_audio_simple(text, voice_id, voice_engine)
        
        if not audio_bytes:
            raise HTTPException(status_code=500, detail="Failed to generate audio")
        
        # Create filename from text (sanitize and convert to filename)
        import re
        safe_filename = re.sub(r'[^a-zA-Z0-9\s]', '', text)
        safe_filename = safe_filename.replace(' ', '_').lower()
        safe_filename = safe_filename[:50]  # Limit length
        filename = f"{safe_filename}.mp3"
        
        # Determine persona folder name (use persona name or 'default')
        persona_folder = persona_name if persona_name != "default" else "default"
        
        # Save audio file (path relative to project root)
        project_root = Path(__file__).parent.parent
        audio_dir = project_root / "data" / "audio" / "filler_words" / persona_folder
        audio_dir.mkdir(parents=True, exist_ok=True)
        
        # Check if file already exists, add number if needed
        file_path = audio_dir / filename
        counter = 1
        while file_path.exists():
            name_part = safe_filename
            filename = f"{name_part}_{counter}.mp3"
            file_path = audio_dir / filename
            counter += 1
        
        file_path.write_bytes(audio_bytes)
        logger.info(f"Created filler audio: {file_path}")
        
        # Add to persona config filler_audio array (path relative to config directory)
        relative_path = f"../data/audio/filler_words/{persona_folder}/{filename}"
        if "filler_audio" not in persona_config:
            persona_config["filler_audio"] = []
        
        persona_config["filler_audio"].append(relative_path)
        
        # Save updated persona config
        await save_persona_config(persona_name, persona_config)
        
        return {
            "success": True,
            "filename": filename,
            "path": relative_path,
            "text": text
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating filler word: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/personas/{persona_name}/filler-words/{filename}")
async def delete_filler_word(persona_name: str, filename: str):
    """Delete a filler word audio file."""
    try:
        # Load persona config
        persona_config = await load_persona_config(persona_name)
        if not persona_config:
            raise HTTPException(status_code=404, detail=f"Persona {persona_name} not found")
        
        # Determine persona folder name
        persona_folder = persona_name if persona_name != "default" else "default"
        
        # Delete physical file from filesystem
        project_root = Path(__file__).parent.parent
        audio_dir = project_root / "data" / "audio" / "filler_words" / persona_folder
        audio_file = audio_dir / filename
        
        if audio_file.exists():
            audio_file.unlink()
            logger.info(f"Deleted filler audio file: {audio_file}")
        else:
            logger.warning(f"Filler audio file not found: {audio_file}")
        
        # Remove from config if it exists there
        filler_audio = persona_config.get("filler_audio", [])
        relative_path_to_remove = None
        for path in filler_audio:
            if filename in path:
                relative_path_to_remove = path
                break
        
        if relative_path_to_remove:
            persona_config["filler_audio"] = [p for p in filler_audio if p != relative_path_to_remove]
            # Save updated persona config
            await save_persona_config(persona_name, persona_config)
        
        return {"success": True, "message": "Filler word deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting filler word: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/personas/{persona_name}/filler-words/{filename}/audio")
async def get_filler_word_audio(persona_name: str, filename: str):
    """Get audio file for a specific filler word."""
    try:
        # Determine persona folder name
        persona_folder = persona_name if persona_name != "default" else "default"
        
        # Get file from filesystem (path relative to project root)
        project_root = Path(__file__).parent.parent
        audio_dir = project_root / "data" / "audio" / "filler_words" / persona_folder
        audio_file = audio_dir / filename
        
        if not audio_file.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        return FileResponse(
            audio_file,
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving filler word audio: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/filler-audio")
async def get_filler_audio(persona: Optional[str] = None):
    """
    Get a random filler audio file for immediate playback while processing.
    Provides instant feedback to the user.
    """
    try:
        import random
        
        # Load persona config to get filler audio paths
        if not persona:
            persona = await get_current_persona_name()
            persona_config = await load_persona_config(persona)
            logger.info(f"[FILLER] 🎭 Using current persona: {persona}")
        else:
            persona_config = await load_persona_config(persona)
            logger.info(f"[FILLER] 🎭 Using specified persona: {persona}")
        
        if not persona_config or "filler_audio" not in persona_config:
            logger.error(f"[FILLER] ❌ No filler audio configured for persona: {persona}")
            return JSONResponse(status_code=404, content={"error": "No filler audio configured for this persona"})
        
        filler_paths = persona_config.get("filler_audio", [])
        if not filler_paths:
            logger.error(f"[FILLER] ❌ No filler audio paths found for persona: {persona}")
            return JSONResponse(status_code=404, content={"error": "No filler audio files found"})
        
        logger.info(f"[FILLER] 📋 Available filler paths: {filler_paths}")
        
        # Pick a random filler audio
        selected_path = random.choice(filler_paths)
        logger.info(f"[FILLER] 🎲 Randomly selected: {selected_path}")
        
        # Convert relative path to absolute (path is relative to config directory)
        config_dir = Path(__file__).parent.parent / "config"
        audio_file = (config_dir / selected_path).resolve()
        
        logger.info(f"[FILLER] 📂 Resolved path: {audio_file}")
        logger.info(f"[FILLER] ✅ File exists: {audio_file.exists()}")
        
        if not audio_file.exists():
            logger.error(f"[FILLER] ❌ Filler audio file not found: {audio_file}")
            return JSONResponse(status_code=404, content={"error": "Filler audio file not found"})
        
        # Return the audio file with no caching to ensure fresh persona-specific audio
        return FileResponse(
            audio_file,
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
        
    except Exception as e:
        logger.error(f"Error serving filler audio: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/ai/ask")
async def ai_ask_question(request: Request):
    """
    Direct AI question endpoint - bypasses router for faster response.
    Returns text-only response.
    """
    try:
        payload = await request.json()
        question = payload.get("question", "")
        
        if not question:
            return {"success": False, "error": "No question provided"}
        
        logger.info(f"[AI ASK] Question: {question[:100]}...")
        
        from services.ai_service import AIService
        ai = AIService()
        
        import time
        start_time = time.time()
        
        result = await ai.execute({"question": question})
        
        elapsed = time.time() - start_time
        logger.info(f"[AI ASK] Response in {elapsed:.2f}s, has_answer={bool(result.get('answer'))}")
        
        # AIService returns {"answer": "...", "question": "...", "service": "..."} or {"error": "..."}
        if result.get("error"):
            logger.error(f"[AI ASK] Error from AI service: {result.get('error')}")
            return {"success": False, "error": result.get("error", "AI request failed")}
        
        answer = result.get("answer", "")
        if answer:
            return {
                "success": True,
                "answer": answer,
                "time": elapsed
            }
        else:
            logger.error("[AI ASK] No answer in AI response")
            return {"success": False, "error": "No answer returned from AI"}
            
    except Exception as e:
        logger.error(f"[AI ASK] Failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/api/chat/sessions/{session_id}/generate-title")
async def generate_chat_title(session_id: str):
    """Generate a title for a chat session using AI based on conversation context."""
    try:
        async with AsyncSessionLocal() as session:
            # Get all messages from this conversation
            result = await session.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session_id)
                .order_by(ChatMessage.created_at)
            )
            messages = result.scalars().all()
            
            if not messages:
                return {"success": False, "error": "No messages found in this conversation"}
            
            # Build conversation context
            conversation_text = "\n\n".join([
                f"{'User' if msg.role == 'user' else 'Assistant'}: {msg.message}"
                for msg in messages
            ])
            
            # Generate title using AI
            from services.ai_service import AIService
            ai_service = AIService()
            await ai_service.reload_persona_config()
            
            title_prompt = f"Based on this conversation, generate a concise, descriptive title (maximum 25 characters, no quotes or punctuation at the end):\n\n{conversation_text[:2000]}"
            
            title_result = await ai_service.execute_with_system_prompt(
                question=title_prompt,
                system_prompt="You are a helpful assistant that generates concise, descriptive titles for conversations. Return only the title text, no quotes, no punctuation at the end, maximum 25 characters.",
                max_tokens=50
            )
            
            generated_title = title_result.get("answer", "").strip()
            # Remove quotes if present
            generated_title = generated_title.strip('"\'')
            # Limit to 25 characters
            if len(generated_title) > 25:
                generated_title = generated_title[:25].strip()
            # Remove trailing punctuation
            generated_title = generated_title.rstrip('.,!?;:')
            
            if not generated_title or len(generated_title) < 3:
                return {"success": False, "error": "Failed to generate a valid title"}
            
            # Update title in database
            session_result = await session.execute(
                select(ChatSession).where(ChatSession.session_id == session_id)
            )
            chat_session = session_result.scalar_one_or_none()
            
            if chat_session:
                chat_session.title = generated_title
                chat_session.updated_at = datetime.now(timezone.utc)
            else:
                chat_session = ChatSession(
                    session_id=session_id,
                    title=generated_title
                )
                session.add(chat_session)
            
            await session.commit()
            
            return {
                "success": True,
                "title": generated_title
            }
            
    except Exception as e:
        logger.error(f"Error generating chat title: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/api/ai/ask-audio-stream")
async def ai_ask_question_audio_stream(request: Request):
    """
    Streaming AI question with real-time audio - streams text to TTS and audio to client.
    This provides the lowest latency by streaming at every stage.
    """
    try:
        payload = await request.json()
        question = payload.get("question", "")
        
        if not question:
            logger.error("[AI STREAM] No question provided")
            return JSONResponse(status_code=400, content={"error": "No question provided"})
        
        logger.info(f"[AI STREAM] Question: {question[:100]}...")
        
        # Get TTS config - use fastest engine for streaming
        persona_config = await load_persona_config()
        fish_cfg = (persona_config or {}).get("fish_audio", {}) if persona_config else {}
        voice_id = fish_cfg.get("voice_id")
        # Override to use fastest engine for AI focus mode (s1-mini is fastest)
        voice_engine = "s1-mini"  # Fastest, lowest latency engine
        
        if not voice_id:
            logger.error("[AI STREAM] No voice ID configured")
            return JSONResponse(status_code=500, content={"error": "TTS not configured"})
        
        logger.info(f"[AI STREAM] Starting streaming pipeline with voice_id={voice_id}, engine={voice_engine}")
        
        # Create async generator for the full pipeline
        async def audio_stream_generator():
            try:
                import time
                start_time = time.time()
                first_chunk_time = None
                total_audio_size = 0
                
                # Create AI text stream
                from services.ai_service import AIService
                ai = AIService()
                
                # Stream AI response as text chunks
                async def text_stream():
                    """Generator that yields text chunks from AI"""
                    logger.info("[AI STREAM] Starting AI text generation")
                    full_text = []
                    async for text_chunk in ai.async_stream_execute({"question": question}):
                        full_text.append(text_chunk)
                        yield text_chunk
                    logger.info(f"[AI STREAM] AI complete, total text: {len(''.join(full_text))} chars")
                
                # Stream TTS audio
                from services.tts_service import TTSService
                tts = TTSService()
                
                logger.info("[AI STREAM] Starting TTS streaming")
                async for audio_chunk in tts.generate_audio_stream(text_stream(), voice_id, voice_engine):
                    if first_chunk_time is None:
                        first_chunk_time = time.time() - start_time
                        logger.info(f"[AI STREAM] First audio chunk in {first_chunk_time:.2f}s")
                    total_audio_size += len(audio_chunk)
                    yield audio_chunk
                
                total_time = time.time() - start_time
                first_chunk_str = f"{first_chunk_time:.2f}s" if first_chunk_time is not None else "N/A"
                logger.info(f"[AI STREAM] Complete - First chunk: {first_chunk_str}, Total: {total_time:.2f}s, Size: {total_audio_size} bytes")
                        
            except Exception as e:
                logger.error(f"[AI STREAM] Error in stream generator: {e}", exc_info=True)
        
        # Return streaming response
        return StreamingResponse(
            audio_stream_generator(),
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            }
        )
            
    except Exception as e:
        logger.error(f"[AI STREAM] Failed: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/ai/text-to-audio-stream")
async def text_to_audio_stream(request: Request):
    """
    Convert text to streaming audio using TTS.
    Takes pre-generated text and streams audio chunks back.
    """
    try:
        payload = await request.json()
        text = payload.get("text", "")
        
        if not text:
            return JSONResponse(status_code=400, content={"error": "No text provided"})
        
        logger.info(f"[TEXT-TO-AUDIO] Converting {len(text)} chars to audio")
        
        # Get TTS config
        persona_config = await load_persona_config()
        fish_cfg = (persona_config or {}).get("fish_audio", {}) if persona_config else {}
        voice_id = fish_cfg.get("voice_id")
        voice_engine = "s1"  # Use standard engine for quality
        
        if not voice_id:
            logger.error("[TEXT-TO-AUDIO] No voice ID configured")
            return JSONResponse(status_code=500, content={"error": "TTS not configured"})
        
        # Create async generator for text chunks
        async def text_chunk_generator():
            """Yield text chunks for streaming TTS"""
            # Split text into sentences for streaming
            sentences = []
            current = ""
            for char in text:
                current += char
                if char in ('.', '!', '?', '\n'):
                    if current.strip():
                        sentences.append(current.strip())
                    current = ""
            if current.strip():
                sentences.append(current.strip())
            
            for sentence in sentences:
                yield sentence + " "
        
        # Stream TTS audio
        async def audio_stream_generator():
            try:
                import time
                start_time = time.time()
                first_chunk_time = None
                total_audio_size = 0
                
                from services.tts_service import TTSService
                tts = TTSService()
                
                logger.info("[TEXT-TO-AUDIO] Starting TTS streaming")
                async for audio_chunk in tts.generate_audio_stream(text_chunk_generator(), voice_id, voice_engine):
                    if first_chunk_time is None:
                        first_chunk_time = time.time() - start_time
                        logger.info(f"[TEXT-TO-AUDIO] First audio chunk in {first_chunk_time:.2f}s")
                    total_audio_size += len(audio_chunk)
                    yield audio_chunk
                
                total_time = time.time() - start_time
                logger.info(f"[TEXT-TO-AUDIO] Complete - Total: {total_time:.2f}s, Size: {total_audio_size} bytes")
                        
            except Exception as e:
                logger.error(f"[TEXT-TO-AUDIO] Error: {e}", exc_info=True)
        
        return StreamingResponse(
            audio_stream_generator(),
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            }
        )
            
    except Exception as e:
        logger.error(f"[TEXT-TO-AUDIO] Failed: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/ai/ask-audio-fast")
async def ai_ask_question_audio_fast(request: Request):
    """
    Optimized AI question with audio - uses fastest TTS engine and minimal processing.
    Returns audio blob as fast as possible.
    """
    try:
        payload = await request.json()
        question = payload.get("question", "")
        text = payload.get("text", "")
        
        if not question and not text:
            return JSONResponse(status_code=400, content={"error": "No question or text provided"})
        
        import time
        start_time = time.time()
        logger.info(f"[AI FAST] ⏱️  START - Question: {(question or text)[:50]}...")
        
        # Get text - either from AI or from payload
        ai_time = 0
        if not text:
            ai_start = time.time()
            logger.info(f"[AI FAST] 🤖 Calling AI service...")
            
            from services.ai_service import AIService
            ai = AIService()
            result = await ai.execute({"question": question})
            
            ai_time = time.time() - ai_start
            
            if result.get("error"):
                logger.error(f"[AI FAST] ❌ AI error after {ai_time:.2f}s: {result.get('error')}")
                return JSONResponse(status_code=500, content={"error": result.get("error")})
            
            text = result.get("answer", "")
            if not text:
                logger.error(f"[AI FAST] ❌ Empty AI response after {ai_time:.2f}s")
                return JSONResponse(status_code=500, content={"error": "Empty AI response"})
            
            logger.info(f"[AI FAST] ✅ AI complete in {ai_time:.2f}s, text length: {len(text)}")
        else:
            logger.info(f"[AI FAST] 📝 Using pre-fetched text, length: {len(text)}")
        
        # Generate audio with fastest engine
        logger.info(f"[AI FAST] 🎙️  Loading TTS config...")
        persona_config = await load_persona_config()
        fish_cfg = (persona_config or {}).get("fish_audio", {}) if persona_config else {}
        voice_id = fish_cfg.get("voice_id")
        
        if not voice_id:
            logger.error(f"[AI FAST] ❌ No voice ID configured")
            return JSONResponse(status_code=500, content={"error": "TTS not configured"})
        
        tts_start = time.time()
        logger.info(f"[AI FAST] 🔊 Starting TTS (engine: s1-mini)...")
        
        from services.tts_service import TTSService
        tts = TTSService()
        
        # Use simple HTTP method for reliability and speed
        audio_bytes = await tts.generate_audio_simple(
            text,
            voice_id=voice_id,
            voice_engine="s1-mini"  # Fastest engine
        )
        
        tts_time = time.time() - tts_start
        
        if audio_bytes:
            total_time = time.time() - start_time
            logger.info(f"[AI FAST] ✅ TTS complete in {tts_time:.2f}s, audio size: {len(audio_bytes):,} bytes")
            logger.info(f"[AI FAST] 🏁 TOTAL TIME: {total_time:.2f}s (AI: {ai_time if not text else 0:.2f}s + TTS: {tts_time:.2f}s)")
            return Response(
                content=audio_bytes,
                media_type="audio/mpeg",
                headers={"Cache-Control": "no-cache"}
            )
        else:
            return JSONResponse(status_code=500, content={"error": "TTS failed"})
            
    except Exception as e:
        logger.error(f"[AI FAST] Failed: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/ai/ask-audio")
async def ai_ask_question_audio(request: Request):
    """
    Direct AI question with audio response - bypasses router for faster response.
    Can accept either a question (will call AI) or text (will skip AI and go straight to TTS).
    Returns audio blob.
    """
    try:
        payload = await request.json()
        question = payload.get("question", "")
        text = payload.get("text", "")  # Pre-fetched text to skip AI call
        
        if not question and not text:
            logger.error("[AI ASK AUDIO] No question or text provided")
            return JSONResponse(status_code=400, content={"error": "No question or text provided"})
        
        import time
        start_time = time.time()
        ai_time = 0
        
        # Get text - either from AI or from payload
        if text:
            logger.info(f"[AI ASK AUDIO] Using pre-fetched text, length={len(text)}")
        else:
            logger.info(f"[AI ASK AUDIO] Question: {question[:100]}...")
            logger.info("[AI ASK AUDIO] Calling AIService")
            from services.ai_service import AIService
            ai = AIService()
            
            result = await ai.execute({"question": question})
            
            ai_time = time.time() - start_time
            logger.info(f"[AI ASK AUDIO] AI response in {ai_time:.2f}s, has_answer={bool(result.get('answer'))}")
            
            # AIService returns {"answer": "...", "question": "...", "service": "..."} or {"error": "..."}
            if result.get("error"):
                error_msg = result.get("error", "AI request failed")
                logger.error(f"[AI ASK AUDIO] AI failed: {error_msg}")
                return JSONResponse(status_code=500, content={"error": error_msg})
            
            text = result.get("answer", "")
            if not text:
                logger.error("[AI ASK AUDIO] Empty AI response")
                return JSONResponse(status_code=500, content={"error": "Empty AI response"})
        
        logger.info(f"[AI ASK AUDIO] Text length={len(text)}")
        
        # Generate audio
        logger.info("[AI ASK AUDIO] Loading persona config")
        persona_config = load_persona_config()
        fish_cfg = (persona_config or {}).get("fish_audio", {}) if persona_config else {}
        voice_id = fish_cfg.get("voice_id")
        voice_engine = fish_cfg.get("voice_engine", "s1")
        
        if not voice_id:
            logger.error("[AI ASK AUDIO] No voice ID configured")
            return JSONResponse(status_code=500, content={"error": "TTS not configured"})
        
        logger.info(f"[AI ASK AUDIO] Starting TTS with voice_id={voice_id}, engine={voice_engine}")
        tts_start = time.time()
        
        from services.tts_service import TTSService
        tts = TTSService()
        
        # Try simple HTTP method first (more reliable)
        audio_bytes = await tts.generate_audio_simple(
            text,
            voice_id=voice_id,
            voice_engine=voice_engine
        )
        
        # Fallback to websocket method if HTTP fails
        if not audio_bytes:
            logger.warning("[AI ASK AUDIO] HTTP method failed, trying websocket...")
            audio_bytes, _ = await tts.generate_audio(
                text,
                voice_id=voice_id,
                voice_engine=voice_engine,
                save_to_file=False
            )
        
        tts_time = time.time() - tts_start
        total_time = time.time() - start_time
        
        if audio_bytes:
            logger.info(f"[AI ASK AUDIO] Complete - AI: {ai_time:.2f}s, TTS: {tts_time:.2f}s, Total: {total_time:.2f}s, Size: {len(audio_bytes)} bytes")
            return Response(
                content=audio_bytes,
                media_type="audio/mpeg",
                headers={
                    "X-AI-Time": f"{ai_time:.2f}",
                    "X-TTS-Time": f"{tts_time:.2f}",
                    "X-Total-Time": f"{total_time:.2f}",
                    "Cache-Control": "no-cache",
                }
            )
        else:
            logger.error("[AI ASK AUDIO] TTS returned no audio")
            return JSONResponse(status_code=500, content={"error": "TTS generation failed"})
            
    except Exception as e:
        logger.error(f"[AI ASK AUDIO] Exception: {e}", exc_info=True)
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/router/route-stream")
async def router_route_stream(request: Request):
    """
    Optimized audio generation: generates audio faster using batch mode.
    The 'stream' in the name refers to returning audio for immediate playback.
    """
    try:
        payload = await request.json()
        route_type = payload.get("type")
        route_value = payload.get("value")
        mode = payload.get("mode", "qa")
        ai_mode = bool(payload.get("ai_mode", False))

        logger.info(f"[STREAM] Request: type={route_type}, ai_mode={ai_mode}")

        if not ai_mode:
            # Non-audio mode - just get the result
            result = await route_request(route_type, route_value, mode=mode)
            if not result.get("success"):
                return JSONResponse(status_code=200, content={"success": False, "error": result.get("error", "Routing failed")})
            return {"success": True, "text": result.get("result") or result.get("answer") or ""}

        # AI mode with audio generation
        try:
            import time
            start_time = time.time()
            
            # Get TTS config
            persona_config = load_persona_config()
            fish_cfg = (persona_config or {}).get("fish_audio", {}) if persona_config else {}
            voice_id = fish_cfg.get("voice_id")
            voice_engine = fish_cfg.get("voice_engine", "s1")
            
            if not voice_id:
                logger.warning("[STREAM] No voice ID configured")
                result = await route_request(route_type, route_value, mode=mode)
                return {"success": True, "text": result.get("result") or result.get("answer") or ""}
            
            # Get AI response (this should be fast from the previous call which caches it)
            logger.info("[STREAM] Getting AI response...")
            result = await route_request(route_type, route_value, mode=mode)
            if not result.get("success"):
                return JSONResponse(status_code=200, content={"success": False, "error": result.get("error", "Routing failed")})
            
            text = result.get("result") or result.get("answer") or ""
            ai_time = time.time() - start_time
            logger.info(f"[STREAM] AI response received in {ai_time:.2f}s, length: {len(text)}")
            
            if not text:
                return {"success": True, "text": ""}
            
            # Generate audio using the standard (non-streaming) method for now
            # This is actually faster than trying to stream because Fish Audio batches better
            logger.info("[STREAM] Starting TTS generation...")
            tts_start = time.time()
            tts = TTSService()
            audio_bytes, _ = await tts.generate_audio(
                text, 
                voice_id=voice_id, 
                voice_engine=voice_engine, 
                save_to_file=False
            )
            tts_time = time.time() - tts_start
            total_time = time.time() - start_time
            
            if audio_bytes:
                logger.info(f"[STREAM] TTS complete in {tts_time:.2f}s, total: {total_time:.2f}s, size: {len(audio_bytes)} bytes")
                return Response(
                    content=audio_bytes, 
                    media_type="audio/mpeg",
                    headers={
                        "X-Text-Response": text[:200],  # First 200 chars in header for debugging
                        "X-Generation-Time": f"{total_time:.2f}",
                        "Cache-Control": "no-cache",
                    }
                )
            else:
                logger.error("[STREAM] TTS returned no audio")
                return {"success": True, "text": text, "audio_error": "TTS generation failed"}
            
        except Exception as tts_err:
            logger.error(f"[STREAM] TTS failed: {tts_err}", exc_info=True)
            result = await route_request(route_type, route_value, mode=mode)
            return {"success": True, "text": result.get("result") or "", "audio_error": str(tts_err)}
        
    except Exception as e:
        logger.error(f"[STREAM] Route failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/router/route")
async def router_route(request: Request):
    """
    Dispatch a router decision to a concrete action.
    Expected payload: { "type": "...", "value": "...", "mode": "qa|conversational", "ai_mode": bool }
    """
    try:
        payload = await request.json()
        route_type = payload.get("type")
        route_value = payload.get("value")
        mode = payload.get("mode", "qa")
        ai_mode = bool(payload.get("ai_mode", False))

        result = await route_request(route_type, route_value, mode=mode)
        if not result.get("success"):
            # Return JSON error instead of raising to avoid breaking frontend audio flow
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": result.get("error", "Routing failed"),
                    "route_type": route_type,
                    "route_value": route_value,
                },
            )

        text = result.get("result") or result.get("answer") or ""
        if ai_mode:
            try:
                # Generate TTS using current persona voice
                persona_config = load_persona_config()
                fish_cfg = (persona_config or {}).get("fish_audio", {}) if persona_config else {}
                voice_id = fish_cfg.get("voice_id")
                voice_engine = fish_cfg.get("voice_engine", "s1")
                if voice_id:
                    logger.info(f"Generating TTS for text length: {len(text)}")
                    tts = TTSService()
                    audio_bytes, _ = await tts.generate_audio(text, voice_id=voice_id, voice_engine=voice_engine, save_to_file=False)
                    if audio_bytes:
                        logger.info(f"TTS generated, audio size: {len(audio_bytes)} bytes")
                        return Response(content=audio_bytes, media_type="audio/mpeg")
            except Exception as tts_err:
                logger.error(f"TTS generation failed: {tts_err}", exc_info=True)
                # fall through to JSON response with error note
                return {"success": True, "text": text, "route": result.get("route"), "mode": mode, "audio_error": str(tts_err)}
        # Fallback JSON if not in AI mode or TTS missing
        return {"success": True, "text": text, "route": result.get("route"), "mode": mode}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Router dispatch failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Router dispatch failed")


async def _download_album_cover(artist: str, album: str, save_dir: Path) -> Optional[str]:
    """
    Download album cover from MusicBrainz Cover Art Archive.
    Returns the relative path to the saved cover image, or None if not found.
    """
    try:
        # Query MusicBrainz for release information
        query = f'artist:"{artist}" AND release:"{album}"'
        url = f"https://musicbrainz.org/ws/2/release/?query={query}&fmt=json"
        
        headers = {
            "User-Agent": "Dragonfly/1.0 (https://github.com/davidnorminton/dragonfly)"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Search for the release
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            releases = data.get("releases", [])
            if not releases:
                logger.info(f"No MusicBrainz release found for {artist} - {album}")
                return None
            
            # Get the first release ID
            release_id = releases[0].get("id")
            if not release_id:
                return None
            
            logger.info(f"Found MusicBrainz release {release_id} for {artist} - {album}")
            
            # Try to get cover art from Cover Art Archive
            cover_url = f"https://coverartarchive.org/release/{release_id}/front"
            
            # Respect MusicBrainz rate limiting
            await asyncio.sleep(1)
            
            cover_response = await client.get(cover_url, headers=headers, follow_redirects=True)
            cover_response.raise_for_status()
            
            # Save the cover image
            save_dir.mkdir(parents=True, exist_ok=True)
            cover_path = save_dir / "cover.jpg"
            
            with open(cover_path, "wb") as f:
                f.write(cover_response.content)
            
            logger.info(f"Downloaded cover art for {artist} - {album} to {cover_path}")
            
            # Return relative path from music base
            base_path = Path("/Users/davidnorminton/Music")
            rel_path = str(cover_path.relative_to(base_path))
            return rel_path
            
    except Exception as e:
        logger.warning(f"Failed to download cover for {artist} - {album}: {e}")
        return None


def _extract_album_art_from_mp3(mp3_path: Path, save_dir: Path) -> Optional[str]:
    """
    Extract embedded album art from MP3 file and save as cover.jpg.
    Returns the relative path to the saved cover, or None if not found.
    """
    try:
        from mutagen.id3 import ID3, APIC
        
        audio = ID3(str(mp3_path))
        
        # Look for APIC (Attached Picture) frames
        for tag in audio.values():
            if isinstance(tag, APIC):
                # Save the image
                save_dir.mkdir(parents=True, exist_ok=True)
                cover_path = save_dir / "cover.jpg"
                
                with open(cover_path, "wb") as f:
                    f.write(tag.data)
                
                logger.info(f"Extracted album art from {mp3_path.name} to {cover_path}")
                
                # Return relative path
                base_path = Path("/Users/davidnorminton/Music")
                rel_path = str(cover_path.relative_to(base_path))
                return rel_path
        
        return None
    except Exception as e:
        logger.debug(f"No album art found in {mp3_path.name}: {e}")
        return None


def _clean_song_title(title: str, artist: str = None) -> str:
    """
    Clean up song titles that have artist name and track number prefixes.
    Examples:
        "Green Day -06- Going to Pasalacqua" -> "Going to Pasalacqua"
        "Artist Name-05-Song Title" -> "Song Title"
        "-03- Song Name" -> "Song Name"
        "08. Lay Me Down" -> "Lay Me Down"
        "3. Hey Brother" -> "Hey Brother"
        "03-metallica-devils_dance" -> "Devils Dance"
        "10-artist_name-song_title" -> "Song Title"
    """
    if not title:
        return title
    
    cleaned = title
    
    # Pattern 1: "XX-artistname-song_title" or "XX-artist_name-song_title" (lowercase, underscores)
    # Example: "03-metallica-devils_dance" -> "devils_dance"
    pattern = r'^\s*\d{1,3}-[^-]+-(.+)$'
    match = re.match(pattern, cleaned)
    if match:
        cleaned = match.group(1).strip()
        # Replace underscores with spaces
        cleaned = cleaned.replace('_', ' ')
        # Capitalize each word
        cleaned = ' '.join(word.capitalize() for word in cleaned.split())
    
    # Pattern 2: "Artist Name -XX- Song Title" or "Artist Name-XX-Song Title"
    if artist:
        # Escape artist name for regex
        artist_escaped = re.escape(artist)
        # Try to match: Artist -XX- Title or Artist-XX-Title
        pattern = rf'^{artist_escaped}\s*-\s*\d+\s*-\s*(.+)$'
        match = re.match(pattern, cleaned, re.IGNORECASE)
        if match:
            cleaned = match.group(1).strip()
    
    # Pattern 3: "-XX- Song Title" (no artist prefix)
    pattern = r'^\s*-\s*\d+\s*-\s*(.+)$'
    match = re.match(pattern, cleaned)
    if match:
        cleaned = match.group(1).strip()
    
    # Pattern 4: "XX. Song Title" or "XX Song Title" (track number prefix)
    # Match 1-3 digit numbers followed by dot/space at the start
    pattern = r'^\s*(\d{1,3})[\.\s]+(.+)$'
    match = re.match(pattern, cleaned)
    if match:
        track_num = int(match.group(1))
        potential_title = match.group(2).strip()
        # Only clean if track number is reasonable (1-999)
        if 1 <= track_num <= 999 and len(potential_title) > 0:
            cleaned = potential_title
    
    # Final cleanup: Remove any remaining leading/trailing dashes, spaces, dots
    cleaned = re.sub(r'^[\s\-\.]+', '', cleaned)  # Remove leading spaces, dashes, dots
    cleaned = re.sub(r'[\s\-\.]+$', '', cleaned)  # Remove trailing spaces, dashes, dots
    cleaned = cleaned.strip()
    
    return cleaned if cleaned else title  # Return original if cleaning resulted in empty string


def _extract_audio_meta(path: Path) -> Dict[str, Any]:
    """Extract audio metadata using mutagen; supports common formats with duration fallback."""
    meta: Dict[str, Any] = {
        "duration_seconds": 0,
        "bitrate": None,
        "sample_rate": None,
        "channels": None,
        "codec": "mp3",
        "title": None,
        "artist": None,
        "album": None,
        "track_number": None,
        "disc_number": None,
        "genre": None,
        "year": None,
        "date": None,
    }
    try:
        audio = MP3(str(path))
        if audio and audio.info:
            meta["duration_seconds"] = int(audio.info.length)
            meta["bitrate"] = int((audio.info.bitrate or 0) / 1000) if audio.info.bitrate else None
            meta["sample_rate"] = audio.info.sample_rate
            meta["channels"] = audio.info.channels
        try:
            tags = EasyID3(str(path))
            raw_title = tags.get("title", [None])[0]
            raw_artist = tags.get("artist", [None])[0]
            
            # Clean up the title if it has artist/track prefixes
            meta["title"] = _clean_song_title(raw_title, raw_artist) if raw_title else None
            meta["artist"] = raw_artist
            meta["album"] = tags.get("album", [None])[0]
            meta["genre"] = tags.get("genre", [None])[0]
            meta["year"] = tags.get("date", [None])[0] or tags.get("originaldate", [None])[0]
            meta["date"] = tags.get("originaldate", [None])[0] or tags.get("date", [None])[0]
            trk = tags.get("tracknumber", [None])[0]
            if trk:
                try:
                    meta["track_number"] = int(str(trk).split("/")[0])
                except Exception:
                    meta["track_number"] = None
            disc = tags.get("discnumber", [None])[0]
            if disc:
                try:
                    meta["disc_number"] = int(str(disc).split("/")[0])
                except Exception:
                    meta["disc_number"] = None
        except Exception:
            pass
    except Exception as e:
        logger.warning(f"Failed to read metadata for {path}: {e}")
    return meta


async def _persist_music(tree_songs: list):
    """Persist artists/albums/songs into the database."""
    async with AsyncSessionLocal() as session:
        def to_int(val):
            if val is None:
                return None
            try:
                return int(str(val).split("-")[0])
            except Exception:
                return None

        artists_persisted = set()
        for item in tree_songs:
            try:
                artist_name = item["artist"]
                artists_persisted.add(artist_name)
                album_title = item["album"]
                song_title = item["title"]
                meta = item.get("meta", {})
                year_val = to_int(meta.get("year"))

                # Artist
                artist_stmt = select(MusicArtist).where(MusicArtist.name == artist_name)
                artist_res = await session.execute(artist_stmt)
                artist = artist_res.scalars().first()
                if not artist:
                    artist = MusicArtist(name=artist_name)
                    session.add(artist)
                    await session.flush()

                # Album
                # First try to find album by title
                album_stmt = select(MusicAlbum).where(MusicAlbum.artist_id == artist.id, MusicAlbum.title == album_title)
                album_res = await session.execute(album_stmt)
                album = album_res.scalars().first()
                
                # If not found by title, check if we have an existing song from the same album directory
                # This allows finding the album even if the user manually changed the title
                if not album and item.get("album_dir"):
                    album_dir_pattern = f"{artist_name}/{item['album_dir']}/%"
                    existing_song_stmt = (
                        select(MusicAlbum)
                        .join(MusicSong, MusicSong.album_id == MusicAlbum.id)
                        .where(MusicAlbum.artist_id == artist.id)
                        .where(MusicSong.file_path.like(album_dir_pattern))
                        .limit(1)
                    )
                    existing_album_res = await session.execute(existing_song_stmt)
                    album = existing_album_res.scalars().first()
                    
                    # DO NOT update the title - preserve manual edits from Music Editor
                    if album and album.title != album_title:
                        logger.info(f"Found album by directory but title differs (DB: '{album.title}', File: '{album_title}'). Preserving DB title.")
                
                if not album:
                    album = MusicAlbum(
                        artist_id=artist.id,
                        title=album_title,
                        year=year_val,
                        genre=meta.get("genre"),
                        cover_path=item.get("album_image"),
                        extra_metadata=meta,
                    )
                    session.add(album)
                    await session.flush()
                else:
                    # DO NOT overwrite year or genre - preserve manual edits from Music Editor
                    # Only fill in if not already set
                    album.year = album.year or year_val
                    album.genre = album.genre or meta.get("genre")
                    # Update cover path only if not set (preserve manual edits)
                    if not album.cover_path and item.get("album_image"):
                        album.cover_path = item.get("album_image")
                    if meta:
                        album.extra_metadata = meta

                # Song - Only add if it doesn't exist (scan now skips existing songs entirely)
                song_stmt = select(MusicSong).where(MusicSong.file_path == item["path"])
                song_res = await session.execute(song_stmt)
                song = song_res.scalars().first()
                if not song:
                    # New song - add with cleaned title from metadata
                    song = MusicSong(
                        album_id=album.id,
                        artist_id=artist.id,
                        title=song_title,
                        track_number=meta.get("track_number"),
                        disc_number=meta.get("disc_number"),
                        duration_seconds=meta.get("duration_seconds"),
                        file_path=item["path"],
                        bitrate=meta.get("bitrate"),
                        sample_rate=meta.get("sample_rate"),
                        channels=meta.get("channels"),
                        codec=meta.get("codec"),
                        genre=meta.get("genre"),
                        year=year_val,
                        extra_metadata=meta,
                    )
                    session.add(song)
                    logger.debug(f"Added new song: '{song_title}' at {item['path']}")
                else:
                    # Song already exists - skip completely (preserve database values)
                    logger.debug(f"Song already exists, skipping: {item['path']}")
            except Exception as e:
                logger.error(f"Failed to persist song {item.get('path')}: {e}", exc_info=True)
                continue

        await session.commit()
        logger.info(f"Persisted {len(tree_songs)} songs for artists: {sorted(artists_persisted)}")


async def _cleanup_deleted_music(base_path: Path):
    """
    Remove songs, albums, and artists from the database if their files no longer exist.
    """
    async with AsyncSessionLocal() as session:
        # Get all songs
        result = await session.execute(select(MusicSong))
        songs = result.scalars().all()
        
        deleted_song_ids = []
        for song in songs:
            file_path = base_path / song.file_path
            if not file_path.exists():
                deleted_song_ids.append(song.id)
                logger.info(f"Marking song for deletion (file not found): {song.file_path}")
        
        # Delete songs
        if deleted_song_ids:
            for song_id in deleted_song_ids:
                song = await session.get(MusicSong, song_id)
                if song:
                    await session.delete(song)
            await session.commit()
            logger.info(f"Deleted {len(deleted_song_ids)} songs with missing files")
        
        # Get all albums and check if they have any songs left
        result = await session.execute(select(MusicAlbum).options(selectinload(MusicAlbum.songs)))
        albums = result.scalars().all()
        
        deleted_album_ids = []
        for album in albums:
            if not album.songs:
                deleted_album_ids.append(album.id)
                logger.info(f"Marking album for deletion (no songs): {album.title}")
        
        # Delete empty albums
        if deleted_album_ids:
            for album_id in deleted_album_ids:
                album = await session.get(MusicAlbum, album_id)
                if album:
                    await session.delete(album)
            await session.commit()
            logger.info(f"Deleted {len(deleted_album_ids)} empty albums")
        
        # Get all artists and check if they have any albums left
        result = await session.execute(select(MusicArtist).options(selectinload(MusicArtist.albums)))
        artists = result.scalars().all()
        
        deleted_artist_ids = []
        for artist in artists:
            if not artist.albums:
                deleted_artist_ids.append(artist.id)
                logger.info(f"Marking artist for deletion (no albums): {artist.name}")
        
        # Delete empty artists
        if deleted_artist_ids:
            for artist_id in deleted_artist_ids:
                artist = await session.get(MusicArtist, artist_id)
                if artist:
                    await session.delete(artist)
            await session.commit()
            logger.info(f"Deleted {len(deleted_artist_ids)} artists with no albums")


@app.get("/api/music/library")
async def get_music_library():
    """
    Load the music library from the database (no filesystem scan).
    Returns the same structure as /api/music/scan but from cached DB data.
    """
    async with AsyncSessionLocal() as session:
        try:
            # Load all artists with their albums and songs
            result = await session.execute(
                select(MusicArtist).options(
                    selectinload(MusicArtist.albums).selectinload(MusicAlbum.songs)
                )
            )
            artists = result.scalars().all()
            
            artists_out = []
            for artist in artists:
                albums_out = []
                for album in artist.albums:
                    songs_out = []
                    for song in album.songs:
                        songs_out.append({
                            "name": song.title or Path(song.file_path).stem,
                            "path": song.file_path,
                            "duration": song.duration_seconds,
                            "track": song.track_number,
                        })
                    
                    # Sort songs by track number
                    songs_out.sort(key=lambda s: s.get("track") or 999)
                    
                    albums_out.append({
                        "name": album.title,
                        "songs": songs_out,
                        "image": album.cover_path,
                        "year": album.year,
                        "date": None,  # Not stored separately in DB
                    })
                
                artists_out.append({
                    "name": artist.name,
                    "image": artist.image_path,
                    "albums": albums_out,
                })
            
            return {
                "success": True,
                "artists": sorted(artists_out, key=lambda a: a["name"].lower())
            }
        except Exception as e:
            logger.error(f"Failed to load music library: {e}", exc_info=True)
            return {"success": False, "error": str(e)}


@app.post("/api/music/clear")
async def clear_music_library():
    """
    Clear all music data from the database (artists, albums, songs, playlists).
    """
    try:
        async with AsyncSessionLocal() as session:
            # Delete all music data in correct order (child tables first)
            await session.execute(delete(MusicPlaylistSong))
            await session.execute(delete(MusicPlaylist))
            await session.execute(delete(MusicSong))
            await session.execute(delete(MusicAlbum))
            await session.execute(delete(MusicArtist))
            await session.commit()
            
            logger.info("Cleared all music data from database")
            return {"success": True, "message": "All music data cleared"}
    except Exception as e:
        logger.error(f"Failed to clear music data: {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


@app.get("/api/music/scan")
async def scan_music_library():
    """
    Scan the user's Music directory for mp3 files in Artist/Album/Song structure.
    Returns a nested tree: { artists: [ { name, albums: [ { name, image, songs: [ { name, path } ] } ] } ] }
    Paths are returned relative to the base music directory and can be streamed via /api/music/stream?path=<relpath>.
    """
    base_path = Path("/Users/davidnorminton/Music")
    if not base_path.exists():
        return {"success": False, "error": f"{base_path} does not exist"}

    tree = defaultdict(lambda: defaultdict(lambda: {"songs": [], "image": None, "year": None, "date": None, "title": None}))  # artist -> album -> {songs, image, year, date, title}
    artist_images: Dict[str, str] = {}
    image_exts = {".jpg", ".jpeg", ".png", ".webp"}
    audio_exts = {".mp3"}
    collected_songs = []
    artist_names_seen = set()
    
    # Load existing albums and songs from database to optimize scanning
    logger.info("Loading existing data from database...")
    existing_albums_with_covers = set()  # Albums that already have covers
    existing_song_paths = set()  # Songs already in DB
    try:
        async with AsyncSessionLocal() as session:
            # Get albums with covers
            result = await session.execute(
                select(MusicArtist.name, MusicAlbum.title, MusicAlbum.cover_path)
                .join(MusicAlbum)
                .where(MusicAlbum.cover_path.isnot(None))
            )
            for artist_name, album_title, cover_path in result.all():
                existing_albums_with_covers.add((artist_name, album_title))
            
            # Get all existing song paths
            result = await session.execute(select(MusicSong.file_path))
            for (file_path,) in result.all():
                existing_song_paths.add(file_path)
                
        logger.info(f"Found {len(existing_albums_with_covers)} albums with covers, {len(existing_song_paths)} existing songs")
    except Exception as e:
        logger.warning(f"Failed to load existing data: {e}")

    # First pass: Group songs by directory structure and extract metadata
    album_metadata = {}  # (artist_dir, album_dir) -> {"artist": "", "album": "", "first_song_meta": {}}
    
    for root, _, files in os.walk(base_path):
        for f in files:
            suffix = Path(f).suffix.lower()
            if suffix not in audio_exts:
                # Capture artist hero image from artist root folder
                full_image_path = Path(root) / f
                try:
                    rel_img = full_image_path.relative_to(base_path)
                    parts_img = rel_img.parts
                    if len(parts_img) == 1 and full_image_path.suffix.lower() in image_exts:
                        artist_dir = parts_img[0]
                        # Prioritize cover.jpg for artist images
                        if f.lower() == "cover.jpg":
                            artist_images[artist_dir] = str(rel_img)
                        elif artist_dir not in artist_images:
                            artist_images[artist_dir] = str(rel_img)
                except Exception:
                    pass
                continue
                
            full_path = Path(root) / f
            try:
                rel = full_path.relative_to(base_path)
                parts = rel.parts
                if len(parts) < 3:
                    # Not in Artist/Album/Song; skip
                    continue
                    
                artist_dir, album_dir = parts[0], parts[1]
                song_filename = Path(parts[-1]).stem
                rel_path = str(full_path.relative_to(base_path))
                
                # Skip existing songs
                if rel_path in existing_song_paths:
                    logger.debug(f"Skipping existing song (already in database): {rel_path}")
                    continue
                
                # Extract metadata from the song
                meta = _extract_audio_meta(full_path)
                title_from_meta = meta.get("title") or song_filename
                
                # On FIRST song in this album directory, capture album name from metadata
                # Artist name comes from directory
                album_key = (artist_dir, album_dir)
                if album_key not in album_metadata:
                    album_from_meta = meta.get("album") or album_dir
                    logger.info(f"First song in album: Artist='{artist_dir}' (directory), Album='{album_from_meta}' (metadata) (from {rel_path})")
                    album_metadata[album_key] = {
                        "artist": artist_dir,  # Use directory name for artist
                        "album": album_from_meta,
                        "year": meta.get("year"),
                        "date": meta.get("date"),
                        "genre": meta.get("genre")
                    }
                
                # Use artist from directory, album from metadata
                artist_name = artist_dir
                album_name = album_metadata[album_key]["album"]
                artist_names_seen.add(artist_name)
                
                # Add song to tree
                if not tree[artist_name][album_name]["title"]:
                    tree[artist_name][album_name]["title"] = album_name
                    
                tree[artist_name][album_name]["songs"].append(
                    {
                        "name": title_from_meta,
                        "path": rel_path,
                        "duration": meta.get("duration_seconds"),
                        "track_number": meta.get("track_number"),
                    }
                )
                
                # Capture year/date for album (from first song)
                if album_metadata[album_key]["year"] and not tree[artist_name][album_name]["year"]:
                    try:
                        tree[artist_name][album_name]["year"] = int(str(album_metadata[album_key]["year"]).split("-")[0])
                    except Exception:
                        pass
                if album_metadata[album_key]["date"] and not tree[artist_name][album_name]["date"]:
                    tree[artist_name][album_name]["date"] = album_metadata[album_key]["date"]
                
                # Add to collected songs for persistence
                collected_songs.append(
                    {
                        "artist": artist_name,
                        "album": album_name,
                        "album_dir": album_dir,
                        "title": title_from_meta,
                        "path": rel_path,
                        "album_image": None,
                        "meta": meta,
                    }
                )
            except Exception as e:
                logger.warning(f"Error processing {full_path}: {e}")
                continue

        # Try to find an album cover in this directory if not already set
        current_dir = Path(root)
        rel_album = None
        try:
          rel_album = current_dir.relative_to(base_path)
        except Exception:
          rel_album = None
        if rel_album and len(rel_album.parts) >= 2:
            artist_dir, album_dir_name = rel_album.parts[0], rel_album.parts[1]
            # Look up the actual artist/album names from metadata
            album_key = (artist_dir, album_dir_name)
            if album_key in album_metadata:
                artist_name = album_metadata[album_key]["artist"]
                album_name = album_metadata[album_key]["album"]
                if tree[artist_name][album_name]["image"] is None:
                    for img in current_dir.iterdir():
                        if img.is_file() and img.suffix.lower() in image_exts:
                            rel_img = str(img.relative_to(base_path))
                            tree[artist_name][album_name]["image"] = rel_img
                            # update collected_songs album_image for this album
                            for cs in collected_songs:
                                if cs["artist"] == artist_name and cs["album"] == album_name:
                                    cs["album_image"] = rel_img
                            break

    # Extract album covers from MP3 metadata or download from MusicBrainz
    logger.info("Checking for missing album covers...")
    for artist_name, albums in tree.items():
        for album_name, album_data in albums.items():
            if album_data["image"] is None:
                # Skip cover extraction/download if album already has cover in database
                if (artist_name, album_name) in existing_albums_with_covers:
                    logger.debug(f"Skipping cover extraction for {artist_name} - {album_name} (already has cover in DB)")
                    continue
                
                # Find the directory path for this album from collected_songs
                album_dir_path = None
                for cs in collected_songs:
                    if cs["artist"] == artist_name and cs["album"] == album_name:
                        # Extract directory from path (e.g., "Artist Dir/Album Dir/song.mp3" -> "Artist Dir/Album Dir")
                        song_path_parts = Path(cs["path"]).parts
                        if len(song_path_parts) >= 2:
                            album_dir_path = base_path / song_path_parts[0] / song_path_parts[1]
                            break
                
                if not album_dir_path:
                    logger.warning(f"Could not determine directory path for {artist_name} - {album_name}")
                    continue
                
                # Try to extract from first MP3 in the album
                logger.info(f"No cover image file for {artist_name} - {album_name}, trying to extract from MP3...")
                extracted_cover = None
                for song in album_data["songs"]:
                    song_path = base_path / song["path"]
                    if song_path.exists():
                        extracted_cover = _extract_album_art_from_mp3(song_path, album_dir_path)
                        if extracted_cover:
                            logger.info(f"Successfully extracted cover art from {song_path.name}")
                            break
                
                if extracted_cover:
                    album_data["image"] = extracted_cover
                    # Update collected_songs with the new cover
                    for cs in collected_songs:
                        if cs["artist"] == artist_name and cs["album"] == album_name:
                            cs["album_image"] = extracted_cover
                elif album_name:
                    # If still no cover, try MusicBrainz as last resort
                    logger.info(f"No embedded cover art, trying MusicBrainz for {artist_name} - {album_name}...")
                    downloaded_cover = await _download_album_cover(artist_name, album_name, album_dir_path)
                    if downloaded_cover:
                        album_data["image"] = downloaded_cover
                        # Update collected_songs with the new cover
                        for cs in collected_songs:
                            if cs["artist"] == artist_name and cs["album"] == album_name:
                                cs["album_image"] = downloaded_cover

    artists_out = []
    for artist_name, albums in tree.items():
        # artist_name is the directory name, so we can look it up directly
        albums_out = []
        for album_name, album_data in albums.items():
            albums_out.append(
                {
                    "name": album_name,  # Use metadata album name
                    "songs": album_data["songs"],
                    "image": album_data.get("image"),
                    "year": album_data.get("year"),
                    "date": album_data.get("date"),
                }
            )
        
        # Use artist image from directory (artist_name is the directory name)
        artist_img = artist_images.get(artist_name)
        artists_out.append({"name": artist_name, "image": artist_img, "albums": albums_out})

    # Persist to DB
    try:
        total_songs = len(collected_songs)
        new_songs = len([s for s in collected_songs if s["path"] not in existing_song_paths])
        await _persist_music(collected_songs)
        logger.info(f"Scan complete. Artists found: {sorted(artist_names_seen)}")
        logger.info(f"Total songs: {total_songs}, New songs: {new_songs}, Skipped: {len(existing_song_paths)}")
    except Exception as e:
        logger.error(f"Failed to persist music library: {e}", exc_info=True)

    # Clean up deleted files from database
    try:
        await _cleanup_deleted_music(base_path)
        logger.info("Cleanup of deleted music files complete")
    except Exception as e:
        logger.error(f"Failed to cleanup deleted music: {e}", exc_info=True)

    return {"success": True, "artists": sorted(artists_out, key=lambda a: a["name"].lower()), "found_artists": sorted(artist_names_seen)}


@app.get("/api/music/stream")
async def stream_music_file(path: str):
    """
    Stream a music (or image) file from the user's Music directory.
    """
    base_path = Path("/Users/davidnorminton/Music").resolve()
    # Accept relative paths (preferred) and absolute paths under base for safety
    raw_path = Path(path)
    if raw_path.is_absolute():
        target = raw_path.resolve()
    else:
        target = (base_path / path).resolve()

    if not str(target).startswith(str(base_path)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    media_type, _ = mimetypes.guess_type(str(target))
    return FileResponse(str(target), media_type=media_type or "application/octet-stream")


@app.get("/api/music/metadata")
async def music_metadata(path: str):
    """
    Return simple metadata (duration seconds) for an mp3 under Music.
    """
    base_path = Path("/Users/davidnorminton/Music").resolve()
    raw_path = Path(path)
    if raw_path.is_absolute():
        target = raw_path.resolve()
    else:
        target = (base_path / path).resolve()
    if not str(target).startswith(str(base_path)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        import mutagen
        from mutagen.mp3 import MP3
        audio = MP3(str(target))
        dur = int(audio.info.length) if audio and audio.info else 0
    except Exception:
        dur = 0
    return {"duration": dur}


class PopularRequest(BaseModel):
    artist: str


class AboutRequest(BaseModel):
    artist: str


class DiscographyRequest(BaseModel):
    artist: str


def _extract_json_object(payload: str):
    if not payload:
        return None
    try:
        return json.loads(payload)
    except Exception:
        pass
    try:
        start = payload.find("{")
        end = payload.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(payload[start : end + 1])
    except Exception:
        return None
    return None


def _match_popular_items(ai_items: List[Dict[str, Any]], songs_data: List[Dict[str, Any]]):
    matched = []
    seen_paths = set()
    for entry in ai_items or []:
        title = (entry.get("title") or entry.get("name") or "").strip()
        album = (entry.get("album") or entry.get("album_title") or "").strip()
        if not title:
            continue
        title_l = title.lower()
        album_l = album.lower() if album else None
        candidate = None
        if album_l:
            candidate = next(
                (s for s in songs_data if s["title"].lower() == title_l and s["album"].lower() == album_l),
                None,
            )
        if not candidate:
            candidate = next((s for s in songs_data if s["title"].lower() == title_l), None)
        if candidate and candidate["path"] not in seen_paths:
            matched.append(candidate)
            seen_paths.add(candidate["path"])
        if len(matched) >= 20:
            break
    return matched


async def _ensure_artist_in_db(session: AsyncSessionLocal, artist_name: str):
    """
    Ensure an artist exists in DB. If missing, trigger a rescan and retry.
    Returns the artist row or None. Also logs available artists when missing.
    """
    name_norm = (artist_name or "").strip().lower()

    async def _fetch_exact(s):
        return await s.scalar(select(MusicArtist).where(func.lower(MusicArtist.name) == name_norm))

    async def _fetch_like(s):
        return await s.scalar(select(MusicArtist).where(MusicArtist.name.ilike(artist_name)))

    logger.debug(f"Looking for artist: '{artist_name}'")
    artist_row = await _fetch_exact(session)
    if artist_row:
        logger.debug(f"Artist '{artist_name}' found in DB")
        return artist_row

    logger.info(f"Artist '{artist_name}' not found, attempting rescan...")
    try:
        await scan_music_library()
        logger.info(f"Rescan completed, querying for artist '{artist_name}' again with fresh session...")
    except Exception as e:
        logger.error(f"Rescan failed while ensuring artist '{artist_name}': {e}", exc_info=True)
        return None

    # Use a fresh session after rescan to avoid stale state
    async with AsyncSessionLocal() as fresh:
        artist_row = await _fetch_exact(fresh)
        if not artist_row:
            artist_row = await _fetch_like(fresh)

        if artist_row:
            logger.info(f"Artist '{artist_name}' found after rescan")
            return artist_row

        all_artists_res = await fresh.execute(select(MusicArtist.name))
        artist_names = [a[0] for a in all_artists_res.all()]
        logger.warning(
            f"Artist '{artist_name}' still not found after rescan. Available artists: {artist_names}"
        )
        return None


@app.get("/api/music/popular")
async def get_music_popular(artist: str):
    """
    Return cached popular songs for the artist from DB (extra_metadata.popular_songs).
    """
    try:
        async with AsyncSessionLocal() as session:
            artist_row = await _ensure_artist_in_db(session, artist)
            if not artist_row:
                logger.warning(f"Artist '{artist}' not found in database after rescan attempt, forcing rescan and requery")
                try:
                    await scan_music_library()
                except Exception as e:
                    logger.error(f"Forced rescan failed for artist '{artist}': {e}", exc_info=True)
                # Use a fresh session after forced rescan
                async with AsyncSessionLocal() as fresh:
                    artist_row = await fresh.scalar(
                        select(MusicArtist).where(func.lower(MusicArtist.name) == artist.lower())
                    )
                    if not artist_row:
                        all_artists_res = await fresh.execute(select(MusicArtist.name))
                        artist_names = [a[0] for a in all_artists_res.all()]
                        return JSONResponse(
                            status_code=200,
                            content={"success": False, "error": "Artist not found", "artists": artist_names},
                        )
            meta = artist_row.extra_metadata or {}
            popular = meta.get("popular_songs") or []
            return {"success": True, "popular": popular}
    except Exception as e:
        logger.error(f"Error getting popular songs for '{artist}': {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


@app.post("/api/music/popular")
async def generate_music_popular(req: PopularRequest):
    """
    Use AI to pick up to 20 popular songs from the albums we have for an artist.
    Stores the list in artist.extra_metadata.popular_songs and returns it.
    """
    artist_name = req.artist.strip()
    if not artist_name:
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": "artist is required"}
        )

    try:
        async with AsyncSessionLocal() as session:
            artist_row = await _ensure_artist_in_db(session, artist_name)
            if not artist_row:
                logger.warning(f"Artist '{artist_name}' not found in database after rescan attempt, forcing rescan and requery")
                try:
                    await scan_music_library()
                except Exception as e:
                    logger.error(f"Forced rescan failed for artist '{artist_name}': {e}", exc_info=True)
                async with AsyncSessionLocal() as fresh:
                    artist_row = await fresh.scalar(
                        select(MusicArtist).where(func.lower(MusicArtist.name) == artist_name.lower())
                    )
                    if not artist_row:
                        all_artists_res = await fresh.execute(select(MusicArtist.name))
                        artist_names = [a[0] for a in all_artists_res.all()]
                        return JSONResponse(
                            status_code=200,
                            content={"success": False, "error": "Artist not found", "artists": artist_names},
                        )

            # Check if we already have popular songs cached - return them if so
            if artist_row.extra_metadata and artist_row.extra_metadata.get("popular_songs"):
                logger.info(f"Returning existing popular songs cache for '{artist_name}'")
                return {"success": True, "popular": artist_row.extra_metadata["popular_songs"]}

            # Generate new popular songs if not cached
            result = await session.execute(
                select(MusicSong, MusicAlbum)
                .join(MusicAlbum, MusicSong.album_id == MusicAlbum.id)
                .where(MusicSong.artist_id == artist_row.id)
            )
            rows = result.all()
            if not rows:
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "No songs found for this artist"}
                )

            songs_data = []
            albums_map: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
            for song, album in rows:
                item = {
                    "title": song.title,
                    "album": album.title,
                    "track_number": song.track_number,
                    "duration": song.duration_seconds,
                    "path": song.file_path,
                }
                songs_data.append(item)
                albums_map[album.title].append(item)

            # Build album/song list for AI
            album_lines = []
            for album_title, tracks in albums_map.items():
                sorted_tracks = sorted(tracks, key=lambda t: t.get("track_number") or 9999)
                album_lines.append(f"- Album: {album_title}")
                for t in sorted_tracks:
                    tn = t.get("track_number")
                    tn_str = f"{tn}. " if tn else ""
                    album_lines.append(f"  - {tn_str}{t['title']}")
            
            system_prompt = """You are a music database API that returns ONLY valid JSON responses.
Never include explanations, commentary, or additional text.
Your response must be pure JSON that can be parsed directly."""

            user_prompt = f"""Select the most popular songs for artist '{artist_name}'.

Only choose songs that appear in the provided list. If you are unsure, skip it.

Return JSON in this format: {{"songs": [{{"title": "song title", "album": "album title"}}]}}

Select at most 20 of the most popular/well-known songs.

Albums and songs available:
""" + "\n".join(album_lines)

            ai = AIService()
            ai_resp = await ai.execute_with_system_prompt(user_prompt, system_prompt, max_tokens=2048)
            raw_answer = ai_resp.get("answer", "") if isinstance(ai_resp, dict) else ""
            parsed = _extract_json_object(raw_answer) or {}
            popular_items = parsed.get("songs") if isinstance(parsed, dict) else None
            matched = _match_popular_items(popular_items or [], songs_data)

            # Fallback to first 10 tracks if AI failed
            if not matched:
                matched = songs_data[:10]

            artist_row.extra_metadata = artist_row.extra_metadata or {}
            artist_row.extra_metadata["popular_songs"] = matched
            flag_modified(artist_row, "extra_metadata")
            await session.commit()

            return {"success": True, "popular": matched}
    except Exception as e:
        logger.error(f"Error generating popular songs for '{artist_name}': {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


@app.get("/api/music/artist/about")
async def get_artist_about(artist: str):
    """
    Retrieve cached about info for an artist.
    """
    artist_name = artist.strip()
    if not artist_name:
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": "artist is required"}
        )

    try:
        async with AsyncSessionLocal() as session:
            artist_row = await session.scalar(
                select(MusicArtist).where(func.lower(MusicArtist.name) == artist_name.lower())
            )
            if not artist_row:
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Artist not found"}
                )

            # Return cached about info if it exists
            if artist_row.extra_metadata and artist_row.extra_metadata.get("about"):
                return {"success": True, "about": artist_row.extra_metadata["about"]}
            else:
                return {"success": True, "about": None}
    except Exception as e:
        logger.error(f"Error fetching about info for '{artist_name}': {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


@app.post("/api/music/artist/about")
async def generate_artist_about(req: AboutRequest):
    """
    Use AI to generate a summary about the artist in 250 words or less.
    Stores the summary in artist.extra_metadata.about and returns it.
    """
    artist_name = req.artist.strip()
    if not artist_name:
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": "artist is required"}
        )

    try:
        async with AsyncSessionLocal() as session:
            artist_row = await _ensure_artist_in_db(session, artist_name)
            if not artist_row:
                logger.warning(f"Artist '{artist_name}' not found in database")
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Artist not found"}
                )

            # Check if we already have about info cached - return it if so
            if artist_row.extra_metadata and artist_row.extra_metadata.get("about"):
                logger.info(f"Returning existing about info cache for '{artist_name}'")
                return {"success": True, "about": artist_row.extra_metadata["about"]}

            # Generate about info using AI
            prompt = f"Write a concise summary about the band/artist '{artist_name}' in 250 words or less. Include their musical style, notable achievements, and influence. Be factual and informative."

            ai = AIService()
            await ai.reload_persona_config()
            ai_resp = await ai.execute({"question": prompt})
            about_text = ai_resp.get("answer", "") if isinstance(ai_resp, dict) else ""

            if not about_text:
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Failed to generate about info"}
                )

            # Store in database
            artist_row.extra_metadata = artist_row.extra_metadata or {}
            artist_row.extra_metadata["about"] = about_text
            flag_modified(artist_row, "extra_metadata")
            await session.commit()

            return {"success": True, "about": about_text}
    except Exception as e:
        logger.error(f"Error generating about info for '{artist_name}': {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


@app.get("/api/music/artist/discography")
async def get_artist_discography(artist: str):
    """
    Retrieve cached discography for an artist.
    """
    artist_name = artist.strip()
    if not artist_name:
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": "artist is required"}
        )

    try:
        async with AsyncSessionLocal() as session:
            artist_row = await session.scalar(
                select(MusicArtist).where(func.lower(MusicArtist.name) == artist_name.lower())
            )
            if not artist_row:
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Artist not found"}
                )

            # Return cached discography if it exists
            if artist_row.extra_metadata and artist_row.extra_metadata.get("discography"):
                return {"success": True, "discography": artist_row.extra_metadata["discography"]}
            else:
                return {"success": True, "discography": None}
    except Exception as e:
        logger.error(f"Error fetching discography for '{artist_name}': {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


@app.post("/api/music/artist/discography")
async def generate_artist_discography(req: DiscographyRequest):
    """
    Use AI to generate a list of all studio albums by the artist.
    Stores the list in artist.extra_metadata.discography and returns it.
    """
    artist_name = req.artist.strip()
    logger.info(f"=== DISCOGRAPHY REQUEST for '{artist_name}' ===")
    
    if not artist_name:
        logger.error("No artist name provided")
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": "artist is required"}
        )

    try:
        async with AsyncSessionLocal() as session:
            logger.info(f"Looking up artist '{artist_name}' in database...")
            artist_row = await _ensure_artist_in_db(session, artist_name)
            if not artist_row:
                logger.warning(f"Artist '{artist_name}' not found in database")
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Artist not found"}
                )
            
            logger.info(f"Artist found: {artist_row.name} (id={artist_row.id})")

            # Check if we already have discography cached - return it if so
            if artist_row.extra_metadata and artist_row.extra_metadata.get("discography"):
                logger.info(f"Returning existing discography cache for '{artist_name}'")
                return {"success": True, "discography": artist_row.extra_metadata["discography"]}

            # Generate discography using AI with default config (bypass persona)
            system_prompt = """You are a music database API that returns ONLY valid JSON responses.
Never include explanations, commentary, greetings, or additional text.
Your response must be pure JSON that can be parsed directly."""

            user_prompt = f"""List all official studio albums by '{artist_name}' in chronological order.

Include ONLY official studio albums (no live albums, compilations, EPs, singles, or bootlegs).

Return valid JSON in this EXACT format:
{{"albums": [{{"year": 1977, "title": "Album Title"}}, {{"year": 1979, "title": "Another Album"}}]}}"""

            logger.info(f"Sending prompt to AI (bypassing persona):\n{user_prompt[:200]}...")
            ai = AIService()
            ai_resp = await ai.execute_with_system_prompt(user_prompt, system_prompt, max_tokens=2048)
            raw_answer = ai_resp.get("answer", "") if isinstance(ai_resp, dict) else ""
            
            logger.info(f"AI Response (raw): {raw_answer[:500]}...")
            logger.info(f"AI Response length: {len(raw_answer)} chars")
            
            # Clean up response - remove markdown code blocks if present
            cleaned = raw_answer.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
            logger.info(f"Cleaned response: {cleaned[:500]}...")

            # Try to extract JSON from response
            parsed = _extract_json_object(cleaned) or {}
            logger.info(f"Parsed JSON object: {parsed}")
            
            albums_list = parsed.get("albums") if isinstance(parsed, dict) else None
            logger.info(f"Albums list extracted: {albums_list}")

            if not albums_list or not isinstance(albums_list, list):
                logger.error(f"Failed to parse albums list. Parsed type: {type(parsed)}, albums_list type: {type(albums_list)}")
                logger.error(f"Full raw response: {raw_answer}")
                error_msg = "AI returned invalid format. Expected JSON with 'albums' array."
                if not parsed:
                    error_msg = "Could not find valid JSON in AI response."
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": error_msg, "debug": {"raw": raw_answer[:500], "parsed": str(parsed)}}
                )

            # Sort by year
            albums_list = sorted(albums_list, key=lambda x: x.get("year", 9999))
            logger.info(f"Sorted albums list: {albums_list}")

            # Store in database
            artist_row.extra_metadata = artist_row.extra_metadata or {}
            artist_row.extra_metadata["discography"] = albums_list
            flag_modified(artist_row, "extra_metadata")
            await session.commit()
            
            logger.info(f"Successfully stored {len(albums_list)} albums for '{artist_name}'")
            return {"success": True, "discography": albums_list}
    except Exception as e:
        logger.error(f"Error generating discography for '{artist_name}': {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


@app.get("/api/music/artist/videos")
async def get_artist_videos(artist: str):
    """
    Retrieve cached YouTube videos for an artist.
    """
    artist_name = artist.strip()
    if not artist_name:
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": "artist is required"}
        )

    try:
        async with AsyncSessionLocal() as session:
            artist_row = await session.scalar(
                select(MusicArtist).where(func.lower(MusicArtist.name) == artist_name.lower())
            )
            if not artist_row:
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Artist not found"}
                )

            # Return cached videos if they exist
            if artist_row.extra_metadata and artist_row.extra_metadata.get("videos"):
                return {"success": True, "videos": artist_row.extra_metadata["videos"]}
            else:
                return {"success": True, "videos": None}
    except Exception as e:
        logger.error(f"Error fetching videos for '{artist_name}': {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


class VideosRequest(BaseModel):
    artist: str


@app.delete("/api/music/artist/videos")
async def clear_all_videos():
    """
    Clear all cached video data from all artists.
    """
    try:
        async with AsyncSessionLocal() as session:
            # Get all artists
            result = await session.execute(select(MusicArtist))
            artists = result.scalars().all()
            
            cleared_count = 0
            for artist in artists:
                if artist.extra_metadata and artist.extra_metadata.get("videos"):
                    artist.extra_metadata.pop("videos", None)
                    flag_modified(artist, "extra_metadata")
                    cleared_count += 1
            
            await session.commit()
            
            return {"success": True, "cleared": cleared_count, "message": f"Cleared videos from {cleared_count} artists"}
    except Exception as e:
        logger.error(f"Error clearing videos: {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


@app.post("/api/music/cleanup/titles")
async def cleanup_song_titles():
    """
    Clean up all song titles in the database that have artist/track prefixes.
    Also clears the popular songs cache so they can be regenerated with clean titles.
    """
    try:
        async with AsyncSessionLocal() as session:
            # Get all songs
            result = await session.execute(select(MusicSong).join(MusicArtist, MusicSong.artist_id == MusicArtist.id))
            songs = result.scalars().all()
            
            cleaned_count = 0
            for song in songs:
                # Check if title needs cleaning (has various bad patterns)
                needs_cleaning = False
                if song.title:
                    # Pattern: "-XX-" or "XX." or "XX-artistname-title"
                    if (re.search(r'-\s*\d+\s*-\s*', song.title) or 
                        re.match(r'^\s*\d{1,3}[\.\s]+', song.title) or
                        re.match(r'^\s*\d{1,3}-[^-]+-', song.title)):
                        needs_cleaning = True
                
                if needs_cleaning:
                    # Get the artist name for cleaning
                    artist_result = await session.execute(
                        select(MusicArtist).where(MusicArtist.id == song.artist_id)
                    )
                    artist = artist_result.scalars().first()
                    artist_name = artist.name if artist else None
                    
                    # Clean the title
                    cleaned_title = _clean_song_title(song.title, artist_name)
                    if cleaned_title != song.title:
                        logger.info(f"Cleaning title: '{song.title}' -> '{cleaned_title}'")
                        song.title = cleaned_title
                        cleaned_count += 1
            
            # Also clear popular songs cache from all artists so they get regenerated
            result = await session.execute(select(MusicArtist))
            artists = result.scalars().all()
            cleared_popular = 0
            for artist in artists:
                if artist.extra_metadata and artist.extra_metadata.get("popular_songs"):
                    artist.extra_metadata.pop("popular_songs", None)
                    flag_modified(artist, "extra_metadata")
                    cleared_popular += 1
            
            await session.commit()
            
            return {
                "success": True, 
                "cleaned": cleaned_count, 
                "popular_cleared": cleared_popular,
                "message": f"Cleaned {cleaned_count} song titles and cleared popular songs cache from {cleared_popular} artists"
            }
    except Exception as e:
        logger.error(f"Error cleaning song titles: {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


@app.post("/api/music/artist/videos")
async def generate_artist_videos(req: VideosRequest):
    """
    Use AI to generate a list of official YouTube videos for the artist.
    Stores the list in artist.extra_metadata.videos and returns it.
    """
    artist_name = req.artist.strip()
    if not artist_name:
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": "artist is required"}
        )

    try:
        async with AsyncSessionLocal() as session:
            artist_row = await _ensure_artist_in_db(session, artist_name)
            if not artist_row:
                logger.warning(f"Artist '{artist_name}' not found in database")
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Artist not found"}
                )

            # Check if we already have videos cached - return them if so
            if artist_row.extra_metadata and artist_row.extra_metadata.get("videos"):
                logger.info(f"Returning existing videos cache for '{artist_name}'")
                return {"success": True, "videos": artist_row.extra_metadata["videos"]}

            # Generate video list using AI with default config (bypass persona)
            system_prompt = """You are a music database API that returns ONLY valid JSON responses.
Never include explanations, commentary, or additional text.
Your response must be pure JSON that can be parsed directly."""

            user_prompt = f"""List 6-8 official YouTube videos for '{artist_name}' that are DEFINITELY available worldwide.

CRITICAL REQUIREMENTS - Only include videos that meet ALL of these:
- From official VEVO channel (e.g., "ArtistVEVO") or verified artist channel
- Major worldwide releases from international record labels (Universal, Sony, Warner, etc.)
- Released globally with no regional restrictions
- The artist's biggest international hits that would be available in UK, US, EU, etc.
- NOT live performances, NOT unofficial uploads, NOT smaller releases

AVOID:
- Regional-only releases
- Live concerts/bootlegs
- Fan uploads
- Country-specific content
- Older videos that may have expired licenses

Return JSON in this EXACT format:
{{
  "videos": [
    {{"videoId": "abc12345678", "title": "Song Name (Official Music Video)"}},
    {{"videoId": "def98765432", "title": "Another Song (Official Video)"}}
  ]
}}

Be conservative - better to return fewer videos that definitely work globally than include questionable ones."""

            ai = AIService()
            ai_resp = await ai.execute_with_system_prompt(user_prompt, system_prompt, max_tokens=2048)
            raw_answer = ai_resp.get("answer", "") if isinstance(ai_resp, dict) else ""

            # Try to extract JSON from response
            logger.info(f"AI raw answer for videos: {raw_answer[:500]}")
            parsed = _extract_json_object(raw_answer) or {}
            logger.info(f"Parsed videos data: {parsed}")
            videos_list = parsed.get("videos") if isinstance(parsed, dict) else None

            if not videos_list or not isinstance(videos_list, list):
                logger.warning(f"Failed to parse videos list. Parsed: {parsed}, videos_list: {videos_list}")
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Failed to generate videos list"}
                )

            # Validate video IDs and check if they're actually available
            validated_videos = []
            for video in videos_list:
                if isinstance(video, dict) and "videoId" in video and "title" in video:
                    video_id = str(video["videoId"]).strip()
                    # YouTube video IDs are typically 11 characters
                    if len(video_id) >= 8:  # Allow some flexibility
                        # Verify video exists and is embeddable using YouTube oEmbed (no API key needed)
                        if await _verify_youtube_video(video_id):
                            validated_videos.append({
                                "videoId": video_id,
                                "title": video["title"]
                            })
                            logger.info(f"✓ Video validated: {video_id} - {video['title']}")
                        else:
                            logger.warning(f"✗ Video failed validation: {video_id} - {video['title']}")

            if not validated_videos:
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "No valid/available videos found. Videos may be region-restricted or unavailable."}
                )

            # Store in database
            artist_row.extra_metadata = artist_row.extra_metadata or {}
            artist_row.extra_metadata["videos"] = validated_videos
            flag_modified(artist_row, "extra_metadata")
            await session.commit()

            return {"success": True, "videos": validated_videos}
    except Exception as e:
        logger.error(f"Error generating videos for '{artist_name}': {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


async def _verify_youtube_video(video_id: str) -> bool:
    """
    Verify a YouTube video exists and is embeddable using oEmbed API (no API key required).
    Returns True if video is available, False otherwise.
    """
    try:
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(oembed_url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status == 200:
                    data = await response.json()
                    # If oEmbed returns data, the video exists and is embeddable
                    return "title" in data
                else:
                    return False
    except asyncio.TimeoutError:
        logger.warning(f"Timeout verifying video: {video_id}")
        return False
    except Exception as e:
        logger.warning(f"Error verifying video {video_id}: {e}")
        return False


async def _ensure_playlist_tables():
    # Ensure playlist tables exist (lightweight guard)
    async with engine.begin() as conn:
        await conn.run_sync(MusicPlaylist.__table__.create, checkfirst=True)
        await conn.run_sync(MusicPlaylistSong.__table__.create, checkfirst=True)


class PlaylistCreate(BaseModel):
    name: str


class PlaylistAddSong(BaseModel):
    playlist_id: Optional[int] = None
    name: Optional[str] = None
    path: str
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None
    track_number: Optional[int] = None
    duration_seconds: Optional[int] = None


@app.get("/api/music/playlists")
async def list_playlists():
    try:
        await _ensure_playlist_tables()
        async with AsyncSessionLocal() as session:
            playlists = await session.execute(select(MusicPlaylist))
            playlists = playlists.scalars().all()
            result = []
            for pl in playlists:
                songs_res = await session.execute(
                    select(MusicPlaylistSong).where(MusicPlaylistSong.playlist_id == pl.id).order_by(MusicPlaylistSong.id)
                )
                songs = songs_res.scalars().all()
                playlist_songs = []
                for s in songs:
                    # Try to get artist/album from MusicSong if missing in playlist song
                    artist_name = s.artist or None
                    album_name = s.album or None
                    if not artist_name or not album_name:
                        try:
                            song_lookup = await session.execute(
                                select(MusicArtist.name.label('artist_name'), MusicAlbum.title.label('album_title'))
                                .select_from(MusicSong)
                                .join(MusicArtist, MusicSong.artist_id == MusicArtist.id)
                                .join(MusicAlbum, MusicSong.album_id == MusicAlbum.id)
                                .where(MusicSong.file_path == s.file_path)
                                .limit(1)
                            )
                            row = song_lookup.first()
                            if row:
                                if not artist_name:
                                    artist_name = row.artist_name
                                if not album_name:
                                    album_name = row.album_title
                        except Exception as e:
                            logger.warning(f"Failed to lookup song metadata for {s.file_path}: {e}")
                            # Continue with existing values or None
                    playlist_songs.append(
                        {
                            "id": s.id,
                            "path": s.file_path,
                            "name": s.title,
                            "title": s.title,
                            "artist": artist_name,
                            "album": album_name,
                            "track_number": s.track_number,
                            "duration": s.duration_seconds,
                        }
                    )
                result.append(
                    {
                        "id": pl.id,
                        "name": pl.name,
                        "songs": playlist_songs,
                    }
                )
            return {"success": True, "playlists": result}
    except Exception as e:
        logger.error(f"Failed to list playlists: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/api/music/playlists")
async def create_playlist(payload: PlaylistCreate):
    await _ensure_playlist_tables()
    name = payload.name.strip()
    if not name:
        return {"success": False, "error": "name is required"}
    async with AsyncSessionLocal() as session:
        try:
            exists = await session.scalar(select(MusicPlaylist).where(func.lower(MusicPlaylist.name) == name.lower()))
            if exists:
                return {"success": True, "playlist": {"id": exists.id, "name": exists.name}}
            pl = MusicPlaylist(name=name)
            session.add(pl)
            await session.commit()
            await session.refresh(pl)
            return {"success": True, "playlist": {"id": pl.id, "name": pl.name}}
        except Exception as e:
            logger.error(f"Failed to create playlist '{name}': {e}", exc_info=True)
            return {"success": False, "error": str(e)}


@app.post("/api/music/playlists/add")
async def add_song_to_playlist(payload: PlaylistAddSong):
    await _ensure_playlist_tables()
    name = (payload.name or "").strip()
    playlist_id = payload.playlist_id
    if not playlist_id and not name:
        return {"success": False, "error": "playlist_id or name required"}
    async with AsyncSessionLocal() as session:
        try:
            playlist = None
            if playlist_id:
                playlist = await session.get(MusicPlaylist, playlist_id)
            if not playlist and name:
                playlist = await session.scalar(select(MusicPlaylist).where(func.lower(MusicPlaylist.name) == name.lower()))
            if not playlist:
                playlist = MusicPlaylist(name=name or "New Playlist")
                session.add(playlist)
                await session.flush()
            # Deduplicate by file_path
            existing = await session.scalar(
                select(MusicPlaylistSong).where(
                    MusicPlaylistSong.playlist_id == playlist.id, MusicPlaylistSong.file_path == payload.path
                )
            )
            if not existing:
                # Look up artist/album from MusicSong if not provided
                artist_name = payload.artist
                album_name = payload.album
                if not artist_name or not album_name:
                    try:
                        song_lookup = await session.execute(
                            select(MusicArtist.name.label('artist_name'), MusicAlbum.title.label('album_title'))
                            .select_from(MusicSong)
                            .join(MusicArtist, MusicSong.artist_id == MusicArtist.id)
                            .join(MusicAlbum, MusicSong.album_id == MusicAlbum.id)
                            .where(MusicSong.file_path == payload.path)
                            .limit(1)
                        )
                        row = song_lookup.first()
                        if row:
                            if not artist_name:
                                artist_name = row.artist_name
                            if not album_name:
                                album_name = row.album_title
                    except Exception as e:
                        logger.warning(f"Failed to lookup song metadata for {payload.path}: {e}")
                        # Continue with existing values or None
                ps = MusicPlaylistSong(
                    playlist_id=playlist.id,
                    file_path=payload.path,
                    title=payload.title,
                    artist=artist_name,
                    album=album_name,
                    track_number=payload.track_number,
                    duration_seconds=payload.duration_seconds,
                )
                session.add(ps)
            await session.commit()
            return {"success": True, "playlist_id": playlist.id}
        except Exception as e:
            logger.error(f"Failed to add to playlist '{name or playlist_id}': {e}", exc_info=True)
            return {"success": False, "error": str(e)}


@app.delete("/api/music/playlists/remove")
async def remove_song_from_playlist(playlist_name: str, song_path: str):
    """Remove a song from a playlist by playlist name and song file path."""
    await _ensure_playlist_tables()
    if not playlist_name or not song_path:
        return {"success": False, "error": "playlist_name and song_path required"}
    
    async with AsyncSessionLocal() as session:
        try:
            # Find playlist by name
            playlist = await session.scalar(
                select(MusicPlaylist).where(func.lower(MusicPlaylist.name) == playlist_name.lower())
            )
            if not playlist:
                return {"success": False, "error": f"Playlist '{playlist_name}' not found"}
            
            # Find and delete the playlist song entry
            result = await session.execute(
                select(MusicPlaylistSong).where(
                    MusicPlaylistSong.playlist_id == playlist.id,
                    MusicPlaylistSong.file_path == song_path
                )
            )
            playlist_song = result.scalars().first()
            
            if not playlist_song:
                return {"success": False, "error": "Song not found in playlist"}
            
            await session.delete(playlist_song)
            await session.commit()
            
            return {"success": True, "message": f"Song removed from playlist '{playlist_name}'"}
        except Exception as e:
            logger.error(f"Failed to remove song from playlist '{playlist_name}': {e}", exc_info=True)
            return {"success": False, "error": str(e)}


@app.put("/api/music/artist/update")
async def update_artist(artist_id: int, name: str = None, image_path: str = None):
    """Update artist details."""
    async with AsyncSessionLocal() as session:
        try:
            artist = await session.get(MusicArtist, artist_id)
            if not artist:
                return {"success": False, "error": "Artist not found"}
            
            if name:
                artist.name = name
            if image_path is not None:
                artist.image_path = image_path
            
            await session.commit()
            return {"success": True, "artist": {"id": artist.id, "name": artist.name, "image_path": artist.image_path}}
        except Exception as e:
            logger.error(f"Failed to update artist: {e}", exc_info=True)
            return {"success": False, "error": str(e)}


@app.put("/api/music/album/update")
async def update_album(album_id: int, title: str = None, year: int = None, genre: str = None, cover_path: str = None):
    """Update album details."""
    async with AsyncSessionLocal() as session:
        try:
            album = await session.get(MusicAlbum, album_id)
            if not album:
                return {"success": False, "error": "Album not found"}
            
            if title:
                album.title = title
            if year is not None:
                album.year = year
            if genre:
                album.genre = genre
            if cover_path is not None:
                album.cover_path = cover_path
            
            await session.commit()
            return {"success": True, "album": {"id": album.id, "title": album.title, "year": album.year, "genre": album.genre}}
        except Exception as e:
            logger.error(f"Failed to update album: {e}", exc_info=True)
            return {"success": False, "error": str(e)}


@app.put("/api/music/song/update")
async def update_song(song_id: int, title: str = None, track_number: int = None, duration_seconds: int = None):
    """Update song details."""
    async with AsyncSessionLocal() as session:
        try:
            song = await session.get(MusicSong, song_id)
            if not song:
                return {"success": False, "error": "Song not found"}
            
            if title:
                song.title = title
            if track_number is not None:
                song.track_number = track_number
            if duration_seconds is not None:
                song.duration_seconds = duration_seconds
            
            await session.commit()
            return {"success": True, "song": {"id": song.id, "title": song.title, "track_number": song.track_number}}
        except Exception as e:
            logger.error(f"Failed to update song: {e}", exc_info=True)
            return {"success": False, "error": str(e)}


@app.get("/api/music/editor/data")
async def get_music_editor_data():
    """Get all music data for the editor."""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(MusicArtist).options(
                    selectinload(MusicArtist.albums).selectinload(MusicAlbum.songs)
                ).order_by(MusicArtist.name)
            )
            artists = result.scalars().all()
            
            data = []
            for artist in artists:
                albums_data = []
                for album in sorted(artist.albums, key=lambda a: (a.year or 9999, a.title)):
                    songs_data = []
                    for song in sorted(album.songs, key=lambda s: s.track_number or 999):
                        songs_data.append({
                            "id": song.id,
                            "title": song.title,
                            "track_number": song.track_number,
                            "duration_seconds": song.duration_seconds,
                            "file_path": song.file_path,
                        })
                    
                    albums_data.append({
                        "id": album.id,
                        "title": album.title,
                        "year": album.year,
                        "genre": album.genre,
                        "cover_path": album.cover_path,
                        "songs": songs_data,
                    })
                
                # Get videos from extra_metadata
                videos = []
                if artist.extra_metadata and artist.extra_metadata.get("videos"):
                    videos = artist.extra_metadata["videos"]
                
                data.append({
                    "id": artist.id,
                    "name": artist.name,
                    "image_path": artist.image_path,
                    "videos": videos,
                    "albums": albums_data,
                })
            
            return {"success": True, "artists": data}
        except Exception as e:
            logger.error(f"Failed to load editor data: {e}", exc_info=True)
            return {"success": False, "error": str(e)}


class VideoAdd(BaseModel):
    artist: str
    videoId: str
    title: str


@app.post("/api/music/artist/video/add")
async def add_artist_video(req: VideoAdd):
    """Add a video to an artist manually."""
    try:
        async with AsyncSessionLocal() as session:
            artist_row = await session.scalar(
                select(MusicArtist).where(func.lower(MusicArtist.name) == req.artist.lower())
            )
            if not artist_row:
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Artist not found"}
                )
            
            # Initialize extra_metadata if needed
            artist_row.extra_metadata = artist_row.extra_metadata or {}
            videos = artist_row.extra_metadata.get("videos", [])
            
            # Check if video already exists
            if any(v.get("videoId") == req.videoId for v in videos):
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Video already exists"}
                )
            
            # Add new video
            videos.append({"videoId": req.videoId, "title": req.title})
            artist_row.extra_metadata["videos"] = videos
            flag_modified(artist_row, "extra_metadata")
            await session.commit()
            
            return {"success": True, "message": "Video added"}
    except Exception as e:
        logger.error(f"Error adding video: {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


class VideoUpdate(BaseModel):
    artist: str
    originalVideoId: str
    videoId: str
    title: str


@app.put("/api/music/artist/video/update")
async def update_artist_video(req: VideoUpdate):
    """Update a video's ID and/or title."""
    try:
        async with AsyncSessionLocal() as session:
            artist_row = await session.scalar(
                select(MusicArtist).where(func.lower(MusicArtist.name) == req.artist.lower())
            )
            if not artist_row:
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Artist not found"}
                )
            
            if not artist_row.extra_metadata or not artist_row.extra_metadata.get("videos"):
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "No videos found"}
                )
            
            # Find and update video
            videos = artist_row.extra_metadata["videos"]
            video_found = False
            for video in videos:
                if video.get("videoId") == req.originalVideoId:
                    video["videoId"] = req.videoId
                    video["title"] = req.title
                    video_found = True
                    break
            
            if not video_found:
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Video not found"}
                )
            
            artist_row.extra_metadata["videos"] = videos
            flag_modified(artist_row, "extra_metadata")
            await session.commit()
            
            return {"success": True, "message": "Video updated"}
    except Exception as e:
        logger.error(f"Error updating video: {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


class VideoDelete(BaseModel):
    artist: str
    videoId: str


@app.delete("/api/music/artist/video/delete")
async def delete_artist_video(req: VideoDelete):
    """Delete a video from an artist."""
    try:
        async with AsyncSessionLocal() as session:
            artist_row = await session.scalar(
                select(MusicArtist).where(func.lower(MusicArtist.name) == req.artist.lower())
            )
            if not artist_row:
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Artist not found"}
                )
            
            if not artist_row.extra_metadata or not artist_row.extra_metadata.get("videos"):
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "No videos found"}
                )
            
            # Remove video
            videos = artist_row.extra_metadata["videos"]
            videos = [v for v in videos if v.get("videoId") != req.videoId]
            artist_row.extra_metadata["videos"] = videos
            flag_modified(artist_row, "extra_metadata")
            await session.commit()
            
            return {"success": True, "message": "Video deleted"}
    except Exception as e:
        logger.error(f"Error deleting video: {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


def get_system_uptime() -> float:
    """Get system uptime in seconds using platform-specific methods."""
    try:
        import psutil
        # psutil.boot_time() returns the system boot time as a timestamp
        boot_time = psutil.boot_time()
        return time.time() - boot_time
    except (ImportError, AttributeError):
        # Fallback: try platform-specific methods
        system = platform.system().lower()
        if system == 'linux':
            try:
                with open('/proc/uptime', 'r') as f:
                    uptime_seconds = float(f.readline().split()[0])
                    return uptime_seconds
            except (IOError, ValueError, IndexError):
                pass
        elif system == 'darwin':  # macOS
            try:
                import subprocess
                result = subprocess.run(['sysctl', '-n', 'kern.boottime'], 
                                      capture_output=True, text=True, timeout=1)
                if result.returncode == 0:
                    # sysctl returns: { sec = 1234567890, usec = 0 }
                    # Extract the timestamp
                    boot_time_str = result.stdout.strip()
                    # Parse the boot time
                    boot_time = float(boot_time_str.split('=')[1].split(',')[0].strip())
                    return time.time() - boot_time
            except (subprocess.TimeoutExpired, subprocess.SubprocessError, 
                    ValueError, IndexError, AttributeError):
                pass
        # Final fallback: return server uptime
        return time.time() - server_start_time


# === Music Analytics Endpoints ===

@app.post("/api/music/track-play")
async def track_music_play(request: Request):
    """Track a song play for analytics."""
    try:
        from database.models import MusicSong, MusicPlay
        
        payload = await request.json()
        file_path = payload.get("path")
        duration = payload.get("duration")  # How long they listened
        
        if not file_path:
            return JSONResponse(status_code=400, content={"error": "No path provided"})
        
        async with AsyncSessionLocal() as session:
            # Find the song
            song = await session.scalar(
                select(MusicSong).where(MusicSong.file_path == file_path)
            )
            
            if not song:
                logger.warning(f"Song not found for tracking: {file_path}")
                return {"success": False, "error": "Song not found"}
            
            # Increment play count
            song.play_count = (song.play_count or 0) + 1
            
            # Create play record
            play = MusicPlay(
                song_id=song.id,
                play_duration_seconds=duration,
                completed="true" if duration and song.duration_seconds and duration >= song.duration_seconds * 0.8 else "false"
            )
            session.add(play)
            
            await session.commit()
            
            logger.info(f"Tracked play for: {song.title} (total: {song.play_count})")
            return {"success": True, "play_count": song.play_count}
            
    except Exception as e:
        logger.error(f"Error tracking play: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/music/analytics")
async def get_music_analytics():
    """Get music analytics data."""
    try:
        from database.models import MusicSong, MusicArtist, MusicAlbum, MusicPlay
        
        async with AsyncSessionLocal() as session:
            # Get most played songs
            most_played_stmt = (
                select(MusicSong, MusicArtist.name.label("artist_name"), MusicAlbum.title.label("album_title"))
                .join(MusicArtist, MusicSong.artist_id == MusicArtist.id)
                .join(MusicAlbum, MusicSong.album_id == MusicAlbum.id)
                .where(MusicSong.play_count > 0)
                .order_by(MusicSong.play_count.desc())
                .limit(50)
            )
            result = await session.execute(most_played_stmt)
            most_played_raw = result.all()
            
            most_played = []
            for song, artist_name, album_title in most_played_raw:
                most_played.append({
                    "id": song.id,
                    "title": song.title,
                    "artist": artist_name,
                    "album": album_title,
                    "play_count": song.play_count,
                    "duration": song.duration_seconds,
                    "path": song.file_path
                })
            
            # Get total play count
            total_plays_result = await session.execute(
                select(func.sum(MusicSong.play_count))
            )
            total_plays = total_plays_result.scalar() or 0
            
            # Get total unique songs played
            songs_played_result = await session.execute(
                select(func.count(MusicSong.id)).where(MusicSong.play_count > 0)
            )
            songs_played = songs_played_result.scalar() or 0
            
            # Get most played artists
            artist_plays_stmt = (
                select(
                    MusicArtist.name,
                    func.sum(MusicSong.play_count).label("total_plays")
                )
                .join(MusicSong, MusicArtist.id == MusicSong.artist_id)
                .where(MusicSong.play_count > 0)
                .group_by(MusicArtist.id, MusicArtist.name)
                .order_by(func.sum(MusicSong.play_count).desc())
                .limit(10)
            )
            artist_result = await session.execute(artist_plays_stmt)
            top_artists = [
                {"name": name, "play_count": int(plays)}
                for name, plays in artist_result.all()
            ]
            
            # Get most played albums
            album_plays_stmt = (
                select(
                    MusicAlbum.title,
                    MusicArtist.name.label("artist_name"),
                    func.sum(MusicSong.play_count).label("total_plays")
                )
                .join(MusicSong, MusicAlbum.id == MusicSong.album_id)
                .join(MusicArtist, MusicAlbum.artist_id == MusicArtist.id)
                .where(MusicSong.play_count > 0)
                .group_by(MusicAlbum.id, MusicAlbum.title, MusicArtist.name)
                .order_by(func.sum(MusicSong.play_count).desc())
                .limit(10)
            )
            album_result = await session.execute(album_plays_stmt)
            top_albums = [
                {"title": title, "artist": artist, "play_count": int(plays)}
                for title, artist, plays in album_result.all()
            ]
            
            return {
                "most_played": most_played,
                "total_plays": int(total_plays),
                "songs_played": songs_played,
                "top_artists": top_artists,
                "top_albums": top_albums
            }
            
    except Exception as e:
        logger.error(f"Error getting analytics: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


# Mount static files for audio
project_root = Path(__file__).parent.parent
app.mount("/data", StaticFiles(directory=str(project_root / "data")), name="data")

# Mount static files for React build
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")


@app.get("/api/devices")
async def get_devices():
    """Get all connected devices."""
    if not processor:
        raise HTTPException(status_code=500, detail="Processor not initialized")
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DeviceConnection).order_by(desc(DeviceConnection.last_seen))
        )
        devices = result.scalars().all()
        
        return [
            {
                "device_id": d.device_id,
                "device_name": d.device_name,
                "device_type": d.device_type,
                "is_connected": d.is_connected == "true",
                "last_seen": d.last_seen.isoformat() if d.last_seen else None,
                "device_metadata": d.device_metadata or {}
            }
            for d in devices
        ]


@app.get("/api/telemetry/latest")
async def get_latest_telemetry():
    """Get latest telemetry for all devices."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DeviceTelemetry).order_by(desc(DeviceTelemetry.timestamp))
        )
        all_telemetry = result.scalars().all()
        
        # Get latest value for each device/metric combination
        latest = {}
        for t in all_telemetry:
            key = (t.device_id, t.metric_name)
            if key not in latest:
                latest[key] = {
                    "device_id": t.device_id,
                    "metric_name": t.metric_name,
                    "value": t.value,
                    "unit": t.unit,
                    "timestamp": t.timestamp.isoformat() if t.timestamp else None
                }
        
        return list(latest.values())


@app.get("/api/system/stats")
async def get_system_stats():
    """Get system statistics (CPU, RAM, Disk) across all drives."""
    try:
        import psutil
        # Get average CPU usage across all cores
        cpu_percent = psutil.cpu_percent(interval=0.1, percpu=False)
        memory = psutil.virtual_memory()
        
        # Calculate disk usage across ALL drives
        total_disk_space = 0
        total_disk_used = 0
        total_disk_free = 0
        
        system = platform.system().lower()
        partitions = psutil.disk_partitions()
        
        for partition in partitions:
            try:
                # Skip certain filesystem types that might cause errors
                if system == 'linux' and partition.fstype in ['tmpfs', 'devtmpfs', 'sysfs', 'proc', 'devpts']:
                    continue
                if system == 'darwin' and partition.fstype in ['devfs', 'autofs']:
                    continue
                
                usage = psutil.disk_usage(partition.mountpoint)
                total_disk_space += usage.total
                total_disk_used += usage.used
                total_disk_free += usage.free
            except (OSError, PermissionError):
                # Skip partitions we can't access
                continue
        
        # If no partitions were accessible, try root as fallback
        if total_disk_space == 0:
            try:
                root_path = '/' if system != 'windows' else 'C:\\'
                usage = psutil.disk_usage(root_path)
                total_disk_space = usage.total
                total_disk_used = usage.used
                total_disk_free = usage.free
            except (OSError, PermissionError):
                logger.warning("Could not access disk usage, using placeholder data")
                return {
                    "cpu_percent": 0.0,
                    "memory_total_gb": 0.0,
                    "memory_used_gb": 0.0,
                    "memory_percent": 0.0,
                    "disk_total_gb": 0.0,
                    "disk_used_gb": 0.0,
                    "disk_free_gb": 0.0,
                    "disk_percent": 0.0
                }
        
        disk_percent = (total_disk_used / total_disk_space * 100) if total_disk_space > 0 else 0.0
        
        stats = {
            "cpu_percent": cpu_percent,
            "memory_total_gb": memory.total / (1024**3),
            "memory_used_gb": memory.used / (1024**3),
            "memory_percent": memory.percent,
            "disk_total_gb": total_disk_space / (1024**3),
            "disk_used_gb": total_disk_used / (1024**3),
            "disk_free_gb": total_disk_free / (1024**3),
            "disk_percent": disk_percent
        }
        
        # Log the stats
        logger.info(f"System stats updated: CPU={cpu_percent:.1f}%, Memory={memory.percent:.1f}%, Disk={disk_percent:.1f}%")
        
        return stats
    except ImportError:
        logger.error("psutil not available, cannot get system stats")
        # Return zero data if psutil not available
        return {
            "cpu_percent": 0.0,
            "memory_total_gb": 0.0,
            "memory_used_gb": 0.0,
            "memory_percent": 0.0,
            "disk_total_gb": 0.0,
            "disk_used_gb": 0.0,
            "disk_free_gb": 0.0,
            "disk_percent": 0.0
        }
    except Exception as e:
        logger.error(f"Error getting system stats: {e}", exc_info=True)
        # Return zero data on error
        return {
            "cpu_percent": 0.0,
            "memory_total_gb": 0.0,
            "memory_used_gb": 0.0,
            "memory_percent": 0.0,
            "disk_total_gb": 0.0,
            "disk_used_gb": 0.0,
            "disk_free_gb": 0.0,
            "disk_percent": 0.0
        }


def get_local_ip() -> str:
    """Get the local IP address of the system."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip
    except Exception:
        return '127.0.0.1'

async def get_remote_ip() -> str:
    """Get the remote/public IP address of the system."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get('https://api.ipify.org?format=json')
            return response.json()['ip']
    except Exception:
        return 'Unable to determine'

@app.get("/api/system/uptime")
async def get_system_uptime_endpoint():
    """Get system uptime in seconds."""
    uptime_seconds = get_system_uptime()
    return {"uptime_seconds": int(uptime_seconds)}

@app.get("/api/system/ips")
async def get_system_ips():
    """Get system local and remote IP addresses."""
    local_ip = get_local_ip()
    remote_ip = await get_remote_ip()
    return {
        "local_ip": local_ip,
        "remote_ip": remote_ip
    }


@app.get("/api/chat")
async def get_chat_history(limit: int = 50, offset: int = 0, session_id: Optional[str] = None, mode: Optional[str] = None, persona: Optional[str] = None):
    """
    Get chat history with pagination, filtered by session_id (for chat sessions), mode, and persona.
    For chat sessions (starting with 'chat-'), filter by session_id. Otherwise filter by mode + persona.
    """
    async with AsyncSessionLocal() as session:
        # Build base query
        query = select(ChatMessage)
        count_query = select(func.count(ChatMessage.id))
        
        # For chat sessions (starting with 'chat-'), filter by session_id ONLY
        if session_id and session_id.startswith('chat-'):
            logger.info(f"[get_chat_history] Filtering by session_id: {session_id}")
            query = query.where(ChatMessage.session_id == session_id)
            count_query = count_query.where(ChatMessage.session_id == session_id)
        else:
            # For non-chat sessions, filter by mode and persona (backward compatibility)
            logger.info(f"[get_chat_history] Filtering by mode={mode}, persona={persona}")
            if mode:
                query = query.where(ChatMessage.mode == mode)
                count_query = count_query.where(ChatMessage.mode == mode)
            
            # Filter by persona if provided (especially important for conversational mode)
            if persona:
                query = query.where(ChatMessage.persona == persona)
                count_query = count_query.where(ChatMessage.persona == persona)
        
        # Get total count
        count_result = await session.execute(count_query)
        total_count = count_result.scalar() or 0
        
        # Get messages with pagination
        query = query.order_by(desc(ChatMessage.created_at)).limit(limit).offset(offset)
        result = await session.execute(query)
        messages = result.scalars().all()
        
        logger.info(f"[get_chat_history] Returning {len(messages)} messages for session_id={session_id}, total_count={total_count}")
        
        return {
            "messages": [
                {
                    "id": m.id,
                    "session_id": m.session_id,
                    "role": m.role,
                    "message": m.message,
                    "service_name": m.service_name,
                    "message_metadata": m.message_metadata or {},
                    "created_at": m.created_at.isoformat() if m.created_at else None
                }
                for m in reversed(messages)
            ],
            "total": total_count,
            "offset": offset,
            "limit": limit,
            "has_more": offset + len(messages) < total_count
        }


@app.post("/api/chat")
async def send_chat_message(request: Request):
    """Send a chat message and get AI response (streaming)."""
    async def save_chat_message_with_retry(
        *, session_id: str, role: str, message_text: str, service_name: str, mode: str, persona: str, metadata: Optional[Dict[str, Any]] = None
    ) -> ChatMessage:
        """Persist a chat message with simple retries to avoid transient SQLite locks."""
        last_exc = None
        for attempt in range(3):
            try:
                async with AsyncSessionLocal() as session:
                    # For chat sessions (starting with 'chat-'), don't save mode
                    # Mode is only relevant for non-chat sessions
                    msg = ChatMessage(
                        session_id=session_id,
                        role=role,
                        message=message_text,
                        service_name=service_name,
                        mode=None if session_id.startswith('chat-') else mode,
                        persona=persona,
                        message_metadata=metadata or {},
                    )
                    session.add(msg)
                    await session.commit()
                    return msg
            except OperationalError as exc:  # pragma: no cover - depends on DB state
                last_exc = exc
                logger.warning(f"Database busy when saving {role} message (attempt {attempt + 1}/3): {exc}")
                await asyncio.sleep(0.5 * (attempt + 1))
        logger.error(f"Failed to save {role} message after retries", exc_info=last_exc)
        raise HTTPException(status_code=503, detail="Database is busy, please try again.")

    try:
        data = await request.json()
        message = data.get("message")
        session_id = data.get("session_id")
        mode = data.get("mode", "qa")  # "qa" or "conversational"
        expert_type = data.get("expert_type", "general")  # Expert type for conversational mode
        service_name = data.get("service_name")  # Deprecated, use mode instead
        stream = data.get("stream", True)
        preset_id = data.get("preset_id")  # Optional prompt preset ID
        
        logger.info(f"Chat request received: message='{message[:50] if message else None}', mode={mode}, stream={stream}, preset_id={preset_id}")
        
        if not message:
            raise HTTPException(status_code=400, detail="Message is required")
        
        # Load prompt preset if provided
        custom_context = None
        custom_temperature = None
        custom_top_p = None
        if preset_id:
            try:
                async with AsyncSessionLocal() as db_session:
                    result = await db_session.execute(
                        select(PromptPreset).where(PromptPreset.id == preset_id)
                    )
                    preset = result.scalar_one_or_none()
                    if preset:
                        custom_context = preset.context
                        custom_temperature = preset.temperature
                        custom_top_p = preset.top_p
                        logger.info(f"Loaded preset '{preset.name}': context={custom_context[:50] if custom_context else None}, temp={custom_temperature}, top_p={custom_top_p}")
            except Exception as e:
                logger.warning(f"Failed to load preset {preset_id}: {e}")
        
        # Determine service based on mode
        if mode == "conversational":
            actual_service_name = "rag_service"
        else:
            actual_service_name = "ai_service"
        
        # Backward compatibility: if service_name is explicitly set, use it
        if service_name:
            actual_service_name = service_name
        
        logger.info(f"Using service: {actual_service_name}")
        
        # Save user message (retry on transient DB locks)
        current_persona = await get_current_persona_name()
        # Use provided session_id if it's a chat session (starts with 'chat-'), otherwise use persona_mode format
        if session_id and session_id.startswith('chat-'):
            session_key = session_id
        else:
            session_key = f"{current_persona}_{mode}"
        try:
            await asyncio.wait_for(
                save_chat_message_with_retry(
                    session_id=session_key,
                    role="user",
                    message_text=message,
                    service_name=actual_service_name,
                    mode=mode,
                    persona=current_persona,
                ),
                timeout=3,
            )
            logger.info(f"User message saved, starting streaming response with service={actual_service_name}, stream={stream}")
        except Exception as e:
            logger.error(f"Failed to save user message, continuing without persistence: {e}")
            logger.info(f"Proceeding with chat response without saving user message (service={actual_service_name}, stream={stream})")
        
        # For streaming responses (AI service - Q&A mode)
        if stream and actual_service_name == "ai_service":
            ai_service = AIService()
            await ai_service.reload_persona_config()  # Ensure we have the latest persona
            
            # Load conversation history for context
            conversation_history = await ai_service._load_conversation_history(session_key, limit=50)
            
            input_data = {
                "question": message,
                "session_id": session_key,
                "messages": conversation_history
            }
            
            # Apply preset overrides if provided
            if custom_context:
                input_data["system_prompt"] = custom_context
            if custom_temperature is not None:
                input_data["temperature"] = custom_temperature
            if custom_top_p is not None:
                input_data["top_p"] = custom_top_p
            
            async def generate_response():
                full_response = ""
                message_id = None
                try:
                    # Use async stream method to avoid blocking the event loop
                    async for chunk in ai_service.async_stream_execute(input_data):
                        full_response += chunk
                        yield f"data: {json.dumps({'chunk': chunk, 'done': False})}\n\n"
                    
                    # Save complete response
                    try:
                        assistant_msg = await asyncio.wait_for(
                            save_chat_message_with_retry(
                                session_id=session_key,
                                role="assistant",
                                message_text=full_response,
                                service_name=actual_service_name,
                                mode=mode,
                                persona=current_persona,
                            ),
                            timeout=3,
                        )
                        message_id = assistant_msg.id
                    except Exception as e:
                        logger.error(f"Failed to save assistant message, continuing without persistence: {e}")
                        assistant_msg = None
                    
                    # Save transcript
                    try:
                        persona_config = await load_persona_config(current_persona)
                        model = persona_config.get("anthropic", {}).get("anthropic_model", settings.ai_model) if persona_config else settings.ai_model
                        # Get audio file path from message metadata if available
                        audio_file_path = assistant_msg.message_metadata.get("audio_file") if assistant_msg and assistant_msg.message_metadata else None
                        save_transcript(question=message, answer=full_response, persona=current_persona, model=model, session_id=session_key, audio_file=audio_file_path, mode="qa", expert_type="general")
                    except Exception as e:
                        logger.warning(f"Failed to save transcript: {e}")
                    
                    yield f"data: {json.dumps({'chunk': '', 'done': True, 'message_id': message_id})}\n\n"
                except Exception as e:
                    logger.error(f"Error in streaming response: {e}", exc_info=True)
                    yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"
            
            return StreamingResponse(generate_response(), media_type="text/event-stream")
        
        # For streaming responses (RAG service - Conversational mode)
        if stream and actual_service_name == "rag_service":
            rag_service = RAGService()
            await rag_service.reload_persona_config()  # Ensure we have the latest persona
            
            async def generate_response():
                full_response = ""
                message_id = None
                try:
                    # Load conversation history (increased limit for better context)
                    conversation_history = await rag_service._load_conversation_history(session_key, limit=50)
                    
                    # Build input data for RAG service
                    input_data = {
                        "query": message,
                        "session_id": session_key,
                        "expert_type": expert_type,
                        "messages": conversation_history
                    }
                    
                    # Consume the synchronous generator directly (it's safe in async context)
                    # The generator yields chunks from the Anthropic API stream
                    for chunk in rag_service.stream_execute(input_data):
                        full_response += chunk
                        yield f"data: {json.dumps({'chunk': chunk, 'done': False})}\n\n"
                    
                    # Save complete response
                    try:
                        assistant_msg = await asyncio.wait_for(
                            save_chat_message_with_retry(
                                session_id=session_key,
                                role="assistant",
                                message_text=full_response,
                                service_name=actual_service_name,
                                mode=mode,
                                persona=current_persona,
                            ),
                            timeout=3,
                        )
                        message_id = assistant_msg.id
                    except Exception as e:
                        logger.error(f"Failed to save assistant message, continuing without persistence: {e}")
                        assistant_msg = None
                    
                    # Save transcript
                    try:
                        persona_config = await load_persona_config(current_persona)
                        model = persona_config.get("anthropic", {}).get("anthropic_model", settings.ai_model) if persona_config else settings.ai_model
                        # Get audio file path from message metadata if available
                        audio_file_path = assistant_msg.message_metadata.get("audio_file") if assistant_msg and assistant_msg.message_metadata else None
                        save_transcript(question=message, answer=full_response, persona=current_persona, model=model, session_id=session_key, audio_file=audio_file_path, mode="conversational", expert_type=expert_type)
                    except Exception as e:
                        logger.warning(f"Failed to save transcript: {e}")
                    
                    yield f"data: {json.dumps({'chunk': '', 'done': True, 'message_id': message_id})}\n\n"
                except Exception as e:
                    logger.error(f"Error in streaming response: {e}", exc_info=True)
                    yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"
            
            return StreamingResponse(generate_response(), media_type="text/event-stream")
        
        logger.warning(f"Unhandled case: stream={stream}, actual_service_name={actual_service_name}")
        return {"error": "Non-streaming mode not implemented"}
    except Exception as e:
        logger.error(f"Error in send_chat_message endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/sessions")
async def create_chat_session(request: Request):
    """Create a new chat session with a temporary title."""
    try:
        data = await request.json()
        session_id = data.get("session_id")
        
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        async with AsyncSessionLocal() as session:
            # Check if session already exists
            result = await session.execute(
                select(ChatSession).where(ChatSession.session_id == session_id)
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                return {
                    "success": True,
                    "session_id": existing.session_id,
                    "title": existing.title
                }
            
            # Create temp title: session_id + timestamp
            # Extract timestamp from session_id (format: chat-1234567890)
            timestamp = session_id.replace('chat-', '') if session_id.startswith('chat-') else str(int(datetime.now(timezone.utc).timestamp() * 1000))
            temp_title = f"{session_id} {timestamp}"
            
            # Create new session
            chat_session = ChatSession(
                session_id=session_id,
                title=temp_title
            )
            session.add(chat_session)
            await session.commit()
            
            return {
                "success": True,
                "session_id": chat_session.session_id,
                "title": chat_session.title
            }
    except Exception as e:
        logger.error(f"Error creating chat session: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/api/chat/sessions")
async def get_chat_sessions():
    """Get all chat sessions with their titles."""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ChatSession)
                .where(ChatSession.session_id.like('chat-%'))
                .order_by(ChatSession.pinned.desc(), desc(ChatSession.updated_at))
            )
            sessions = result.scalars().all()
            
            return {
                "success": True,
                "sessions": [
                    {
                        "session_id": s.session_id,
                        "title": s.title,
                        "pinned": getattr(s, 'pinned', False),
                        "preset_id": getattr(s, 'preset_id', None),
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                        "updated_at": s.updated_at.isoformat() if s.updated_at else None
                    }
                    for s in sessions
                ]
            }
    except Exception as e:
        logger.error(f"Error getting chat sessions: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.delete("/api/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str):
    """Delete a chat session and all its messages."""
    try:
        logger.info(f"Delete request received for session: {session_id}")
        async with AsyncSessionLocal() as db_session:
            # Delete all messages for this session
            result_messages = await db_session.execute(
                delete(ChatMessage).where(ChatMessage.session_id == session_id)
            )
            logger.info(f"Deleted {result_messages.rowcount} messages for session {session_id}")
            
            # Delete the session record
            result_session = await db_session.execute(
                delete(ChatSession).where(ChatSession.session_id == session_id)
            )
            logger.info(f"Deleted session record: {result_session.rowcount} rows")
            
            await db_session.commit()
            
            logger.info(f"Successfully deleted chat session {session_id} and all its messages")
            return JSONResponse(content={"success": True, "message": "Chat session deleted successfully"})
            
    except Exception as e:
        logger.error(f"Error deleting chat session: {e}", exc_info=True)
        try:
            await db_session.rollback()
        except:
            pass
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.put("/api/chat/sessions/{session_id}/title")
async def update_chat_session_title(session_id: str, request: Request):
    """Update the title of a chat session."""
    try:
        data = await request.json()
        title = data.get("title", "").strip()
        
        async with AsyncSessionLocal() as session:
            # Get or create session
            result = await session.execute(
                select(ChatSession).where(ChatSession.session_id == session_id)
            )
            chat_session = result.scalar_one_or_none()
            
            if chat_session:
                chat_session.title = title if title else None
                chat_session.updated_at = datetime.now(timezone.utc)
            else:
                chat_session = ChatSession(
                    session_id=session_id,
                    title=title if title else None
                )
                session.add(chat_session)
            
            await session.commit()
            
            return {
                "success": True,
                "session_id": session_id,
                "title": chat_session.title
            }
    except Exception as e:
        logger.error(f"Error updating chat session title: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.put("/api/chat/sessions/{session_id}/preset")
async def update_chat_session_preset(session_id: str, request: Request):
    """Update the preset_id of a chat session."""
    try:
        data = await request.json()
        preset_id = data.get("preset_id")  # Can be null to use system context
        
        async with AsyncSessionLocal() as db_session:
            result = await db_session.execute(
                select(ChatSession).where(ChatSession.session_id == session_id)
            )
            chat_session = result.scalar_one_or_none()
            
            if chat_session:
                chat_session.preset_id = preset_id if preset_id else None
                chat_session.updated_at = datetime.now(timezone.utc)
            else:
                # Create session if it doesn't exist
                chat_session = ChatSession(
                    session_id=session_id,
                    preset_id=preset_id if preset_id else None
                )
                db_session.add(chat_session)
            
            await db_session.commit()
            await db_session.refresh(chat_session)
            
            return {
                "success": True,
                "session_id": session_id,
                "preset_id": chat_session.preset_id
            }
    except Exception as e:
        logger.error(f"Error updating chat session preset: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.put("/api/chat/sessions/{session_id}/pin")
async def toggle_chat_session_pin(session_id: str, request: Request):
    """Toggle the pinned status of a chat session."""
    try:
        data = await request.json()
        pinned = data.get("pinned", False)
        
        async with AsyncSessionLocal() as db_session:
            result = await db_session.execute(
                select(ChatSession).where(ChatSession.session_id == session_id)
            )
            chat_session = result.scalar_one_or_none()
            
            if chat_session:
                chat_session.pinned = pinned
                chat_session.updated_at = datetime.now(timezone.utc)
            else:
                # Create session if it doesn't exist
                chat_session = ChatSession(
                    session_id=session_id,
                    pinned=pinned
                )
                db_session.add(chat_session)
            
            await db_session.commit()
            await db_session.refresh(chat_session)
            
            return {
                "success": True,
                "session_id": session_id,
                "pinned": chat_session.pinned
            }
    except Exception as e:
        logger.error(f"Error toggling chat session pin: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.get("/api/prompt-presets")
async def get_prompt_presets():
    """Get all prompt presets."""
    try:
        async with AsyncSessionLocal() as db_session:
            result = await db_session.execute(
                select(PromptPreset).order_by(PromptPreset.created_at.desc())
            )
            presets = result.scalars().all()
            return {
                "success": True,
                "presets": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "context": p.context,
                        "temperature": p.temperature,
                        "top_p": p.top_p,
                        "created_at": p.created_at.isoformat() if p.created_at else None,
                        "updated_at": p.updated_at.isoformat() if p.updated_at else None
                    }
                    for p in presets
                ]
            }
    except Exception as e:
        logger.error(f"Error fetching prompt presets: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/prompt-presets")
async def create_prompt_preset(request: Request):
    """Create a new prompt preset."""
    try:
        data = await request.json()
        async with AsyncSessionLocal() as db_session:
            preset = PromptPreset(
                name=data.get("name", "").strip(),
                context=data.get("context", "").strip(),
                temperature=data.get("temperature"),
                top_p=data.get("top_p")
            )
            db_session.add(preset)
            await db_session.commit()
            await db_session.refresh(preset)
            return {
                "success": True,
                "preset": {
                    "id": preset.id,
                    "name": preset.name,
                    "context": preset.context,
                    "temperature": preset.temperature,
                    "top_p": preset.top_p
                }
            }
    except Exception as e:
        logger.error(f"Error creating prompt preset: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/prompt-presets/improve")
async def improve_prompt_preset(request: Request):
    """Use AI to improve a prompt preset context."""
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        context = data.get("context", "").strip()
        
        if not name or not context:
            return JSONResponse(status_code=400, content={"success": False, "error": "Name and context are required"})
        
        # Use AI service to improve the context
        ai_service = AIService()
        await ai_service.reload_persona_config()
        
        improvement_prompt = f"""You are an expert at crafting effective AI system prompts and persona definitions.

The user wants to create a persona preset called "{name}" with the following initial context:

{context}

Please improve and refine this context to make it:
1. More clear and specific
2. Better structured for AI understanding
3. More effective at guiding the AI's behavior
4. Professional and well-written

Return ONLY the improved context text, without any explanations, quotes, or additional commentary. The improved context should be ready to use as-is."""

        try:
            improved_context = await ai_service.execute_with_system_prompt(
                question=improvement_prompt,
                system_prompt="You are an expert at writing clear, effective AI prompts and persona definitions. Always return only the improved text without any additional commentary.",
                max_tokens=1024
            )
            
            # Check for errors in the response
            if isinstance(improved_context, dict):
                if improved_context.get("error"):
                    error_msg = improved_context.get("answer", "Unknown error")
                    logger.error(f"AI service error: {error_msg}")
                    return JSONResponse(status_code=500, content={"success": False, "error": error_msg})
                
                improved_text = improved_context.get("answer", "")
                if not improved_text:
                    logger.warning("AI service returned empty answer")
                    return JSONResponse(status_code=500, content={"success": False, "error": "AI service returned an empty response"})
            else:
                improved_text = str(improved_context)
            
            # Clean up the response (remove quotes if wrapped)
            improved_text = improved_text.strip()
            if improved_text.startswith('"') and improved_text.endswith('"'):
                improved_text = improved_text[1:-1]
            if improved_text.startswith("'") and improved_text.endswith("'"):
                improved_text = improved_text[1:-1]
            
            # Ensure we have a valid improved text
            if not improved_text:
                improved_text = context  # Fallback to original if empty
            
            return {
                "success": True,
                "improved_context": improved_text
            }
        except Exception as e:
            logger.error(f"Error calling AI service to improve context: {e}", exc_info=True)
            error_message = str(e)
            # Provide more user-friendly error messages
            if "no_api_key" in error_message.lower() or "not configured" in error_message.lower():
                error_message = "AI service is not configured. Please add your Anthropic API key in Settings."
            return JSONResponse(status_code=500, content={"success": False, "error": f"Failed to improve context: {error_message}"})
            
    except Exception as e:
        logger.error(f"Error improving prompt preset: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.put("/api/prompt-presets/{preset_id}")
async def update_prompt_preset(preset_id: int, request: Request):
    """Update an existing prompt preset."""
    try:
        data = await request.json()
        async with AsyncSessionLocal() as db_session:
            result = await db_session.execute(
                select(PromptPreset).where(PromptPreset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            if not preset:
                return JSONResponse(status_code=404, content={"success": False, "error": "Preset not found"})
            
            preset.name = data.get("name", preset.name).strip()
            preset.context = data.get("context", preset.context).strip()
            preset.temperature = data.get("temperature")
            preset.top_p = data.get("top_p")
            
            await db_session.commit()
            await db_session.refresh(preset)
            return {
                "success": True,
                "preset": {
                    "id": preset.id,
                    "name": preset.name,
                    "context": preset.context,
                    "temperature": preset.temperature,
                    "top_p": preset.top_p
                }
            }
    except Exception as e:
        logger.error(f"Error updating prompt preset: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.delete("/api/prompt-presets/{preset_id}")
async def delete_prompt_preset(preset_id: int):
    """Delete a prompt preset."""
    try:
        async with AsyncSessionLocal() as db_session:
            result = await db_session.execute(
                select(PromptPreset).where(PromptPreset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            if not preset:
                return JSONResponse(status_code=404, content={"success": False, "error": "Preset not found"})
            
            await db_session.delete(preset)
            await db_session.commit()
            return {"success": True}
    except Exception as e:
        logger.error(f"Error deleting prompt preset: {e}", exc_info=True)
        await db_session.rollback()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.get("/api/chat/sessions/{session_id}/title")
async def get_chat_session_title(session_id: str):
    """Get the title of a chat session."""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ChatSession).where(ChatSession.session_id == session_id)
            )
            chat_session = result.scalar_one_or_none()
            
            if chat_session:
                return {
                    "success": True,
                    "session_id": session_id,
                    "title": chat_session.title
                }
            else:
                return {
                    "success": True,
                    "session_id": session_id,
                    "title": None
                }
    except Exception as e:
        logger.error(f"Error getting chat session title: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/api/tts/generate")
async def generate_tts(request: Request):
    """Generate audio from text using Fish Audio API with current persona voice."""
    data = await request.json()
    text = data.get("text")
    message_id = data.get("message_id")  # Optional message ID to update
    persona_name = data.get("persona")  # Optional, defaults to current persona
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    # Load persona config to get voice settings
    persona_config = await load_persona_config(persona_name) if persona_name else await load_persona_config()
    if not persona_config:
        raise HTTPException(status_code=404, detail="Persona config not found")
    
    fish_audio_config = persona_config.get("fish_audio")
    if not fish_audio_config:
        raise HTTPException(status_code=400, detail="Fish Audio config not found in persona")
    
    voice_id = fish_audio_config.get("voice_id")
    voice_engine = fish_audio_config.get("voice_engine", "s1")
    
    if not voice_id:
        raise HTTPException(status_code=400, detail="Voice ID not found in persona config")
    
    # Generate audio
    tts_service = TTSService()
    audio_data, audio_filepath = await tts_service.generate_audio(text, voice_id, voice_engine, save_to_file=True)
    
    if audio_data is None:
        raise HTTPException(status_code=500, detail="Failed to generate audio")
    
    # Update message metadata with audio file path if message_id is provided
    if message_id and audio_filepath:
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(select(ChatMessage).where(ChatMessage.id == message_id))
                message = result.scalar_one_or_none()
                if message:
                    metadata = message.message_metadata or {}
                    metadata["audio_file"] = audio_filepath
                    message.message_metadata = metadata
                    await session.commit()
                    logger.info(f"Updated message {message_id} with audio file: {audio_filepath}")
        except Exception as e:
            logger.warning(f"Failed to update message metadata with audio file: {e}")
    
    # Return audio file with file path in headers
    response_headers = {
        "Content-Disposition": "attachment; filename=tts_output.mp3"
    }
    if audio_filepath:
        # Return relative path for the audio file
        response_headers["X-Audio-File-Path"] = str(audio_filepath.relative_to(project_root))
    
    return Response(
        content=audio_data,
        media_type="audio/mpeg",
        headers=response_headers
    )


@app.post("/api/audio/last-message")
async def play_last_message_audio(request: Request):
    """Get or generate audio for the last assistant message in the chat."""
    data = await request.json()
    session_id = data.get("session_id")
    
    try:
        async with AsyncSessionLocal() as session:
            # Get the last assistant message
            query = select(ChatMessage).where(ChatMessage.role == "assistant")
            if session_id:
                query = query.where(ChatMessage.session_id == session_id)
            query = query.order_by(desc(ChatMessage.created_at)).limit(1)
            
            result = await session.execute(query)
            last_message = result.scalar_one_or_none()
            
            if not last_message:
                raise HTTPException(status_code=404, detail="No assistant messages found")
            
            # Check if audio file already exists in metadata
            metadata = last_message.message_metadata or {}
            audio_file = metadata.get("audio_file")
            
            # If audio file exists and file exists, return it
            if audio_file:
                audio_path = project_root / audio_file
                if audio_path.exists():
                    # Return relative URL for the audio file
                    if audio_file.startswith('data/'):
                        audio_url = f"/{audio_file}"
                    else:
                        audio_url = f"/data/audio/{Path(audio_file).name}"
                    return {
                        "success": True,
                        "audio_url": audio_url,
                        "message_id": last_message.id
                    }
            
            # Generate audio for the message
            current_persona = await get_current_persona_name()
            persona_config = await load_persona_config(current_persona)
            if not persona_config:
                raise HTTPException(status_code=404, detail="Persona config not found")
            
            fish_audio_config = persona_config.get("fish_audio")
            if not fish_audio_config:
                raise HTTPException(status_code=400, detail="Fish Audio config not found in persona")
            
            voice_id = fish_audio_config.get("voice_id")
            voice_engine = fish_audio_config.get("voice_engine", "s1")
            
            if not voice_id:
                raise HTTPException(status_code=400, detail="Voice ID not found in persona config")
            
            # Generate audio
            tts_service = TTSService()
            audio_data, audio_filepath = await tts_service.generate_audio(
                last_message.message, 
                voice_id, 
                voice_engine, 
                save_to_file=True
            )
            
            if audio_data is None or not audio_filepath:
                raise HTTPException(status_code=500, detail="Failed to generate audio")
            
            # Update message metadata with audio file path
            metadata["audio_file"] = audio_filepath
            last_message.message_metadata = metadata
            await session.commit()
            
            # Return relative URL for the audio file
            # audio_filepath is a string (relative path from project_root)
            if audio_filepath.startswith('data/'):
                audio_url = f"/{audio_filepath}"
            else:
                audio_url = f"/data/audio/{Path(audio_filepath).name}"
            
            return {
                "success": True,
                "audio_url": audio_url,
                "message_id": last_message.id,
                "generated": True
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting/generating audio for last message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/audio/message")
async def generate_audio_for_message(request: Request):
    """Get or generate audio for a specific message by message ID."""
    data = await request.json()
    session_id = data.get("session_id")
    message_id = data.get("message_id")
    
    if not message_id:
        raise HTTPException(status_code=400, detail="Message ID is required")
    
    try:
        async with AsyncSessionLocal() as session:
            # Get the specific message
            result = await session.execute(
                select(ChatMessage).where(ChatMessage.id == message_id)
            )
            message = result.scalar_one_or_none()
            
            if not message:
                raise HTTPException(status_code=404, detail="Message not found")
            
            if message.role != "assistant":
                raise HTTPException(status_code=400, detail="Can only generate audio for assistant messages")
            
            # Check if audio file already exists in metadata
            metadata = message.message_metadata or {}
            audio_file = metadata.get("audio_file")
            
            # If audio file exists and file exists, return it
            if audio_file:
                audio_path = project_root / audio_file
                if audio_path.exists():
                    # Return relative URL for the audio file
                    if audio_file.startswith('data/'):
                        audio_url = f"/{audio_file}"
                    else:
                        audio_url = f"/data/audio/{Path(audio_file).name}"
                    return {
                        "success": True,
                        "audio_url": audio_url,
                        "message_id": message.id
                    }
            
            # Generate audio for the message
            current_persona = await get_current_persona_name()
            persona_config = await load_persona_config(current_persona)
            if not persona_config:
                raise HTTPException(status_code=404, detail="Persona config not found")
            
            fish_audio_config = persona_config.get("fish_audio")
            if not fish_audio_config:
                raise HTTPException(status_code=400, detail="Fish Audio config not found in persona")
            
            voice_id = fish_audio_config.get("voice_id")
            voice_engine = fish_audio_config.get("voice_engine", "s1")
            
            if not voice_id:
                raise HTTPException(status_code=400, detail="Voice ID not found in persona config")
            
            # Generate audio
            tts_service = TTSService()
            audio_data, audio_filepath = await tts_service.generate_audio(
                message.message, 
                voice_id, 
                voice_engine, 
                save_to_file=True
            )
            
            if audio_data is None or not audio_filepath:
                raise HTTPException(status_code=500, detail="Failed to generate audio")
            
            # Update message metadata with audio file path
            metadata["audio_file"] = audio_filepath
            message.message_metadata = metadata
            await session.commit()
            
            # Return relative URL for the audio file
            # audio_filepath is a string (relative path from project_root)
            if audio_filepath.startswith('data/'):
                audio_url = f"/{audio_filepath}"
            else:
                audio_url = f"/data/audio/{Path(audio_filepath).name}"
            
            return {
                "success": True,
                "audio_url": audio_url,
                "message_id": message.id,
                "generated": True
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting/generating audio for message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/personas")
async def get_personas():
    """Get list of available personas and current persona."""
    personas = await list_available_personas()
    current = await get_current_persona_name()
    current_config = await load_persona_config(current)
    current_title = "CYBER" if current == "default" else (current_config.get("title", current) if current_config else current)
    return {
        "personas": personas,
        "current": current,
        "current_title": current_title
    }


@app.get("/api/expert-types")
async def get_expert_types_endpoint():
    """Get list of available expert types."""
    expert_types = await list_expert_types()
    return {
        "expert_types": expert_types
    }


@app.get("/api/expert-types")
async def get_expert_types():
    """Get list of available expert types."""
    expert_types = await list_expert_types()
    return {
        "expert_types": expert_types
    }


@app.get("/api/location")
async def get_location():
    """Get location configuration."""
    location_config = await load_location_config()
    return location_config


# Config editing endpoints
@app.get("/api/config/persona/{persona_name}")
async def get_persona_config_endpoint(persona_name: str):
    """Get a specific persona configuration."""
    config = await load_persona_config(persona_name)
    if not config:
        raise HTTPException(status_code=404, detail=f"Persona '{persona_name}' not found")
    return config


@app.put("/api/config/persona/{persona_name}")
async def save_persona_config_endpoint(persona_name: str, request: Request):
    """Save a persona configuration."""
    try:
        config = await request.json()
        success = await save_persona_config(persona_name, config)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save persona config")
        return {"success": True, "message": f"Persona '{persona_name}' config saved"}
    except Exception as e:
        logger.error(f"Error saving persona config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/config/persona/{persona_name}")
async def create_persona_config_endpoint(persona_name: str, request: Request):
    """Create a new persona configuration."""
    try:
        config = await request.json()
        success = create_persona_config(persona_name, config)
        if not success:
            raise HTTPException(status_code=400, detail=f"Persona '{persona_name}' already exists")
        return {"success": True, "message": f"Persona '{persona_name}' created"}
    except Exception as e:
        logger.error(f"Error creating persona config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config/location")
async def get_location_config_endpoint():
    """Get location configuration."""
    location_config = await load_location_config()
    return location_config


@app.put("/api/config/location")
async def save_location_config_endpoint(request: Request):
    """Save location configuration."""
    try:
        config = await request.json()
        success = await save_location_config(config)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save location config")
        return {"success": True, "message": "Location config saved"}
    except Exception as e:
        logger.error(f"Error saving location config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Database management endpoints
@app.get("/api/database/tables")
async def get_database_tables():
    """Get list of all database tables."""
    try:
        from sqlalchemy import inspect, text
        from database.base import engine
        
        # Use run_sync to access sync inspector with async engine
        def get_tables_sync(conn):
            inspector = inspect(conn)
            return inspector.get_table_names()
        
        def get_columns_sync(conn, table_name):
            inspector = inspect(conn)
            return inspector.get_columns(table_name)
        
        def get_pk_constraint_sync(conn, table_name):
            inspector = inspect(conn)
            return inspector.get_pk_constraint(table_name)
        
        async with engine.connect() as conn:
            # Get table names using inspector
            tables = await conn.run_sync(lambda sync_conn: get_tables_sync(sync_conn))
            
            # Get table info with row counts
            table_info = []
            for table_name in sorted(tables):
                # Skip SQLAlchemy metadata tables
                if table_name.startswith('_') or table_name.startswith('alembic'):
                    continue
                
                # Get row count
                count_result = await conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
                row_count = count_result.scalar()
                
                # Get columns using inspector
                columns = await conn.run_sync(lambda sync_conn: get_columns_sync(sync_conn, table_name))
                
                # Get primary key constraint
                pk_constraint = await conn.run_sync(lambda sync_conn: get_pk_constraint_sync(sync_conn, table_name))
                pk_columns = set(pk_constraint.get("constrained_columns", []) if pk_constraint else [])
                
                column_info = [
                    {
                        "name": col["name"],
                        "type": str(col["type"]),
                        "nullable": col.get("nullable", True),
                        "primary_key": col["name"] in pk_columns
                    }
                    for col in columns
                ]
                
                table_info.append({
                    "name": table_name,
                    "row_count": row_count,
                    "columns": column_info
                })
            
            return {"success": True, "tables": table_info}
    except Exception as e:
        logger.error(f"Error getting database tables: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/database/tables/{table_name}/data")
async def get_table_data(table_name: str, page: int = 1, limit: int = 50):
    """Get paginated data from a table."""
    try:
        from sqlalchemy import inspect, text
        from database.base import engine
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if limit < 1 or limit > 1000:
            limit = 50
        
        # Validate table name (prevent SQL injection)
        # Sanitize table name - only allow alphanumeric and underscores
        if not table_name.replace('_', '').isalnum():
            raise HTTPException(status_code=400, detail="Invalid table name")
        
        # Validate table exists by checking if we can query it
        async with AsyncSessionLocal() as session:
            try:
                # Try to get table info to validate it exists
                test_query = text(f'SELECT COUNT(*) FROM "{table_name}"')
                await session.execute(test_query)
            except Exception as e:
                logger.error(f"Table validation error: {e}")
                raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found or inaccessible")
            # Get total count using parameterized query
            count_query = text(f'SELECT COUNT(*) FROM "{table_name}"')
            count_result = await session.execute(count_query)
            total_rows = count_result.scalar()
            
            # Calculate pagination
            offset = (page - 1) * limit
            total_pages = (total_rows + limit - 1) // limit if total_rows > 0 else 1
            
            # Get paginated data
            # Limit and offset are validated integers, safe to use directly
            data_query = text(f'SELECT * FROM "{table_name}" LIMIT {limit} OFFSET {offset}')
            result = await session.execute(data_query)
            
            # Get column names from result keys (works with asyncpg Row objects)
            rows_data = result.fetchall()
            columns = []
            if rows_data:
                # Get column names from first row keys
                first_row = rows_data[0]
                if hasattr(first_row, '_mapping'):
                    # SQLAlchemy 2.0 Row objects
                    columns = list(first_row._mapping.keys())
                elif hasattr(first_row, 'keys'):
                    # RowProxy objects
                    columns = list(first_row.keys())
                else:
                    # Fallback: use inspector to get column names
                    def get_columns_sync(conn, table_name):
                        inspector = inspect(conn)
                        return [col["name"] for col in inspector.get_columns(table_name)]
                    async with engine.connect() as conn:
                        columns = await conn.run_sync(lambda sync_conn: get_columns_sync(sync_conn, table_name))
            
            # Convert rows to dictionaries
            rows = []
            for row in rows_data:
                row_dict = {}
                if hasattr(row, '_mapping'):
                    # SQLAlchemy 2.0 Row objects
                    row_dict = dict(row._mapping)
                elif hasattr(row, '_asdict'):
                    # Named tuple-like
                    row_dict = row._asdict()
                elif hasattr(row, 'keys'):
                    # RowProxy - access by key
                    for key in row.keys():
                        row_dict[key] = row[key]
                else:
                    # Fallback: access by index
                    for i, col_name in enumerate(columns):
                        row_dict[col_name] = row[i] if i < len(row) else None
                
                # Convert datetime and other types to strings for JSON
                for key, value in row_dict.items():
                    if hasattr(value, 'isoformat'):
                        row_dict[key] = value.isoformat()
                    elif isinstance(value, (dict, list)):
                        import json
                        row_dict[key] = json.dumps(value) if value else None
                
                rows.append(row_dict)
            
            logger.info(f"Returning {len(rows)} rows for table {table_name}, columns: {columns}")
            
            return {
                "success": True,
                "table_name": table_name,
                "columns": columns,
                "data": rows,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total_rows": total_rows,
                    "total_pages": total_pages
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting table data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/database/tables/{table_name}/data/{row_id}")
async def update_table_row(table_name: str, row_id: int, request: Request):
    """Update a row in a table."""
    try:
        from sqlalchemy import inspect, text
        from database.base import engine
        
        # Sanitize table name
        if not table_name.replace('_', '').isalnum():
            raise HTTPException(status_code=400, detail="Invalid table name")
        
        # Get primary key column using inspector
        def get_pk_constraint_sync(conn, table_name):
            inspector = inspect(conn)
            return inspector.get_pk_constraint(table_name)
        
        def get_columns_sync(conn, table_name):
            inspector = inspect(conn)
            return inspector.get_columns(table_name)
        
        async with engine.connect() as conn:
            pk_constraint = await conn.run_sync(lambda sync_conn: get_pk_constraint_sync(sync_conn, table_name))
            columns = await conn.run_sync(lambda sync_conn: get_columns_sync(sync_conn, table_name))
        
        if not pk_constraint or not pk_constraint.get("constrained_columns"):
            raise HTTPException(status_code=400, detail="Table does not have a primary key")
        
        pk_column = pk_constraint["constrained_columns"][0]
        
        # Validate column names exist
        column_names = [col["name"] for col in columns]
        
        # Get update data
        update_data = await request.json()
        
        # Build UPDATE query with proper escaping
        set_clauses = []
        params = {"row_id": row_id}
        
        # Get valid column names
        columns = inspector.get_columns(table_name)
        column_names = [col["name"] for col in columns]
        
        for column, value in update_data.items():
            # Validate column exists
            if column not in column_names:
                continue  # Skip unknown columns
            
            # Skip primary key
            if column == pk_column:
                continue
            
            # Sanitize column name
            if not column.replace('_', '').isalnum():
                continue
            
            # Use proper parameter name (replace spaces and special chars)
            param_name = column.replace(" ", "_").replace("-", "_")
            set_clauses.append(f'"{column}" = :{param_name}')
            params[param_name] = value
        
        if not set_clauses:
            raise HTTPException(status_code=400, detail="No valid columns to update")
        
        async with AsyncSessionLocal() as session:
            # Use proper quoting for table and column names
            query = text(
                f'UPDATE "{table_name}" SET {", ".join(set_clauses)} WHERE "{pk_column}" = :row_id'
            )
            result = await session.execute(query, params)
            await session.commit()
            
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Row not found")
            
            return {"success": True, "message": "Row updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating table row: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config/api_keys")
async def get_api_keys_config_endpoint():
    """Get API keys configuration."""
    api_keys_config = await load_api_keys()
    return api_keys_config


@app.put("/api/config/api_keys")
async def save_api_keys_config_endpoint(request: Request):
    """Save API keys configuration."""
    try:
        config = await request.json()
        success = await save_api_keys(config)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save API keys config")
        return {"success": True, "message": "API keys config saved"}
    except Exception as e:
        logger.error(f"Error saving API keys config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config/system")
async def get_system_config_endpoint():
    """Get system configuration from database."""
    try:
        from database.base import AsyncSessionLocal
        from database.models import SystemConfig
        from sqlalchemy import select
        
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(SystemConfig))
            config_items = result.scalars().all()
            
            if config_items:
                config = {}
                for item in config_items:
                    config[item.config_key] = item.config_value
                return config
            else:
                # Return default config if nothing in database
                return {
                    "paths": {
                        "music_directory": "/Users/davidnorminton/Music",
                        "audio_directory": "data/audio",
                        "data_directory": "data"
                    },
                    "server": {
                        "host": "0.0.0.0",
                        "port": 1337,
                        "websocket_port": 8765,
                        "database_url": "postgresql+asyncpg://dragonfly:dragonfly@localhost:5432/dragonfly",
                        "log_level": "INFO"
                    },
                    "ai": {
                        "default_model": "claude-3-5-haiku-20241022"
                    },
                    "processing": {
                        "max_concurrent_jobs": 10,
                        "job_timeout": 300
                    },
                    "music": {
                        "auto_scan_on_startup": False,
                        "cache_album_covers": True
                    }
                }
    except Exception as e:
        logger.error(f"Error loading system config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/config/system")
async def save_system_config_endpoint(request: Request):
    """Save system configuration to database."""
    try:
        from database.base import AsyncSessionLocal
        from database.models import SystemConfig
        from sqlalchemy import select
        
        config = await request.json()
        
        async with AsyncSessionLocal() as session:
            for key, value in config.items():
                result = await session.execute(
                    select(SystemConfig).where(SystemConfig.config_key == key)
                )
                existing = result.scalar_one_or_none()
                
                if existing:
                    existing.config_value = value
                else:
                    session.add(SystemConfig(config_key=key, config_value=value))
            
            await session.commit()
            logger.info("System config saved successfully to database")
            return {"success": True, "message": "System config saved"}
    except Exception as e:
        logger.error(f"Error saving system config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config/router")
async def get_router_config_endpoint():
    """Get router configuration."""
    cfg = await load_router_config()
    if cfg is None:
        raise HTTPException(status_code=404, detail="router.config not found")
    return cfg


@app.put("/api/config/router")
async def save_router_config_endpoint(request: Request):
    """Save router configuration."""
    try:
        cfg = await request.json()
        if not isinstance(cfg, dict):
            raise HTTPException(status_code=400, detail="Router config must be a JSON object")
        if not await save_router_config(cfg):
            raise HTTPException(status_code=500, detail="Failed to save router config")
        return {"success": True, "message": "Router config saved"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving router config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def _fetch_account_info(account_number: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Fetch account information from Octopus Energy API. Returns account data or None."""
    try:
        account_url = f"https://api.octopus.energy/v1/accounts/{account_number}/"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(account_url, auth=(api_key, ""))
            
            if response.status_code == 200:
                account_data = response.json()
                logger.info(f"Successfully fetched account data for {account_number}")
                return account_data
            else:
                logger.warning(f"Account endpoint returned {response.status_code} for account {account_number}")
                return None
    except Exception as e:
        logger.warning(f"Error fetching account info: {e}")
        return None


async def _get_tariff_from_account(account_data: Dict[str, Any], meter_point: str) -> Optional[str]:
    """Extract tariff code from account data for a specific meter point."""
    try:
        now = datetime.now(timezone.utc)
        
        # Iterate through properties
        for property_data in account_data.get("properties", []):
            # Check electricity meter points
            for mp_data in property_data.get("electricity_meter_points", []):
                if mp_data.get("mpan") == meter_point:
                    # Find current agreement
                    for agreement in mp_data.get("agreements", []):
                        valid_from = datetime.fromisoformat(agreement["valid_from"].replace('Z', '+00:00'))
                        valid_to = datetime.fromisoformat(agreement["valid_to"].replace('Z', '+00:00')) if agreement.get("valid_to") else None
                        if valid_from <= now and (not valid_to or valid_to >= now):
                            tariff_code = agreement.get("tariff_code")
                            logger.info(f"Found tariff code from account endpoint: {tariff_code}")
                            return tariff_code
    except Exception as e:
        logger.warning(f"Error extracting tariff from account data: {e}")
    
    return None


async def _fetch_and_store_tariff(meter_point: str, api_key: str, account_number: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Fetch tariff information and store in database. Returns tariff info or None."""
    try:
        tariff_code = None
        
        # First, try account endpoint if account number is provided
        if account_number:
            account_data = await _fetch_account_info(account_number, api_key)
            if account_data:
                tariff_code = await _get_tariff_from_account(account_data, meter_point)
        
        # If account endpoint didn't work, try agreements endpoint
        if not tariff_code:
            agreements_url = f"https://api.octopus.energy/v1/electricity-meter-points/{meter_point}/agreements/"
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                agreements_response = await client.get(agreements_url, auth=(api_key, ""))
                
                if agreements_response.status_code == 200:
                    try:
                        agreements_data = agreements_response.json()
                        # Find current agreement
                        now = datetime.now(timezone.utc)
                        for agreement in agreements_data.get("results", []):
                            valid_from = datetime.fromisoformat(agreement["valid_from"].replace('Z', '+00:00'))
                            valid_to = datetime.fromisoformat(agreement["valid_to"].replace('Z', '+00:00')) if agreement.get("valid_to") else None
                            if valid_from <= now and (not valid_to or valid_to >= now):
                                tariff_code = agreement.get("tariff_code")
                                logger.info(f"Found tariff code from agreements: {tariff_code}")
                                break
                    except Exception as e:
                        logger.warning(f"Error parsing agreements data: {e}")
        
        if not tariff_code:
            # Try to get from database - might have been manually set
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(OctopusEnergyTariff)
                    .where(OctopusEnergyTariff.meter_point == meter_point)
                    .order_by(desc(OctopusEnergyTariff.valid_from))
                    .limit(1)
                )
                existing_tariff = result.scalar_one_or_none()
                if existing_tariff and existing_tariff.tariff_code:
                    tariff_code = existing_tariff.tariff_code
                    logger.info(f"Using tariff code from database: {tariff_code}")
        
        if not tariff_code:
            logger.warning(f"Could not find tariff code for meter point {meter_point} - tariff lookup will be skipped")
            return None
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            
            # Get product info
            product_code = tariff_code.split("-")[0] if "-" in tariff_code else None
            if not product_code:
                # Try to extract from tariff code
                parts = tariff_code.split("-")
                if len(parts) >= 2:
                    product_code = "-".join(parts[:-1])
            
            # Get product details
            product_url = f"https://api.octopus.energy/v1/products/{tariff_code.split('/')[-1] if '/' in tariff_code else tariff_code}/"
            product_response = await client.get(product_url)
            if product_response.status_code != 200:
                # Try with product code
                if product_code:
                    product_url = f"https://api.octopus.energy/v1/products/{product_code}/"
                    product_response = await client.get(product_url)
            
            product_data = product_response.json() if product_response.status_code == 200 else {}
            is_prepay = product_data.get("is_prepay", False)
            
            # Get electricity tariffs for this product
            tariffs_url = f"https://api.octopus.energy/v1/products/{product_code or tariff_code}/electricity-tariffs/"
            tariffs_response = await client.get(tariffs_url)
            if tariffs_response.status_code != 200:
                return None
            
            tariffs_data = tariffs_response.json()
            
            # Find prepay tariff or first available
            active_tariff = None
            for tariff in tariffs_data.get("results", []):
                if is_prepay:
                    # Look for prepay-specific tariff
                    if "prepay" in tariff.get("code", "").lower() or tariff.get("code") == tariff_code:
                        active_tariff = tariff
                        break
                else:
                    # For non-prepay, use first or matching
                    if tariff.get("code") == tariff_code or not active_tariff:
                        active_tariff = tariff
            
            if not active_tariff and tariffs_data.get("results"):
                active_tariff = tariffs_data["results"][0]
            
            if not active_tariff:
                return None
            
            # Get unit rates - try different endpoint patterns
            unit_rates_url = None
            if active_tariff.get("direct_debit_monthly"):
                unit_rates_url = f"{active_tariff['direct_debit_monthly']}/standard-unit-rates/"
            elif active_tariff.get("links"):
                for link in active_tariff["links"]:
                    if link.get("rel") == "self":
                        unit_rates_url = f"{link['href']}/standard-unit-rates/"
                        break
            
            if not unit_rates_url:
                # Fallback: construct from tariff code
                tariff_code_clean = active_tariff.get("code") or tariff_code
                unit_rates_url = f"https://api.octopus.energy/v1/products/{product_code or tariff_code_clean.split('-')[0]}/electricity-tariffs/{tariff_code_clean}/standard-unit-rates/"
            
            unit_rates_response = await client.get(unit_rates_url)
            if unit_rates_response.status_code != 200:
                logger.warning(f"Could not fetch unit rates from {unit_rates_url}")
                return None
            
            unit_rates_data = unit_rates_response.json()
            
            # Get current rate
            current_rate = None
            valid_from_dt = None
            valid_to_dt = None
            now = datetime.now(timezone.utc)
            for rate in unit_rates_data.get("results", []):
                valid_from = datetime.fromisoformat(rate["valid_from"].replace('Z', '+00:00'))
                valid_to = datetime.fromisoformat(rate["valid_to"].replace('Z', '+00:00')) if rate.get("valid_to") else None
                if valid_from <= now and (not valid_to or valid_to >= now):
                    current_rate = rate["value_inc_vat"]
                    valid_from_dt = valid_from
                    valid_to_dt = valid_to
                    break
            
            # Get standing charge
            standing_charge_url = unit_rates_url.replace("/standard-unit-rates/", "/standing-charges/")
            standing_charge_response = await client.get(standing_charge_url)
            standing_charge_data = standing_charge_response.json() if standing_charge_response.status_code == 200 else {}
            
            current_standing_charge = None
            for charge in standing_charge_data.get("results", []):
                valid_from = datetime.fromisoformat(charge["valid_from"].replace('Z', '+00:00'))
                valid_to = datetime.fromisoformat(charge["valid_to"].replace('Z', '+00:00')) if charge.get("valid_to") else None
                if valid_from <= now and (not valid_to or valid_to >= now):
                    current_standing_charge = charge["value_inc_vat"]
                    break
            
            if current_rate is None:
                return None
            
            # Store in database
            async with AsyncSessionLocal() as session:
                # Check if we have a current tariff record
                result = await session.execute(
                    select(OctopusEnergyTariff)
                    .where(OctopusEnergyTariff.meter_point == meter_point)
                    .where(
                        or_(
                            OctopusEnergyTariff.valid_to.is_(None),
                            OctopusEnergyTariff.valid_to >= now
                        )
                    )
                    .order_by(desc(OctopusEnergyTariff.valid_from))
                    .limit(1)
                )
                existing = result.scalar_one_or_none()
                
                # Only create new record if rate changed or no existing record
                if not existing or existing.unit_rate != current_rate:
                    # Mark old record as expired if exists
                    if existing:
                        existing.valid_to = now
                    
                    # Create new tariff record
                    tariff_record = OctopusEnergyTariff(
                        meter_point=meter_point,
                        tariff_code=tariff_code,
                        product_name=product_data.get("display_name", ""),
                        is_prepay="true" if is_prepay else "false",
                        unit_rate=current_rate,
                        standing_charge=current_standing_charge,
                        valid_from=valid_from_dt or now,
                        valid_to=valid_to_dt
                    )
                    session.add(tariff_record)
                    await session.commit()
                    logger.info(f"Stored new tariff: {current_rate}p/kWh for meter {meter_point}")
            
            return {
                "success": True,
                "tariff_code": tariff_code,
                "product_name": product_data.get("display_name", ""),
                "is_prepay": is_prepay,
                "unit_rate": current_rate,
                "standing_charge": current_standing_charge,
            }
    except Exception as e:
        logger.error(f"Error fetching Octopus Energy tariff: {e}", exc_info=True)
        return None


@app.get("/api/octopus/tariff")
async def get_octopus_tariff():
    """Get tariff information for the meter to calculate costs."""
    try:
        api_key = await _get_octopus_api_key()
        if not api_key:
            return {
                "success": False,
                "error": "Octopus Energy API key not configured"
            }
        
        account_number = await _get_octopus_account_number()
        meter_point = "2343383923410"  # Default fallback
        
        # Get meter point from account if account number is available
        if account_number:
            meter_info = await _get_meter_info_from_account(account_number, api_key)
            if meter_info:
                meter_point = meter_info.get("meter_point", meter_point)
        
        # Check for manual override in system config
        try:
            async with AsyncSessionLocal() as session:
                system_config_result = await session.execute(
                    select(SystemConfig).where(SystemConfig.config_key == "system")
                )
                system_config = system_config_result.scalar_one_or_none()
                if system_config and system_config.config_value:
                    octopus_config = system_config.config_value.get("octopus", {})
                    if octopus_config.get("unit_rate_override"):
                        # Use manual override
                        return {
                            "success": True,
                            "tariff_code": octopus_config.get("tariff_code", "MANUAL"),
                            "product_name": "Manual Configuration",
                            "is_prepay": False,
                            "unit_rate": float(octopus_config["unit_rate_override"]),
                            "standing_charge": None,
                            "manual_override": True
                        }
        except Exception as config_err:
            logger.debug(f"Could not check system config for override: {config_err}")
        
        # Try to get from database first
        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(OctopusEnergyTariff)
                .where(OctopusEnergyTariff.meter_point == meter_point)
                .where(
                    or_(
                        OctopusEnergyTariff.valid_to.is_(None),
                        OctopusEnergyTariff.valid_to >= now
                    )
                )
                .order_by(desc(OctopusEnergyTariff.valid_from))
                .limit(1)
            )
            db_tariff = result.scalar_one_or_none()
            
            # Check if tariff is recent (less than 24 hours old)
            if db_tariff:
                age_hours = (now - db_tariff.updated_at.replace(tzinfo=timezone.utc)).total_seconds() / 3600
                if age_hours < 24:
                    return {
                        "success": True,
                        "tariff_code": db_tariff.tariff_code,
                        "product_name": db_tariff.product_name,
                        "is_prepay": db_tariff.is_prepay == "true",
                        "unit_rate": db_tariff.unit_rate,
                        "standing_charge": db_tariff.standing_charge,
                        "cached": True
                    }
        
        # Fetch fresh tariff data
        tariff_info = await _fetch_and_store_tariff(meter_point, api_key, account_number)
        
        if tariff_info:
            return tariff_info
        else:
            # Return database record if available, even if old
            if db_tariff:
                return {
                    "success": True,
                    "tariff_code": db_tariff.tariff_code,
                    "product_name": db_tariff.product_name,
                    "is_prepay": db_tariff.is_prepay == "true",
                    "unit_rate": db_tariff.unit_rate,
                    "standing_charge": db_tariff.standing_charge,
                    "cached": True,
                    "warning": "Using cached tariff data"
                }
            return {
                "success": False,
                "error": "Tariff code not found",
                "message": "Unable to determine tariff for cost calculation"
            }
    except Exception as e:
        logger.error(f"Error in get_octopus_tariff: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to fetch tariff information"
        }


@app.get("/api/octopus/consumption")
async def get_octopus_consumption():
    """Get electricity consumption data from Octopus Energy API."""
    try:
        # Octopus Energy API credentials
        api_key = await _get_octopus_api_key()
        if not api_key:
            return {
                "success": False,
                "error": "Octopus Energy API key not configured"
            }
        
        account_number = await _get_octopus_account_number()
        meter_point = "2343383923410"  # Default fallback
        meter_serial = "22L4381884"  # Default fallback
        
        # Get meter info from account if account number is available
        if account_number:
            meter_info = await _get_meter_info_from_account(account_number, api_key)
            if meter_info:
                meter_point = meter_info.get("meter_point", meter_point)
                meter_serial = meter_info.get("meter_serial", meter_serial)
        
        # Build the API URL
        url = f"https://api.octopus.energy/v1/electricity-meter-points/{meter_point}/meters/{meter_serial}/consumption/"
        
        # Calculate period: last 30 days to ensure we get data
        now = datetime.now(timezone.utc)
        period_to = now
        period_from = now - timedelta(days=30)
        
        # Make authenticated request with pagination
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Handle pagination - fetch all pages
            all_results = []
            next_url = None
            page_count = 0
            
            while True:
                if next_url:
                    # Fetch next page
                    response = await client.get(next_url, auth=(api_key, ""))
                else:
                    # First page
                    response = await client.get(
                        url,
                        auth=(api_key, ""),
                        params={
                            "page_size": 1000,  # Increased to get more data per page
                            "period_from": period_from.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "period_to": period_to.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "order_by": "period"
                        }
                    )
                
                response.raise_for_status()
                data = response.json()
                
                results = data.get("results", [])
                all_results.extend(results)
                page_count += 1
                logger.info(f"[OCTOPUS API] Fetched page {page_count} with {len(results)} readings")
                
                # Check for next page
                next_url = data.get("next")
                if not next_url:
                    break
            
            logger.info(f"[OCTOPUS API] Total readings fetched: {len(all_results)}")
            
            # Results come in chronological order (oldest first) with order_by=period
            results = all_results
            if results:
                results.reverse()  # Reverse to show most recent first
            
            # Store readings in database
            stored_count = 0
            try:
                async with AsyncSessionLocal() as session:
                    for reading in results:
                        interval_start_str = reading.get("interval_start")
                        interval_end_str = reading.get("interval_end")
                        consumption = reading.get("consumption")
                        
                        if not interval_start_str or consumption is None:
                            continue
                        
                        # Parse datetime strings
                        try:
                            interval_start = datetime.fromisoformat(interval_start_str.replace('Z', '+00:00'))
                            interval_end = datetime.fromisoformat(interval_end_str.replace('Z', '+00:00')) if interval_end_str else None
                        except Exception as parse_err:
                            logger.warning(f"Failed to parse date: {interval_start_str} - {parse_err}")
                            continue
                        
                        # Check if this reading already exists
                        existing = await session.execute(
                            select(OctopusEnergyConsumption).where(
                                OctopusEnergyConsumption.interval_start == interval_start,
                                OctopusEnergyConsumption.meter_point == meter_point,
                                OctopusEnergyConsumption.meter_serial == meter_serial
                            )
                        )
                        if existing.scalar_one_or_none():
                            continue  # Already stored
                        
                        # Create new record
                        consumption_record = OctopusEnergyConsumption(
                            interval_start=interval_start,
                            interval_end=interval_end,
                            consumption=consumption,
                            meter_point=meter_point,
                            meter_serial=meter_serial
                        )
                        session.add(consumption_record)
                        stored_count += 1
                    
                    if stored_count > 0:
                        await session.commit()
                        logger.info(f"Octopus Energy: Stored {stored_count} new consumption readings")
            except Exception as db_err:
                logger.warning(f"Failed to store Octopus Energy data: {db_err}")
                # Continue even if storage fails
            
            logger.info(f"Octopus Energy: Retrieved {len(results)} consumption readings")
            
            # Log the date range of fetched data
            if results:
                latest_reading = results[0] if results else None  # Most recent (after reverse)
                oldest_reading = results[-1] if results else None
                if latest_reading:
                    latest_date = latest_reading.get("interval_start", "unknown")
                    logger.info(f"[OCTOPUS API] Latest reading date: {latest_date}")
                if oldest_reading:
                    oldest_date = oldest_reading.get("interval_start", "unknown")
                    logger.info(f"[OCTOPUS API] Oldest reading date: {oldest_date}")
            
            # If no results, return error message
            if not results:
                return {
                    "success": False,
                    "error": "No consumption data available",
                    "message": f"No consumption data found for meter {meter_serial} in the last 30 days. Data may not be available yet.",
                    "results": []
                }
            
            # Get tariff information from database for cost calculation
            tariff_info = None
            unit_rate_pence = None
            try:
                now = datetime.now(timezone.utc)
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        select(OctopusEnergyTariff)
                        .where(OctopusEnergyTariff.meter_point == meter_point)
                        .where(
                            or_(
                                OctopusEnergyTariff.valid_to.is_(None),
                                OctopusEnergyTariff.valid_to >= now
                            )
                        )
                        .order_by(desc(OctopusEnergyTariff.valid_from))
                        .limit(1)
                    )
                    db_tariff = result.scalar_one_or_none()
                    if db_tariff:
                        tariff_info = {
                            "success": True,
                            "tariff_code": db_tariff.tariff_code,
                            "product_name": db_tariff.product_name,
                            "is_prepay": db_tariff.is_prepay == "true",
                            "unit_rate": db_tariff.unit_rate,
                            "standing_charge": db_tariff.standing_charge,
                        }
                        unit_rate_pence = db_tariff.unit_rate
            except Exception as tariff_err:
                logger.debug(f"Could not get tariff info from database: {tariff_err}")
            
            # Calculate costs if tariff info is available
            if unit_rate_pence:
                for reading in results:
                    consumption = reading.get("consumption", 0)
                    if consumption:
                        # Convert pence per kWh to cost
                        cost_pence = consumption * unit_rate_pence
                        reading["cost_pence"] = round(cost_pence, 2)
                        reading["cost_pounds"] = round(cost_pence / 100, 2)
            
            # Also check what's in the database to see latest stored data
            latest_db_date = None
            try:
                async with AsyncSessionLocal() as session:
                    db_result = await session.execute(
                        select(OctopusEnergyConsumption)
                        .where(
                            OctopusEnergyConsumption.meter_point == meter_point,
                            OctopusEnergyConsumption.meter_serial == meter_serial
                        )
                        .order_by(desc(OctopusEnergyConsumption.interval_start))
                        .limit(1)
                    )
                    latest_db = db_result.scalar_one_or_none()
                    if latest_db:
                        latest_db_date = latest_db.interval_start.isoformat()
                        logger.info(f"[OCTOPUS API] Latest data in database: {latest_db_date}")
            except Exception as db_check_err:
                logger.debug(f"Could not check database for latest data: {db_check_err}")
            
            return {
                "success": True,
                "results": results,
                "count": len(all_results),
                "stored": stored_count,
                "tariff": tariff_info,
                "latest_db_date": latest_db_date,
                "pages_fetched": page_count
            }
    except httpx.HTTPStatusError as e:
        error_text = ""
        try:
            error_text = e.response.text
        except:
            pass
        logger.error(f"Octopus Energy API error: {e.response.status_code} - {error_text}")
        return {
            "success": False,
            "error": f"API error: {e.response.status_code}",
            "message": error_text or "Failed to fetch consumption data",
            "details": error_text
        }
    except Exception as e:
        logger.error(f"Error fetching Octopus Energy data: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to fetch consumption data"
        }


@app.get("/api/octopus/history")
async def get_octopus_history(days: int = 7):
    """Get historical Octopus Energy consumption data from database for graphing."""
    try:
        account_number = await _get_octopus_account_number()
        meter_point = "2343383923410"  # Default fallback
        meter_serial = "22L4381884"  # Default fallback
        
        # Get meter info from account if account number is available
        if account_number:
            api_key = await _get_octopus_api_key()
            if api_key:
                meter_info = await _get_meter_info_from_account(account_number, api_key)
                if meter_info:
                    meter_point = meter_info.get("meter_point", meter_point)
                    meter_serial = meter_info.get("meter_serial", meter_serial)
        
        # Calculate date range
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(OctopusEnergyConsumption)
                .where(
                    OctopusEnergyConsumption.meter_point == meter_point,
                    OctopusEnergyConsumption.meter_serial == meter_serial,
                    OctopusEnergyConsumption.interval_start >= start_date,
                    OctopusEnergyConsumption.interval_start <= end_date
                )
                .order_by(OctopusEnergyConsumption.interval_start)
            )
            readings = result.scalars().all()
            
            # Get tariff rates for the period (for Agile tariffs with variable rates)
            tariff_rates = {}
            tariff_info = None
            unit_rate_pence = None
            try:
                now = datetime.now(timezone.utc)
                result_tariff = await session.execute(
                    select(OctopusEnergyTariff)
                    .where(OctopusEnergyTariff.meter_point == meter_point)
                    .order_by(desc(OctopusEnergyTariff.valid_from))
                    .limit(1)
                )
                db_tariff = result_tariff.scalar_one_or_none()
                
                if db_tariff:
                    tariff_info = {
                        "success": True,
                        "tariff_code": db_tariff.tariff_code,
                        "product_name": db_tariff.product_name,
                        "is_prepay": db_tariff.is_prepay == "true",
                        "unit_rate": db_tariff.unit_rate,
                        "standing_charge": db_tariff.standing_charge,
                    }
                    unit_rate_pence = db_tariff.unit_rate  # Default fallback
                    
                    # Get historical rates if available
                    if db_tariff.tariff_code:
                        result_rates = await session.execute(
                            select(OctopusEnergyTariffRate)
                            .where(
                                OctopusEnergyTariffRate.meter_point == meter_point,
                                OctopusEnergyTariffRate.tariff_code == db_tariff.tariff_code,
                                OctopusEnergyTariffRate.valid_from >= start_date,
                                OctopusEnergyTariffRate.valid_from <= end_date
                            )
                            .order_by(OctopusEnergyTariffRate.valid_from)
                        )
                        rates = result_rates.scalars().all()
                        
                        # Create a lookup dict: timestamp -> rate
                        for rate in rates:
                            tariff_rates[rate.valid_from.isoformat()] = rate.unit_rate
            except Exception as e:
                logger.debug(f"Could not get tariff rates: {e}")
            
            # Format data for charting
            chart_data = []
            total_cost = 0
            for reading in readings:
                # Try to find matching tariff rate for this reading
                reading_rate = unit_rate_pence
                if tariff_rates:
                    # Find the rate that applies to this reading
                    reading_time = reading.interval_start
                    # Find the closest rate that's <= reading_time
                    for rate_time_str, rate_value in sorted(tariff_rates.items(), reverse=True):
                        rate_time = datetime.fromisoformat(rate_time_str.replace('Z', '+00:00'))
                        if rate_time <= reading_time:
                            reading_rate = rate_value
                            break
                
                cost_pence = None
                cost_pounds = None
                if reading_rate:
                    cost_pence = reading.consumption * reading_rate
                    cost_pounds = cost_pence / 100
                    total_cost += cost_pounds
                
                chart_data.append({
                    "date": reading.interval_start.isoformat(),
                    "consumption": reading.consumption,
                    "cost_pence": round(cost_pence, 2) if cost_pence else None,
                    "cost_pounds": round(cost_pounds, 2) if cost_pounds else None,
                    "unit_rate": reading_rate,
                    "interval_start": reading.interval_start.isoformat(),
                    "interval_end": reading.interval_end.isoformat() if reading.interval_end else None
                })
            
            return {
                "success": True,
                "data": chart_data,
                "count": len(chart_data),
                "days": days,
                "total_cost_pounds": round(total_cost, 2) if total_cost else None,
                "tariff": tariff_info
            }
    except Exception as e:
        logger.error(f"Error fetching Octopus Energy history: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to fetch historical data"
        }


@app.post("/api/octopus/refresh")
async def refresh_octopus_data():
    """Manually trigger a refresh of Octopus Energy consumption and tariff data."""
    try:
        logger.info("[OCTOPUS REFRESH] Manual refresh triggered")
        
        # Trigger consumption fetch
        api_key = await _get_octopus_api_key()
        if not api_key:
            return {
                "success": False,
                "error": "Octopus Energy API key not configured"
            }
        
        account_number = await _get_octopus_account_number()
        meter_point = "2343383923410"  # Default fallback
        meter_serial = "22L4381884"  # Default fallback
        
        # Get meter info from account if account number is available
        if account_number:
            meter_info = await _get_meter_info_from_account(account_number, api_key)
            if meter_info:
                meter_point = meter_info.get("meter_point", meter_point)
                meter_serial = meter_info.get("meter_serial", meter_serial)
        
        # Fetch consumption data
        now = datetime.now(timezone.utc)
        period_to = now
        period_from = now - timedelta(days=7)
        
        url = f"https://api.octopus.energy/v1/electricity-meter-points/{meter_point}/meters/{meter_serial}/consumption/"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            all_results = []
            next_url = None
            page_count = 0
            
            while True:
                if next_url:
                    response = await client.get(next_url, auth=(api_key, ""))
                else:
                    response = await client.get(
                        url,
                        auth=(api_key, ""),
                        params={
                            "page_size": 1000,
                            "period_from": period_from.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "period_to": period_to.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "order_by": "period"
                        }
                    )
                
                response.raise_for_status()
                data = response.json()
                
                results = data.get("results", [])
                all_results.extend(results)
                page_count += 1
                logger.info(f"[OCTOPUS REFRESH] Fetched page {page_count} with {len(results)} readings")
                
                next_url = data.get("next")
                if not next_url:
                    break
            
            logger.info(f"[OCTOPUS REFRESH] Total readings fetched: {len(all_results)}")
            
            # Store new readings
            stored_count = 0
            async with AsyncSessionLocal() as session:
                for reading in all_results:
                    interval_start_str = reading.get("interval_start")
                    consumption = reading.get("consumption")
                    
                    if not interval_start_str or consumption is None:
                        continue
                    
                    try:
                        interval_start = datetime.fromisoformat(interval_start_str.replace('Z', '+00:00'))
                    except Exception:
                        continue
                    
                    # Check if exists
                    existing = await session.execute(
                        select(OctopusEnergyConsumption).where(
                            OctopusEnergyConsumption.interval_start == interval_start,
                            OctopusEnergyConsumption.meter_point == meter_point,
                            OctopusEnergyConsumption.meter_serial == meter_serial
                        )
                    )
                    if existing.scalar_one_or_none():
                        continue
                    
                    interval_end_str = reading.get("interval_end")
                    interval_end = datetime.fromisoformat(interval_end_str.replace('Z', '+00:00')) if interval_end_str else None
                    
                    consumption_record = OctopusEnergyConsumption(
                        interval_start=interval_start,
                        interval_end=interval_end,
                        consumption=consumption,
                        meter_point=meter_point,
                        meter_serial=meter_serial
                    )
                    session.add(consumption_record)
                    stored_count += 1
                
                if stored_count > 0:
                    await session.commit()
                    logger.info(f"[OCTOPUS REFRESH] Stored {stored_count} new consumption readings")
        
        # Also refresh tariff data
        tariff_info = await _fetch_and_store_tariff(meter_point, api_key, account_number)
        
        return {
            "success": True,
            "message": f"Refreshed Octopus Energy data. Stored {stored_count} new consumption readings.",
            "consumption_readings_stored": stored_count,
            "tariff_updated": tariff_info is not None
        }
    except Exception as e:
        logger.error(f"[OCTOPUS REFRESH] Error: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/api/octopus/tariff-history")
async def get_octopus_tariff_history(days: int = 7):
    """Get historical Octopus Energy tariff rates from database for graphing."""
    try:
        account_number = await _get_octopus_account_number()
        meter_point = "2343383923410"  # Default fallback
        
        # Get meter point from account if account number is available
        if account_number:
            api_key = await _get_octopus_api_key()
            if api_key:
                meter_info = await _get_meter_info_from_account(account_number, api_key)
                if meter_info:
                    meter_point = meter_info.get("meter_point", meter_point)
        
        # Calculate date range
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        async with AsyncSessionLocal() as session:
            # Get current tariff code
            result_tariff = await session.execute(
                select(OctopusEnergyTariff)
                .where(OctopusEnergyTariff.meter_point == meter_point)
                .order_by(desc(OctopusEnergyTariff.valid_from))
                .limit(1)
            )
            db_tariff = result_tariff.scalar_one_or_none()
            
            if not db_tariff or not db_tariff.tariff_code:
                return {
                    "success": False,
                    "error": "No tariff code found",
                    "message": "Please configure tariff code in settings"
                }
            
            # Get historical rates
            result_rates = await session.execute(
                select(OctopusEnergyTariffRate)
                .where(
                    OctopusEnergyTariffRate.meter_point == meter_point,
                    OctopusEnergyTariffRate.tariff_code == db_tariff.tariff_code,
                    OctopusEnergyTariffRate.valid_from >= start_date,
                    OctopusEnergyTariffRate.valid_from <= end_date
                )
                .order_by(OctopusEnergyTariffRate.valid_from)
            )
            rates = result_rates.scalars().all()
            
            # Format data for charting
            chart_data = []
            for rate in rates:
                chart_data.append({
                    "date": rate.valid_from.isoformat(),
                    "unit_rate": rate.unit_rate,
                    "unit_rate_pounds": round(rate.unit_rate / 100, 4),
                    "valid_from": rate.valid_from.isoformat(),
                    "valid_to": rate.valid_to.isoformat() if rate.valid_to else None
                })
            
            return {
                "success": True,
                "data": chart_data,
                "tariff_code": db_tariff.tariff_code,
                "product_name": db_tariff.product_name
            }
    except Exception as e:
        logger.error(f"Error fetching tariff history: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to fetch tariff history"
        }


# Alarm API endpoints
@app.get("/api/alarms")
async def get_alarms():
    """Get all alarms."""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Alarm)
                .order_by(Alarm.alarm_time)
            )
            alarms = result.scalars().all()
            
            alarms_data = []
            for alarm in alarms:
                alarms_data.append({
                    "id": alarm.id,
                    "alarm_type": alarm.alarm_type.value,
                    "alarm_time": alarm.alarm_time.isoformat(),
                    "reason": alarm.reason,
                    "audio_file": alarm.audio_file,
                    "is_active": alarm.is_active == "true",
                    "triggered": alarm.triggered == "true",
                    "triggered_at": alarm.triggered_at.isoformat() if alarm.triggered_at else None,
                    "recurring_days": alarm.recurring_days,
                    "created_at": alarm.created_at.isoformat() if alarm.created_at else None
                })
            
            return {
                "success": True,
                "alarms": alarms_data
            }
    except Exception as e:
        logger.error(f"Error fetching alarms: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


@app.post("/api/alarms")
async def create_alarm(request: Request):
    """Create a new alarm."""
    try:
        payload = await request.json()
        alarm_type_str = payload.get("alarm_type", "time")
        alarm_time_str = payload.get("alarm_time")
        reason = payload.get("reason", "")
        audio_file = payload.get("audio_file")
        recurring_days = payload.get("recurring_days")  # List of day numbers (0=Monday, 6=Sunday)
        
        if not alarm_time_str:
            return {
                "success": False,
                "error": "alarm_time is required"
            }
        
        # Parse alarm time (time only, date will be ignored for recurring alarms)
        try:
            alarm_time = datetime.fromisoformat(alarm_time_str.replace('Z', '+00:00'))
        except Exception as e:
            return {
                "success": False,
                "error": f"Invalid alarm_time format: {e}"
            }
        
        # Parse alarm type
        try:
            alarm_type = AlarmType(alarm_type_str)
        except ValueError:
            alarm_type = AlarmType.TIME
        
        async with AsyncSessionLocal() as session:
            alarm = Alarm(
                alarm_type=alarm_type,
                alarm_time=alarm_time,
                reason=reason,
                audio_file=audio_file,
                recurring_days=recurring_days if recurring_days else None,
                is_active="true",
                triggered="false"
            )
            session.add(alarm)
            await session.commit()
            await session.refresh(alarm)
            
            logger.info(f"Created alarm: {alarm_type.value} at {alarm_time}")
            
            return {
                "success": True,
                "alarm": {
                    "id": alarm.id,
                    "alarm_type": alarm.alarm_type.value,
                    "alarm_time": alarm.alarm_time.isoformat(),
                    "reason": alarm.reason,
                    "audio_file": alarm.audio_file,
                    "recurring_days": alarm.recurring_days,
                    "is_active": alarm.is_active == "true"
                }
            }
    except Exception as e:
        logger.error(f"Error creating alarm: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


@app.delete("/api/alarms/{alarm_id}")
async def delete_alarm(alarm_id: int):
    """Delete an alarm."""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Alarm).where(Alarm.id == alarm_id)
            )
            alarm = result.scalar_one_or_none()
            
            if not alarm:
                return {
                    "success": False,
                    "error": "Alarm not found"
                }
            
            await session.delete(alarm)
            await session.commit()
            
            logger.info(f"Deleted alarm {alarm_id}")
            
            return {
                "success": True,
                "message": "Alarm deleted"
            }
    except Exception as e:
        logger.error(f"Error deleting alarm: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


@app.post("/api/alarms/{alarm_id}/toggle")
async def toggle_alarm(alarm_id: int):
    """Toggle alarm active state."""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Alarm).where(Alarm.id == alarm_id)
            )
            alarm = result.scalar_one_or_none()
            
            if not alarm:
                return {
                    "success": False,
                    "error": "Alarm not found"
                }
            
            alarm.is_active = "false" if alarm.is_active == "true" else "true"
            await session.commit()
            
            return {
                "success": True,
                "is_active": alarm.is_active == "true"
            }
    except Exception as e:
        logger.error(f"Error toggling alarm: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


@app.get("/api/alarms/check")
async def check_alarms():
    """Check for alarms that should be triggered. Returns alarms that need to fire."""
    try:
        now = datetime.now(timezone.utc)
        current_time = now.time()
        current_weekday = now.weekday()  # 0=Monday, 6=Sunday
        
        async with AsyncSessionLocal() as session:
            # Get all active alarms
            result = await session.execute(
                select(Alarm)
                .where(Alarm.is_active == "true")
            )
            all_alarms = result.scalars().all()
            
            alarms_to_trigger = []
            for alarm in all_alarms:
                alarm_time_only = alarm.alarm_time.time()
                
                # Check if time matches (within 1 minute window)
                time_diff = abs((current_time.hour * 60 + current_time.minute) - 
                               (alarm_time_only.hour * 60 + alarm_time_only.minute))
                
                if time_diff <= 1:  # Within 1 minute window
                    if alarm.recurring_days:
                        # Recurring alarm - check if today is in the recurring days
                        if current_weekday in alarm.recurring_days:
                            alarms_to_trigger.append(alarm)
                    else:
                        # One-time alarm - check if not already triggered
                        if alarm.triggered == "false":
                            alarms_to_trigger.append(alarm)
                            # Mark as triggered for one-time alarms
                            alarm.triggered = "true"
                            alarm.triggered_at = now
            
            alarms_data = []
            for alarm in alarms_to_trigger:
                alarms_data.append({
                    "id": alarm.id,
                    "alarm_type": alarm.alarm_type.value,
                    "alarm_time": alarm.alarm_time.isoformat(),
                    "reason": alarm.reason,
                    "audio_file": alarm.audio_file,
                    "recurring_days": alarm.recurring_days
                })
            
            if alarms_data:
                logger.info(f"Triggered {len(alarms_data)} alarm(s)")
                await session.commit()  # Commit one-time alarm triggers
            
            return {
                "success": True,
                "alarms": alarms_data
            }
    except Exception as e:
        logger.error(f"Error checking alarms: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


@app.get("/api/weather")
async def get_weather():
    """Get current weather data for the configured location."""
    try:
        # Try to get latest weather data from database
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(CollectedData)
                .where(CollectedData.source == "weather")
                .where(CollectedData.data_type == "weather_current")
                .order_by(desc(CollectedData.collected_at))
                .limit(1)
            )
            latest_data = result.scalar_one_or_none()
            
            # If we have recent data (less than 10 minutes old), return it
            if latest_data:
                collected_at = latest_data.collected_at
                if collected_at:
                    age_seconds = (datetime.now(timezone.utc) - collected_at.replace(tzinfo=timezone.utc)).total_seconds()
                    if age_seconds < 600:  # 10 minutes
                        weather_data = latest_data.data
                        return {
                            "success": True,
                            "data": weather_data.get("data", {}),
                            "cached": True,
                            "age_seconds": int(age_seconds)
                        }
        
        # Otherwise, collect fresh data
        collector = WeatherCollector()
        result = await collector.collect()
        
        if "error" in result:
            return {
                "success": False,
                "error": result.get("error", "Unknown error"),
                "message": "Failed to collect weather data"
            }
        
        # Store in database (with timeout handling for SQLite locks)
        weather_data = result.get("data", {})
        try:
            async with AsyncSessionLocal() as session:
                collected_data = CollectedData(
                    source=result.get("source", "weather"),
                    data_type=result.get("data_type", "weather_current"),
                    data=result,
                    expires_at=datetime.utcnow() + timedelta(minutes=10)  # Expire after 10 minutes
                )
                session.add(collected_data)
                await session.commit()
        except Exception as db_error:
            # Log but don't fail if database is locked - we still have the data
            logger.warning(f"Could not store weather data in database (may be locked): {db_error}")
        
        return {
            "success": True,
            "data": weather_data,  # Return the weather data dict directly (temperature, humidity, etc.)
            "cached": False
        }
        
    except Exception as e:
        logger.error(f"Error getting weather data: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to get weather data"
        }


@app.get("/api/traffic")
async def get_traffic(radius_miles: int = 30):
    """Get traffic conditions within the specified radius of the configured location."""
    try:
        # Try to get latest traffic data from database
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(CollectedData)
                .where(CollectedData.source == "traffic")
                .where(CollectedData.data_type == "traffic_conditions")
                .order_by(desc(CollectedData.collected_at))
                .limit(1)
            )
            latest_data = result.scalar_one_or_none()
            
            # If we have recent data (less than 5 minutes old), return it
            if latest_data:
                collected_at = latest_data.collected_at
                if collected_at:
                    age_seconds = (datetime.now(timezone.utc) - collected_at.replace(tzinfo=timezone.utc)).total_seconds()
                    if age_seconds < 300:  # 5 minutes
                        traffic_data = latest_data.data
                        return {
                            "success": True,
                            "data": traffic_data.get("data", {}),
                            "cached": True,
                            "age_seconds": int(age_seconds)
                        }
        
        # Otherwise, collect fresh data
        collector = TrafficCollector()
        result = await collector.collect(radius_miles=radius_miles)
        
        if "error" in result:
            return {
                "success": False,
                "error": result.get("error", "Unknown error"),
                "message": "Failed to collect traffic data"
            }
        
        # Store in database (with timeout handling for SQLite locks)
        traffic_data = result.get("data", {})
        try:
            async with AsyncSessionLocal() as session:
                collected_data = CollectedData(
                    source=result.get("source", "traffic"),
                    data_type=result.get("data_type", "traffic_conditions"),
                    data=result,
                    expires_at=datetime.utcnow() + timedelta(minutes=5)  # Expire after 5 minutes
                )
                session.add(collected_data)
                await session.commit()
        except Exception as db_error:
            # Log but don't fail if database is locked - we still have the data
            logger.warning(f"Could not store traffic data in database (may be locked): {db_error}")
        
        return {
            "success": True,
            "data": traffic_data,
            "cached": False
        }
        
    except Exception as e:
        logger.error(f"Error getting traffic data: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to get traffic data"
        }


@app.get("/api/news")
async def get_news(feed_type: str = "top_stories", limit: int = 50):
    """Get news data from BBC RSS feeds."""
    try:
        # Try to get latest news data from database
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(CollectedData)
                .where(CollectedData.source == "news")
                .where(CollectedData.data_type == "news_feed")
                .order_by(desc(CollectedData.collected_at))
                .limit(1)
            )
            latest_data = result.scalar_one_or_none()
            
            # If we have recent data (less than 15 minutes old) and same feed type, return it
            if latest_data:
                collected_at = latest_data.collected_at
                data_dict = latest_data.data
                if collected_at and data_dict:
                    age_seconds = (datetime.now(timezone.utc) - collected_at.replace(tzinfo=timezone.utc)).total_seconds()
                    stored_feed_type = data_dict.get("data", {}).get("feed_type")
                    if age_seconds < 900 and stored_feed_type == feed_type:  # 15 minutes cache
                        news_data = data_dict.get("data", {})
                        
                        # Load summaries from ArticleSummary table and attach to articles
                        try:
                            async with AsyncSessionLocal() as session:
                                articles = news_data.get("articles", [])
                                for article in articles:
                                    article_url = article.get("link")
                                    if article_url:
                                        summary_result = await session.execute(
                                            select(ArticleSummary).where(ArticleSummary.article_url == article_url)
                                        )
                                        summary_record = summary_result.scalar_one_or_none()
                                        if summary_record:
                                            article["summary"] = summary_record.summary
                                            article["summary_title"] = summary_record.article_title
                        except Exception as summary_error:
                            logger.warning(f"Could not load article summaries: {summary_error}")
                        
                        return {
                            "success": True,
                            "data": news_data,
                            "cached": True,
                            "age_seconds": int(age_seconds)
                        }
        
        # Otherwise, collect fresh data
        collector = NewsCollector()
        result = await collector.collect(feed_type=feed_type, limit=limit)
        
        if "error" in result:
            return {
                "success": False,
                "error": result.get("error", "Unknown error"),
                "message": "Failed to collect news data"
            }
        
        # Store in database (with timeout handling for SQLite locks)
        news_data = result.get("data", {})
        
        # Load summaries from ArticleSummary table and attach to articles
        try:
            async with AsyncSessionLocal() as session:
                articles = news_data.get("articles", [])
                for article in articles:
                    article_url = article.get("link")
                    if article_url:
                        summary_result = await session.execute(
                            select(ArticleSummary).where(ArticleSummary.article_url == article_url)
                        )
                        summary_record = summary_result.scalar_one_or_none()
                        if summary_record:
                            article["summary"] = summary_record.summary
                            article["summary_title"] = summary_record.article_title
        except Exception as summary_error:
            logger.warning(f"Could not load article summaries: {summary_error}")
        
        try:
            async with AsyncSessionLocal() as session:
                collected_data = CollectedData(
                    source=result.get("source", "news"),
                    data_type=result.get("data_type", "news_feed"),
                    data=result,
                    expires_at=datetime.utcnow() + timedelta(minutes=15)  # Expire after 15 minutes
                )
                session.add(collected_data)
                await session.commit()
        except Exception as db_error:
            # Log but don't fail if database is locked - we still have the data
            logger.warning(f"Could not store news data in database (may be locked): {db_error}")
        
        return {
            "success": True,
            "data": news_data,
            "cached": False
        }
        
    except Exception as e:
        logger.error(f"Error getting news data: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to get news data"
        }




@app.post("/api/news/summarize")
async def summarize_article(request: Request):
    """Summarize a news article from its URL."""
    try:
        data = await request.json()
        url = data.get("url")
        title = data.get("title", "")  # Optional title from frontend
        
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
        
        # Check if summary already exists in database
        async with AsyncSessionLocal() as session:
            existing_summary = await session.execute(
                select(ArticleSummary).where(ArticleSummary.article_url == url)
            )
            existing = existing_summary.scalar_one_or_none()
            
            if existing:
                logger.info(f"Returning cached summary for article: {url}")
                return {
                    "success": True,
                    "summary": existing.summary,
                    "title": existing.article_title
                }
        
        summarizer = ArticleSummarizer()
        result = await summarizer.summarize_article_from_url(url)
        
        if result.get("success"):
            summary = result.get("summary")
            
            # Store the summary in the ArticleSummary table
            try:
                async with AsyncSessionLocal() as session:
                    # Check again in case it was added concurrently
                    existing_summary = await session.execute(
                        select(ArticleSummary).where(ArticleSummary.article_url == url)
                    )
                    existing = existing_summary.scalar_one_or_none()
                    
                    if not existing:
                        article_summary = ArticleSummary(
                            article_url=url,
                            article_title=title or url,  # Use title if provided, otherwise URL
                            summary=summary
                        )
                        session.add(article_summary)
                        await session.commit()
                        logger.info(f"Stored summary for article: {url}")
                    else:
                        # Update existing summary
                        existing.summary = summary
                        if title:
                            existing.article_title = title
                        await session.commit()
                        logger.info(f"Updated summary for article: {url}")
            except Exception as db_error:
                # Log but don't fail if database is locked - we still have the summary
                logger.warning(f"Could not store article summary in database (may be locked): {db_error}")
            
            return {
                "success": True,
                "summary": summary,
                "title": title or url
            }
        else:
            return {
                "success": False,
                "error": result.get("error", "Unknown error")
            }
            
    except Exception as e:
        logger.error(f"Error summarizing article: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribe audio offline using Vosk if a model is present at models/vosk/*.
    If Vosk model is missing, falls back to Whisper if openai_api_key is set.
    Otherwise returns a placeholder transcript.
    """
    try:
        content = await file.read()

        # Try Vosk offline (local-only)
        transcript_text = None
        placeholder = False
        vosk_raw = None
        selected_model = None
        router_answer = None
        router_parsed = None
        router_error = None
        router_model = None
        router_prompt = None

        try:
            from vosk import Model, KaldiRecognizer
            model_root = os.path.join(os.path.dirname(__file__), "..", "models", "vosk")
            preferred = os.path.join(model_root, "vosk-model-en-us-0.22")
            if os.path.isdir(preferred):
                selected_model = preferred
            elif os.path.isdir(model_root):
                entries = [os.path.join(model_root, d) for d in os.listdir(model_root)]
                dirs = [d for d in entries if os.path.isdir(d)]
                if dirs:
                    selected_model = dirs[0]
            if selected_model and os.path.isdir(selected_model):
                logger.info(f"Using Vosk model: {selected_model}")
                model = Model(selected_model)
                # Convert to 16k mono PCM using ffmpeg or soundfile
                wav_bytes = await _ensure_wav_16k_mono(content, file.filename or "audio.webm")
                import wave
                wf = wave.open(io.BytesIO(wav_bytes), "rb")
                rec = KaldiRecognizer(model, wf.getframerate())
                while True:
                    data = wf.readframes(4000)
                    if len(data) == 0:
                        break
                    rec.AcceptWaveform(data)
                result = rec.FinalResult()
                vosk_raw = result
                try:
                    import json as _json
                    transcript_text = _json.loads(result).get("text", "").strip()
                except Exception:
                    transcript_text = None
                if transcript_text and transcript_text.strip() == "":
                    transcript_text = None
            else:
                logger.warning("Vosk model not found at %s", model_root)
        except Exception as e:
            logger.warning(f"Vosk transcription failed or model missing: {e}")

        # Last resort
        if not transcript_text:
            return {
                "success": False,
                "error": "No transcript available (Vosk returned no text).",
                "model_used": selected_model,
                "vosk_raw": vosk_raw,
            }

        # Run router model on the transcript (Anthropic)
        try:
            cfg = await load_router_config() or {}
            anth_cfg = cfg.get("anthropic", {}) if isinstance(cfg, dict) else {}
            router_model = anth_cfg.get("anthropic_model", settings.ai_model)
            router_prompt = anth_cfg.get("prompt_context")
            logger.info(
                "Router call: model=%s, prompt_snippet=%s, input=%s",
                router_model,
                (router_prompt[:200] + "...") if router_prompt and len(router_prompt) > 200 else router_prompt,
                transcript_text,
            )
            router_answer = await _run_router_inference(transcript_text)
            router_parsed = _parse_router_answer(router_answer)
            logger.info(
                "Router result: output=%s parsed=%s",
                router_answer,
                router_parsed,
            )
            if not router_answer:
                router_error = router_error or "Router returned no content"
        except Exception as e:
            logger.warning(f"Router inference failed: {e}")
            router_error = str(e)

        return {
            "success": True,
            "transcript": transcript_text,
            "placeholder": False,
            "model_used": selected_model,
            "vosk_raw": vosk_raw,
            "router_answer": router_answer,
            "router_parsed": router_parsed,
            "router_error": router_error,
            "router_model": router_model,
            "router_prompt": router_prompt,
            "router_input": transcript_text,
        }
    except Exception as e:
        logger.error(f"Error transcribing audio: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Transcription failed")


async def _ensure_wav_16k_mono(raw_bytes: bytes, filename: str) -> bytes:
    """
    Convert arbitrary audio bytes to 16k mono WAV.
    Uses ffmpeg if available, else tries soundfile resample.
    """
    # Try ffmpeg first
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1] or ".bin") as inp, \
         tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as outp:
        inp.write(raw_bytes)
        inp.flush()
        cmd = [
            "ffmpeg", "-y", "-i", inp.name,
            "-ar", "16000", "-ac", "1",
            "-f", "wav", outp.name
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            with open(outp.name, "rb") as f:
                data = f.read()
            return data
        except Exception:
            pass
        finally:
            try:
                os.unlink(inp.name)
            except Exception:
                pass
            try:
                os.unlink(outp.name)
            except Exception:
                pass

    # Fallback: try soundfile to read and resample
    import io
    try:
        audio, sr = sf.read(io.BytesIO(raw_bytes))
        if audio.ndim > 1:
            audio = np.mean(audio, axis=1)
        target_sr = 16000
        if sr != target_sr:
            # Simple linear resample
            import numpy as np
            ratio = target_sr / sr
            n_samples = int(len(audio) * ratio)
            audio = np.interp(np.linspace(0, len(audio), n_samples, endpoint=False),
                              np.arange(len(audio)), audio)
        # write wav to bytes
        buf = io.BytesIO()
        sf.write(buf, audio, target_sr, format="WAV", subtype="PCM_16")
        return buf.getvalue()
    except Exception as e:
        logger.error(f"Failed to convert audio to wav: {e}")
        raise HTTPException(status_code=400, detail="Unsupported audio format for transcription")


@app.post("/api/personas/select")
async def select_persona(request: Request):
    """Change the current persona."""
    data = await request.json()
    persona_name = data.get("persona")
    
    if not persona_name:
        raise HTTPException(status_code=400, detail="Persona name is required")
    
    # Verify persona exists
    config = await load_persona_config(persona_name)
    if not config:
        raise HTTPException(status_code=404, detail=f"Persona '{persona_name}' not found")
    
    # Set the persona
    success = await set_current_persona(persona_name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to set persona")
    
    # Reload persona config in AI service instances (they will reload on next request)
    # For now, we'll let them reload automatically on next request
    
    return {
        "success": True,
        "persona": persona_name,
        "message": f"Persona changed to {persona_name}"
    }

@app.get("/api/devices/health")
async def get_devices_health():
    """Get device health statistics."""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(DeviceConnection)
            )
            devices = result.scalars().all()
            
            total = len(devices)
            online = sum(1 for d in devices if d.is_connected == "true")
            offline = total - online
            
            return {
                "total": total,
                "online": online,
                "offline": offline
            }
    except Exception as e:
        logger.error(f"Error getting device health: {e}", exc_info=True)
        return {
            "total": 0,
            "online": 0,
            "offline": 0
        }

@app.get("/api/network/activity")
async def get_network_activity():
    """Get network activity statistics."""
    try:
        if not processor:
            return {
                "websocket_connections": 0,
                "bytes_sent": 0,
                "bytes_received": 0
            }
        
        # Get active WebSocket connections count
        ws_connections = len(processor.websocket_server.connections) if hasattr(processor.websocket_server, 'connections') else 0
        
        return {
            "websocket_connections": ws_connections,
            "bytes_sent": 0,  # Placeholder - would need to track this
            "bytes_received": 0  # Placeholder - would need to track this
        }
    except Exception as e:
        logger.error(f"Error getting network activity: {e}", exc_info=True)
        return {
            "websocket_connections": 0,
            "bytes_sent": 0,
            "bytes_received": 0
        }

@app.get("/api/stats/quick")
async def get_quick_stats():
    """Get quick system statistics."""
    try:
        async with AsyncSessionLocal() as session:
            # Count total messages
            messages_result = await session.execute(
                select(func.count(ChatMessage.id))
            )
            total_messages = messages_result.scalar() or 0
            
            # Count total data points
            data_result = await session.execute(
                select(func.count(CollectedData.id))
            )
            total_data_points = data_result.scalar() or 0
            
            # Count total devices
            devices_result = await session.execute(
                select(func.count(DeviceConnection.id))
            )
            total_devices = devices_result.scalar() or 0
            
            # Count AI queries (assistant messages)
            ai_queries_result = await session.execute(
                select(func.count(ChatMessage.id)).where(ChatMessage.role == "assistant")
            )
            ai_queries = ai_queries_result.scalar() or 0
            
            return {
                "total_messages": total_messages,
                "total_data_points": total_data_points,
                "ai_queries": ai_queries,
                "connected_devices": total_devices
            }
    except Exception as e:
        logger.error(f"Error getting quick stats: {e}", exc_info=True)
        return {
            "total_messages": 0,
            "total_data_points": 0,
            "ai_queries": 0,
            "connected_devices": 0
        }


@app.get("/")
async def get_index(request: Request):
    """Serve the React app."""
    static_file = static_path / "index.html"
    if static_file.exists():
        return FileResponse(static_file)
    # Fallback to old HTML if React build doesn't exist
    return HTMLResponse(get_frontend_html())


def get_frontend_html() -> str:
    """Return the frontend HTML with C.Y.B.E.R interface."""
    return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>C.Y.B.E.R</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #0a0a0f;
            color: #e0e0e0;
            min-height: 100vh;
            overflow: hidden;
        }
        
        /* Top Bar */
        .top-bar {
            background: #141420;
            border-bottom: 1px solid #2a2a3a;
            padding: 12px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 48px;
        }
        .top-bar-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .logo-text {
            font-size: 1.2em;
            font-weight: 600;
            color: #e0e0e0;
            letter-spacing: 2px;
        }
        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #4caf50;
            box-shadow: 0 0 8px rgba(76, 175, 80, 0.6);
        }
        .top-bar-center {
            flex: 1;
            text-align: center;
            color: #a0a0a0;
            font-size: 0.9em;
        }
        .top-bar-right {
            display: flex;
            align-items: center;
            gap: 16px;
            color: #a0a0a0;
            font-size: 0.9em;
        }
        .settings-icon {
            cursor: pointer;
            font-size: 1.2em;
            opacity: 0.7;
            transition: opacity 0.2s;
        }
        .settings-icon:hover {
            opacity: 1;
        }
        
        /* Main Layout */
        .main-container {
            display: grid;
            grid-template-columns: 320px 4px 1fr 4px 400px;
            height: calc(100vh - 48px);
            gap: 0;
            padding: 20px;
            overflow: hidden;
        }
        .panel-resizer {
            background: #2a2a3a;
            cursor: col-resize;
            position: relative;
            user-select: none;
            transition: background 0.2s;
        }
        .panel-resizer:hover {
            background: #3a3a4a;
        }
        .panel-resizer::before {
            content: '';
            position: absolute;
            left: 50%;
            top: 0;
            bottom: 0;
            width: 2px;
            background: #4a4a5a;
            transform: translateX(-50%);
        }
        .panel-resizer.resizing {
            background: #667eea;
        }
        
        /* Left Panel - Widgets */
        .left-panel {
            display: flex;
            flex-direction: column;
            gap: 16px;
            overflow-y: auto;
            padding-right: 8px;
        }
        .widget {
            background: #141420;
            border: 1px solid #2a2a3a;
            border-radius: 12px;
            padding: 16px;
        }
        .widget-title {
            font-size: 0.9em;
            font-weight: 600;
            color: #a0a0a0;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .progress-bar {
            width: 100%;
            height: 6px;
            background: #1a1a2a;
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            transition: width 0.3s;
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 0.85em;
        }
        .stat-label {
            color: #a0a0a0;
        }
        .stat-value {
            color: #e0e0e0;
            font-weight: 500;
        }
        .stat-boxes {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-top: 12px;
        }
        .stat-box {
            background: #1a1a2a;
            border: 1px solid #2a2a3a;
            border-radius: 6px;
            padding: 8px;
            text-align: center;
        }
        .stat-box-label {
            font-size: 0.7em;
            color: #808080;
            margin-bottom: 4px;
        }
        .stat-box-value {
            font-size: 0.9em;
            font-weight: 600;
            color: #e0e0e0;
        }
        .weather-main {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }
        .weather-temp {
            font-size: 1.8em;
            font-weight: 600;
            color: #e0e0e0;
        }
        .weather-location {
            font-size: 0.85em;
            color: #a0a0a0;
        }
        .weather-condition {
            font-size: 0.85em;
            color: #808080;
        }
        .camera-preview {
            width: 100%;
            aspect-ratio: 16/9;
            background: #0a0a0f;
            border: 1px solid #2a2a3a;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #404040;
            font-size: 0.8em;
            margin-bottom: 8px;
        }
        .uptime-display {
            font-size: 1.5em;
            font-weight: 600;
            color: #e0e0e0;
            text-align: center;
            font-variant-numeric: tabular-nums;
        }
        
        /* Center Panel - C.Y.B.E.R Graphic */
        .center-panel {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 24px;
        }
        .cyber-graphic {
            width: 280px;
            height: 280px;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .cyber-circle {
            position: absolute;
            border: 2px solid #2a2a3a;
            border-radius: 50%;
        }
        .cyber-circle-outer {
            width: 280px;
            height: 280px;
        }
        .cyber-circle-mid {
            width: 200px;
            height: 200px;
            border-color: #3a3a4a;
        }
        .cyber-circle-inner {
            width: 120px;
            height: 120px;
            border-color: #4a4a5a;
        }
        .cyber-dots {
            position: absolute;
            width: 60px;
            height: 60px;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            grid-template-rows: repeat(5, 1fr);
            gap: 4px;
        }
        .cyber-dot {
            width: 6px;
            height: 6px;
            background: #667eea;
            border-radius: 50%;
            box-shadow: 0 0 4px rgba(102, 126, 234, 0.8);
        }
        .cyber-dot:nth-child(7),
        .cyber-dot:nth-child(11),
        .cyber-dot:nth-child(13),
        .cyber-dot:nth-child(17),
        .cyber-dot:nth-child(19) {
            background: #764ba2;
            box-shadow: 0 0 4px rgba(118, 75, 162, 0.8);
        }
        .cyber-text {
            font-size: 1.8em;
            font-weight: 600;
            letter-spacing: 4px;
            color: #e0e0e0;
            margin-top: 16px;
        }
        .cyber-status {
            font-size: 0.9em;
            color: #4caf50;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .cyber-status-dot {
            width: 6px;
            height: 6px;
            background: #4caf50;
            border-radius: 50%;
            box-shadow: 0 0 6px rgba(76, 175, 80, 0.8);
        }
        .cyber-audio-player {
            margin-top: 16px;
            width: 100%;
            max-width: 300px;
        }
        .cyber-audio-player audio {
            width: 100%;
            outline: none;
        }
        .cyber-center-button {
            position: absolute;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #667eea;
            border: 2px solid #764ba2;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2em;
            color: white;
            box-shadow: 0 0 12px rgba(102, 126, 234, 0.6);
            transition: all 0.3s;
            z-index: 10;
        }
        .cyber-center-button:hover {
            background: #764ba2;
            border-color: #667eea;
            box-shadow: 0 0 16px rgba(118, 75, 162, 0.8);
            transform: scale(1.1);
        }
        
        /* Persona Selection Modal */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s, visibility 0.3s;
        }
        .modal-overlay.active {
            opacity: 1;
            visibility: visible;
        }
        .modal-content {
            background: #141420;
            border: 2px solid #2a2a3a;
            border-radius: 16px;
            padding: 32px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            transform: scale(0.9);
            transition: transform 0.3s;
        }
        .modal-overlay.active .modal-content {
            transform: scale(1);
        }
        .modal-header {
            text-align: center;
            margin-bottom: 24px;
        }
        .modal-title {
            font-size: 1.5em;
            font-weight: 600;
            color: #e0e0e0;
            margin-bottom: 8px;
        }
        .modal-subtitle {
            font-size: 0.9em;
            color: #a0a0a0;
        }
        .persona-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
        }
        .persona-item {
            background: #1a1a2a;
            border: 2px solid #2a2a3a;
            border-radius: 12px;
            padding: 16px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }
        .persona-item:hover {
            border-color: #667eea;
            background: #1f1f2f;
            transform: translateY(-2px);
        }
        .persona-item.selected {
            border-color: #764ba2;
            background: #1f1f2f;
            box-shadow: 0 0 12px rgba(118, 75, 162, 0.4);
        }
        .persona-image-placeholder {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: #2a2a3a;
            border: 2px solid #3a3a4a;
            margin: 0 auto 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2em;
            color: #667eea;
        }
        .persona-name {
            font-size: 0.9em;
            font-weight: 600;
            color: #e0e0e0;
            margin-bottom: 4px;
        }
        .persona-title {
            font-size: 0.75em;
            color: #a0a0a0;
        }
        .modal-close {
            position: absolute;
            top: 16px;
            right: 16px;
            background: transparent;
            border: none;
            color: #a0a0a0;
            font-size: 1.5em;
            cursor: pointer;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s;
        }
        .modal-close:hover {
            background: #2a2a3a;
            color: #e0e0e0;
        }
        
        /* Right Panel - Chat */
        .right-panel {
            background: #141420;
            border: 1px solid #2a2a3a;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .chat-header {
            padding: 16px;
            border-bottom: 1px solid #2a2a3a;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .chat-header-title {
            font-size: 1em;
            font-weight: 600;
            color: #e0e0e0;
        }
        .chat-header-buttons {
            display: flex;
            gap: 8px;
        }
        .chat-header-btn {
            background: transparent;
            border: 1px solid #2a2a3a;
            color: #a0a0a0;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.8em;
            transition: all 0.2s;
        }
        .chat-header-btn:hover {
            background: #1a1a2a;
            border-color: #3a3a4a;
            color: #e0e0e0;
        }
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .chat-message {
            max-width: 75%;
            padding: 10px 14px;
            border-radius: 12px;
            word-wrap: break-word;
            font-size: 0.9em;
            line-height: 1.5;
        }
        .chat-message.user {
            background: #667eea;
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
        }
        .chat-message.assistant {
            background: #1a1a2a;
            border: 1px solid #2a2a3a;
            color: #e0e0e0;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
        }
        .chat-message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        .chat-message .role {
            font-size: 0.75em;
            opacity: 0.7;
            margin-bottom: 4px;
        }
        .tts-button {
            padding: 4px 8px;
            background: #2a2a3a;
            border: 1px solid #3a3a4a;
            border-radius: 4px;
            color: #667eea;
            font-size: 0.7em;
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.2s;
        }
        .tts-button:hover {
            opacity: 1;
            background: #3a3a4a;
        }
        .tts-button:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .audio-player {
            margin-top: 8px;
            width: 100%;
        }
        .audio-player audio {
            width: 100%;
            outline: none;
        }
        .chat-input-container {
            padding: 16px;
            border-top: 1px solid #2a2a3a;
            display: flex;
            gap: 10px;
        }
        .chat-input {
            flex: 1;
            padding: 10px 14px;
            background: #1a1a2a;
            border: 1px solid #2a2a3a;
            border-radius: 8px;
            color: #e0e0e0;
            font-size: 0.9em;
        }
        .chat-input:focus {
            outline: none;
            border-color: #667eea;
        }
        .chat-input::placeholder {
            color: #606060;
        }
        .send-button {
            padding: 10px 20px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9em;
            transition: background 0.2s;
        }
        .send-button:hover {
            background: #764ba2;
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #606060;
            font-size: 0.9em;
        }
        
        /* Scrollbar */
        .left-panel::-webkit-scrollbar,
        .chat-messages::-webkit-scrollbar {
            width: 6px;
        }
        .left-panel::-webkit-scrollbar-track,
        .chat-messages::-webkit-scrollbar-track {
            background: #0a0a0f;
        }
        .left-panel::-webkit-scrollbar-thumb,
        .chat-messages::-webkit-scrollbar-thumb {
            background: #2a2a3a;
            border-radius: 3px;
        }
        .left-panel::-webkit-scrollbar-thumb:hover,
        .chat-messages::-webkit-scrollbar-thumb:hover {
            background: #3a3a4a;
        }
    </style>
    <script>
        // Load or create session ID from localStorage
        let chatSessionId = localStorage.getItem('chatSessionId') || 'session-' + Date.now();
        if (!localStorage.getItem('chatSessionId')) {
            localStorage.setItem('chatSessionId', chatSessionId);
        }
        
        let chatOffset = 0;
        let chatHasMore = true;
        let isLoadingMore = false;
        let lastAudioFile = null;
        let currentLocation = 'Unknown Location';
        
        // Update time and date
        function updateTime() {
            const element = document.getElementById('currentTime');
            if (element) {
                const now = new Date();
                const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
                const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                element.textContent = timeStr + ' | ' + dateStr;
            }
        }
        
        // Update system stats
        async function updateSystemStats() {
            try {
                const response = await fetch('/api/system/stats');
                const stats = await response.json();
                
                // CPU Usage
                const cpuPercent = document.getElementById('cpuPercent');
                const cpuProgress = document.getElementById('cpuProgress');
                const cpuBox = document.getElementById('cpuBox');
                if (cpuPercent) cpuPercent.textContent = stats.cpu_percent.toFixed(1) + '%';
                if (cpuProgress) cpuProgress.style.width = stats.cpu_percent + '%';
                if (cpuBox) cpuBox.textContent = 'CPU ' + stats.cpu_percent.toFixed(0) + '%';
                
                // Memory
                const ramUsage = document.getElementById('ramUsage');
                const ramProgress = document.getElementById('ramProgress');
                const memoryBox = document.getElementById('memoryBox');
                if (ramUsage) ramUsage.textContent = stats.memory_used_gb.toFixed(1) + 'GB';
                if (ramProgress) ramProgress.style.width = stats.memory_percent + '%';
                if (memoryBox) memoryBox.textContent = 'Memory ' + stats.memory_percent.toFixed(0) + '%';
                
                // Disk
                const diskBox = document.getElementById('diskBox');
                if (diskBox) diskBox.textContent = 'Disk ' + Math.round(stats.disk_used_gb) + '/' + Math.round(stats.disk_total_gb) + ' GB';
            } catch (error) {
                console.error('Error updating system stats:', error);
            }
        }
        
        // Update uptime
        async function updateUptime() {
            try {
                const response = await fetch('/api/system/uptime');
                const data = await response.json();
                const seconds = data.uptime_seconds;
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
                const uptimeDisplay = document.getElementById('uptimeDisplay');
                if (uptimeDisplay) {
                    uptimeDisplay.textContent = 
                        String(hours).padStart(2, '0') + ':' + 
                        String(minutes).padStart(2, '0') + ':' + 
                        String(secs).padStart(2, '0');
                }
            } catch (error) {
                console.error('Error updating uptime:', error);
            }
        }
        
        // Update weather
        async function updateWeather() {
            try {
                const response = await fetch('/api/weather');
                const data = await response.json();
                
                if (data.success && data.data) {
                    const weather = data.data;
                    
                    // Log all possible fields from BBC Weather API
                    console.log('=== BBC Weather API Data ===');
                    console.log('Temperature:', weather.temperature);
                    console.log('Temperature (F):', weather.temperature_f);
                    console.log('Humidity:', weather.humidity);
                    console.log('Pressure:', weather.pressure);
                    console.log('Pressure Direction:', weather.pressure_direction);
                    console.log('Description:', weather.description);
                    console.log('Weather Type:', weather.weather_type);
                    console.log('Wind Speed (m/s):', weather.wind_speed);
                    console.log('Wind Speed (mph):', weather.wind_speed_mph);
                    console.log('Wind Speed (kph):', weather.wind_speed_kph);
                    console.log('Wind Direction:', weather.wind_direction);
                    console.log('Wind Direction Full:', weather.wind_direction_full);
                    console.log('Visibility:', weather.visibility);
                    console.log('Feels Like:', weather.feels_like);
                    console.log('Observed At:', weather.observed_at);
                    console.log('Collected At:', weather.collected_at);
                    console.log('Location:', weather.location);
                    if (weather.location) {
                        console.log('  - City:', weather.location.city);
                        console.log('  - Region:', weather.location.region);
                        console.log('  - Postcode:', weather.location.postcode);
                        console.log('  - Location ID:', weather.location.location_id);
                        console.log('  - Station Name:', weather.location.station_name);
                        console.log('  - Station Distance (km):', weather.location.station_distance_km);
                    }
                    console.log('Raw Data:', weather.raw_data);
                    console.log('========================');
                    
                    // Update temperature (always available from BBC)
                    const weatherTemp = document.getElementById('weatherTemp');
                    if (weatherTemp && weather.temperature !== null && weather.temperature !== undefined) {
                        weatherTemp.textContent = weather.temperature + '°C';
                    }
                    
                    // Update condition and description (replacing location)
                    const weatherCondition = document.getElementById('weatherCondition');
                    if (weatherCondition) {
                        let conditionText = '';
                        if (weather.description && weather.description !== 'null' && weather.description !== null) {
                            conditionText = weather.description;
                        }
                        if (weather.weather_type && weather.weather_type !== null) {
                            if (conditionText) {
                                conditionText += ' (' + weather.weather_type + ')';
                            } else {
                                conditionText = weather.weather_type;
                            }
                        }
                        if (!conditionText) {
                            conditionText = 'Data unavailable';
                        }
                        weatherCondition.textContent = conditionText;
                    }
                    
                    // Remove location display (it's in the header now)
                    const weatherLocation = document.getElementById('weatherLocation');
                    if (weatherLocation) {
                        weatherLocation.style.display = 'none';
                    }
                    
                    // Update stat boxes - only show if data is available
                    const humidityBox = document.getElementById('humidityBox');
                    if (humidityBox) {
                        if (weather.humidity !== null && weather.humidity !== undefined) {
                            humidityBox.textContent = weather.humidity + '%';
                            humidityBox.parentElement.style.display = '';
                        } else {
                            humidityBox.parentElement.style.display = 'none';
                        }
                    }
                    
                    const windSpeedBox = document.getElementById('windSpeedBox');
                    if (windSpeedBox) {
                        if (weather.wind_speed_kph !== null && weather.wind_speed_kph !== undefined && weather.wind_speed_kph > 0) {
                            windSpeedBox.textContent = weather.wind_speed_kph + ' km/h';
                            windSpeedBox.parentElement.style.display = '';
                        } else {
                            windSpeedBox.parentElement.style.display = 'none';
                        }
                    }
                    
                    const windDirectionBox = document.getElementById('windDirectionBox');
                    if (windDirectionBox) {
                        if (weather.wind_direction && weather.wind_direction !== '-99' && weather.wind_direction !== 'Direction not available' && weather.wind_direction_full && weather.wind_direction_full !== 'Direction not available') {
                            windDirectionBox.textContent = weather.wind_direction;
                            windDirectionBox.parentElement.style.display = '';
                        } else {
                            windDirectionBox.parentElement.style.display = 'none';
                        }
                    }
                    
                    const pressureBox = document.getElementById('pressureBox');
                    if (pressureBox) {
                        if (weather.pressure !== null && weather.pressure !== undefined) {
                            pressureBox.textContent = weather.pressure + ' mb';
                            if (weather.pressure_direction && weather.pressure_direction !== 'Not available') {
                                pressureBox.textContent += ' (' + weather.pressure_direction + ')';
                            }
                            pressureBox.parentElement.style.display = '';
                        } else {
                            pressureBox.parentElement.style.display = 'none';
                        }
                    }
                } else {
                    console.error('Error loading weather:', data.error || 'Unknown error');
                    // Show error state
                    const weatherTemp = document.getElementById('weatherTemp');
                    if (weatherTemp) weatherTemp.textContent = '--°C';
                    const weatherCondition = document.getElementById('weatherCondition');
                    if (weatherCondition) weatherCondition.textContent = 'Error loading data';
                }
            } catch (error) {
                console.error('Error updating weather:', error);
                // Show error state
                const weatherTemp = document.getElementById('weatherTemp');
                if (weatherTemp) weatherTemp.textContent = '--°C';
                const weatherCondition = document.getElementById('weatherCondition');
                if (weatherCondition) weatherCondition.textContent = 'Error loading data';
            }
        }
        
        async function loadChatHistory(resetScroll) {
            try {
                chatOffset = 0;
                const response = await fetch('/api/chat?limit=50&offset=0');
                const data = await response.json();
                chatHasMore = data.has_more;
                chatOffset = data.messages.length;
                renderChatMessages(data.messages, true, resetScroll !== false);
            } catch (error) {
                console.error('Error loading chat history:', error);
            }
        }
        
        async function loadMoreChatHistory() {
            if (isLoadingMore || !chatHasMore) return;
            
            isLoadingMore = true;
            try {
                const container = document.getElementById('chatMessages');
                const oldScrollHeight = container.scrollHeight;
                
                const response = await fetch('/api/chat?limit=50&offset=' + chatOffset);
                const data = await response.json();
                
                if (data.messages && data.messages.length > 0) {
                    renderChatMessages(data.messages, false, false);
                    chatHasMore = data.has_more;
                    chatOffset += data.messages.length;
                    
                    const newScrollHeight = container.scrollHeight;
                    container.scrollTop = newScrollHeight - oldScrollHeight;
                } else {
                    chatHasMore = false;
                }
            } catch (error) {
                console.error('Error loading more chat history:', error);
            } finally {
                isLoadingMore = false;
            }
        }
        
        function renderChatMessages(messages, replace, scrollToBottom) {
            const container = document.getElementById('chatMessages');
            
            if (replace) {
                if (messages.length === 0) {
                    container.innerHTML = '<div class="empty-state">Start a conversation...</div>';
                    return;
                }
                container.innerHTML = '';
            }
            
            messages.forEach(function(msg) {
                if (msg.role === 'assistant') {
                    var messageTextEscaped = escapeHtml(msg.message).replace(/'/g, "\\'").replace(/\\n/g, ' ').replace(/"/g, '&quot;');
                    
                    var audioFile = msg.message_metadata && msg.message_metadata.audio_file;
                    var header = '<div class="chat-message-header">' +
                                 '<div class="role">Assistant</div>' +
                                 '<button class="tts-button" data-msg-id="' + msg.id + '" data-msg-text="' + messageTextEscaped + '">🔊 Speak</button>' +
                                 '</div>';
                } else {
                    var header = '<div class="role">You</div>';
                }
                
                var messageHtml = '<div class="chat-message ' + msg.role + '" data-message-id="' + msg.id + '">' +
                       header +
                       '<div>' + escapeHtml(msg.message) + '</div>' +
                       '</div>';
                
                if (replace) {
                    container.innerHTML += messageHtml;
                } else {
                    container.insertAdjacentHTML('afterbegin', messageHtml);
                }
            });
            
            container.querySelectorAll('.tts-button').forEach(function(button) {
                if (!button.hasAttribute('data-listener-attached')) {
                    button.setAttribute('data-listener-attached', 'true');
                    button.addEventListener('click', function() {
                        var msgId = button.getAttribute('data-msg-id');
                        var text = button.getAttribute('data-msg-text');
                        generateTTS(msgId, text);
                    });
                }
            });
            
            if (scrollToBottom) {
                container.scrollTop = container.scrollHeight;
            }
        }
        
        async function generateTTS(messageId, text) {
            var button = document.querySelector('[data-message-id="' + messageId + '"] .tts-button');
            if (!button) return;
            
            button.disabled = true;
            button.textContent = '⏳ Generating...';
            
            try {
                const response = await fetch('/api/tts/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text, message_id: messageId })
                });
                
                if (!response.ok) {
                    throw new Error('TTS generation failed');
                }
                
                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                
                // Update the center panel audio player
                const audioSource = document.getElementById('cyberAudioSource');
                const audioPlayer = document.getElementById('cyberAudioPlayer');
                const audioElement = document.getElementById('cyberAudio');
                
                if (audioSource && audioElement) {
                    // Store the audio file path from the response if available
                    // For now, use the blob URL
                    lastAudioFile = audioUrl;
                    audioSource.src = audioUrl;
                    audioElement.load();
                    if (audioPlayer) {
                        audioPlayer.style.display = 'block';
                    }
                }
                
                await loadChatHistory(false);
                
                button.disabled = false;
                button.textContent = '🔊';
                
            } catch (error) {
                console.error('Error generating TTS:', error);
                button.disabled = false;
                button.textContent = '🔊 Speak';
                alert('Error generating audio: ' + error.message);
            }
        }
        
        async function sendMessage() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            
            if (!message) return;
            
            addMessageToChat('user', message);
            input.value = '';
            
            const assistantMessageId = 'msg-' + Date.now();
            addMessageToChat('assistant', '', assistantMessageId);
            
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        session_id: chatSessionId,
                        service_name: 'ai_service',
                        stream: true
                    })
                });
                
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullResponse = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.chunk) {
                                    fullResponse += data.chunk;
                                    updateMessageContent(assistantMessageId, fullResponse);
                                }
                                if (data.done) {
                                    await loadChatHistory();
                                    return;
                                }
                                if (data.error) {
                                    updateMessageContent(assistantMessageId, 'Error: ' + data.error);
                                    return;
                                }
                            } catch (e) {
                                console.error('Error parsing SSE data:', e);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error sending message:', error);
                updateMessageContent(assistantMessageId, 'Error: ' + error.message);
            }
        }
        
        function handleChatKeyPress(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }
        
        function addMessageToChat(role, message, messageId = null) {
            const container = document.getElementById('chatMessages');
            if (container.querySelector('.empty-state')) {
                container.innerHTML = '';
            }
            
            const msgId = messageId || 'msg-' + Date.now();
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message ' + role;
            messageDiv.id = msgId;
            messageDiv.setAttribute('data-message-id', msgId);
            
            var header = '<div class="role">' + (role === 'user' ? 'You' : 'Assistant') + '</div>';
            if (role === 'assistant') {
                var messageText = escapeHtml(message);
                var messageTextEscaped = messageText.replace(/'/g, "\\'").replace(/\\n/g, ' ').replace(/"/g, '&quot;');
                header = '<div class="chat-message-header">' +
                         '<div class="role">Assistant</div>' +
                         '<button class="tts-button" data-msg-id="' + msgId + '" data-msg-text="' + messageTextEscaped + '">🔊 Speak</button>' +
                         '</div>';
            }
            
            messageDiv.innerHTML = header +
                '<div class="message-content">' + escapeHtml(message) + '</div>';
            
            container.appendChild(messageDiv);
            
            if (role === 'assistant') {
                var button = messageDiv.querySelector('.tts-button');
                if (button) {
                    button.addEventListener('click', function() {
                        var text = button.getAttribute('data-msg-text');
                        generateTTS(msgId, text);
                    });
                }
            }
            
            container.scrollTop = container.scrollHeight;
            
            return msgId;
        }
        
        function updateMessageContent(messageId, content) {
            const messageDiv = document.getElementById(messageId);
            if (messageDiv) {
                const contentDiv = messageDiv.querySelector('.message-content');
                if (contentDiv) {
                    contentDiv.textContent = content;
                    
                    var button = messageDiv.querySelector('.tts-button');
                    if (button && messageDiv.classList.contains('assistant')) {
                        var messageTextEscaped = content.replace(/'/g, "\\'").replace(/\\n/g, ' ').replace(/"/g, '&quot;');
                        button.setAttribute('data-msg-text', messageTextEscaped);
                    }
                    
                    document.getElementById('chatMessages').scrollTop = 
                        document.getElementById('chatMessages').scrollHeight;
                }
            }
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Location management
        async function loadLocation() {
            try {
                const response = await fetch('/api/location');
                const location = await response.json();
                currentLocation = location.display_name || location.city || 'Unknown Location';
                
                // Update top bar location
                const topBarLocation = document.getElementById('topBarLocation');
                if (topBarLocation) {
                    topBarLocation.textContent = currentLocation;
                }
            } catch (error) {
                console.error('Error loading location:', error);
            }
        }
        
        // Persona management
        let availablePersonas = [];
        let currentPersonaName = '';
        
        async function loadPersonas() {
            try {
                const response = await fetch('/api/personas');
                const data = await response.json();
                
                // Store personas globally
                availablePersonas = data.personas || [];
                currentPersonaName = data.current || 'default';
                
                // Update center panel title
                const cyberTitle = document.getElementById('cyberTitle');
                if (cyberTitle && data.current_title) {
                    cyberTitle.textContent = data.current_title;
                }
                
                // Update modal persona list if modal exists
                updatePersonaModalList();
            } catch (error) {
                console.error('Error loading personas:', error);
            }
        }
        
        function updatePersonaModalList() {
            const personaList = document.getElementById('personaList');
            if (!personaList) return;
            
            personaList.innerHTML = '';
            
            availablePersonas.forEach(function(persona) {
                const personaItem = document.createElement('div');
                personaItem.className = 'persona-item';
                if (persona.name === currentPersonaName) {
                    personaItem.classList.add('selected');
                }
                
                personaItem.innerHTML = 
                    '<div class="persona-image-placeholder">👤</div>' +
                    '<div class="persona-name">' + escapeHtml(persona.title) + '</div>' +
                    '<div class="persona-title">' + escapeHtml(persona.name) + '</div>';
                
                personaItem.onclick = function() {
                    selectPersona(persona.name);
                };
                
                personaList.appendChild(personaItem);
            });
        }
        
        function openPersonaModal() {
            const modal = document.getElementById('personaModal');
            if (modal) {
                updatePersonaModalList();
                modal.classList.add('active');
            }
        }
        
        function closePersonaModal() {
            const modal = document.getElementById('personaModal');
            if (modal) {
                modal.classList.remove('active');
            }
        }
        
        function closePersonaModalOnOverlay(event) {
            if (event.target.id === 'personaModal') {
                closePersonaModal();
            }
        }
        
        async function selectPersona(personaName) {
            try {
                const response = await fetch('/api/personas/select', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ persona: personaName })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Persona changed:', data.message);
                    // Close modal
                    closePersonaModal();
                    // Reload personas to update title
                    await loadPersonas();
                } else {
                    const error = await response.json();
                    console.error('Error changing persona:', error.detail);
                    alert('Error changing persona: ' + error.detail);
                }
            } catch (error) {
                console.error('Error changing persona:', error);
                alert('Error changing persona: ' + error.message);
            }
        }
        
        // Panel resizing functionality
        function initPanelResizers() {
            const resizer1 = document.getElementById('resizer1');
            const resizer2 = document.getElementById('resizer2');
            const leftPanel = document.getElementById('leftPanel');
            const centerPanel = document.getElementById('centerPanel');
            const rightPanel = document.getElementById('rightPanel');
            const container = document.querySelector('.main-container');
            
            let isResizing1 = false;
            let isResizing2 = false;
            let startX = 0;
            let startLeftWidth = 0;
            let startRightWidth = 0;
            
            // Resizer 1 (between left and center)
            if (resizer1 && leftPanel && centerPanel) {
                resizer1.addEventListener('mousedown', function(e) {
                    isResizing1 = true;
                    resizer1.classList.add('resizing');
                    startX = e.clientX;
                    startLeftWidth = leftPanel.offsetWidth;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                    e.preventDefault();
                });
            }
            
            // Resizer 2 (between center and right)
            if (resizer2 && centerPanel && rightPanel) {
                resizer2.addEventListener('mousedown', function(e) {
                    isResizing2 = true;
                    resizer2.classList.add('resizing');
                    startX = e.clientX;
                    startRightWidth = rightPanel.offsetWidth;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                    e.preventDefault();
                });
            }
            
            document.addEventListener('mousemove', function(e) {
                if (isResizing1 && leftPanel && centerPanel) {
                    const diff = e.clientX - startX;
                    const newLeftWidth = Math.max(200, Math.min(600, startLeftWidth + diff));
                    leftPanel.style.width = newLeftWidth + 'px';
                    container.style.gridTemplateColumns = newLeftWidth + 'px 4px 1fr 4px ' + (rightPanel ? rightPanel.offsetWidth : 400) + 'px';
                } else if (isResizing2 && centerPanel && rightPanel) {
                    const diff = startX - e.clientX; // Inverted for right panel
                    const newRightWidth = Math.max(300, Math.min(800, startRightWidth + diff));
                    rightPanel.style.width = newRightWidth + 'px';
                    container.style.gridTemplateColumns = (leftPanel ? leftPanel.offsetWidth : 320) + 'px 4px 1fr 4px ' + newRightWidth + 'px';
                }
            });
            
            document.addEventListener('mouseup', function() {
                if (isResizing1) {
                    isResizing1 = false;
                    resizer1.classList.remove('resizing');
                }
                if (isResizing2) {
                    isResizing2 = false;
                    resizer2.classList.remove('resizing');
                }
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            });
        }
        
        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            // Initialize panel resizers
            initPanelResizers();
            
            // Start updating time, stats, and uptime
            updateTime();
            setInterval(updateTime, 1000);
            
            updateSystemStats();
            setInterval(updateSystemStats, 15000);
            
            updateUptime();
            setInterval(updateUptime, 1000);
            
            // Load location
            loadLocation();
            
            // Load and update weather
            updateWeather();
            setInterval(updateWeather, 600000); // Update every 10 minutes
                   
                   // Load personas (this will also set the center title)
                   loadPersonas();
                   
                   // Load chat history
                   loadChatHistory();
            
            const chatContainer = document.getElementById('chatMessages');
            chatContainer.addEventListener('scroll', function() {
                if (chatContainer.scrollTop < 100 && chatHasMore && !isLoadingMore) {
                    loadMoreChatHistory();
                }
            });
        });
    </script>
</head>
<body>
    <!-- Top Bar -->
    <div class="top-bar">
        <div class="top-bar-left">
            <div class="logo-text">C.Y.B.E.R</div>
            <div class="status-indicator"></div>
            <span style="color: #4caf50; font-size: 0.85em;">Online</span>
        </div>
        <div class="top-bar-center" id="currentTime">3:20:51 PM | July 23, 2025</div>
        <div class="top-bar-right">
            <span id="topBarLocation">Loading...</span>
            <span class="settings-icon">⚙️</span>
        </div>
    </div>
    
    <!-- Main Container -->
    <div class="main-container">
        <!-- Left Panel -->
        <div class="left-panel" id="leftPanel">
            <!-- System Stats Widget -->
            <div class="widget">
                <div class="widget-title">System Stats</div>
                <div class="stat-row">
                    <span class="stat-label">CPU Usage</span>
                    <span class="stat-value" id="cpuPercent">5%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" id="cpuProgress" style="width: 5%;"></div>
                </div>
                <div class="stat-row">
                    <span class="stat-label">RAM Usage</span>
                    <span class="stat-value" id="ramUsage">9.5GB</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" id="ramProgress" style="width: 71%;"></div>
                </div>
                <div class="stat-boxes">
                    <div class="stat-box">
                        <div class="stat-box-label">CPU</div>
                        <div class="stat-box-value" id="cpuBox">CPU 5%</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Memory</div>
                        <div class="stat-box-value" id="memoryBox">Memory 71%</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Disk</div>
                        <div class="stat-box-value" id="diskBox">Disk 383/476 GB</div>
                    </div>
                </div>
            </div>
            
            <!-- Weather Widget -->
            <div class="widget">
                <div class="widget-title">Weather</div>
                <div class="weather-main">
                    <div class="weather-temp" id="weatherTemp">--°C</div>
                    <div>
                        <div class="weather-condition" id="weatherCondition">Loading...</div>
                    </div>
                </div>
                <div class="stat-boxes">
                    <div class="stat-box">
                        <div class="stat-box-label">Humidity</div>
                        <div class="stat-box-value" id="humidityBox">--%</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Wind Speed</div>
                        <div class="stat-box-value" id="windSpeedBox">-- km/h</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Wind Direction</div>
                        <div class="stat-box-value" id="windDirectionBox">--</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Pressure</div>
                        <div class="stat-box-value" id="pressureBox">-- mb</div>
                    </div>
                </div>
            </div>
            
            <!-- Camera Widget -->
            <div class="widget">
                <div class="widget-title">Camera</div>
                <div class="camera-preview">Camera preview</div>
                <div style="font-size: 0.8em; color: #808080; text-align: center;">
                    Screen sharing active, C.Y.B.E.R will analyze your screen.
                </div>
            </div>
            
            <!-- System Uptime Widget -->
            <div class="widget">
                <div class="widget-title">System Uptime</div>
                <div class="uptime-display" id="uptimeDisplay">00:00:00</div>
            </div>
        </div>
        
        <!-- Resizer 1 -->
        <div class="panel-resizer" id="resizer1"></div>
        
        <!-- Center Panel -->
        <div class="center-panel" id="centerPanel">
            <div class="cyber-graphic">
                <div class="cyber-circle cyber-circle-outer"></div>
                <div class="cyber-circle cyber-circle-mid"></div>
                <div class="cyber-circle cyber-circle-inner"></div>
                <div class="cyber-dots">
                    <div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div>
                    <div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div>
                    <div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div>
                    <div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div>
                    <div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div><div class="cyber-dot"></div>
                </div>
                <button class="cyber-center-button" id="cyberCenterButton" onclick="openPersonaModal()">⚙</button>
            </div>
            <div class="cyber-text" id="cyberTitle">C.Y.B.E.R</div>
            <div class="cyber-audio-player" id="cyberAudioPlayer" style="display: none;">
                <audio controls id="cyberAudio" preload="none">
                    <source id="cyberAudioSource" src="" type="audio/mpeg">
                    Your browser does not support audio.
                </audio>
            </div>
            <div class="cyber-status">
                <div class="cyber-status-dot"></div>
                <span>Screen mode active</span>
            </div>
        </div>
        
        <!-- Resizer 2 -->
        <div class="panel-resizer" id="resizer2"></div>
        
        <!-- Right Panel - Chat -->
        <div class="right-panel" id="rightPanel">
            <div class="chat-header">
                <div class="chat-header-title">Conversation</div>
                <div class="chat-header-buttons">
                    <button class="chat-header-btn">Clear</button>
                    <button class="chat-header-btn">Extract Conversation</button>
                </div>
            </div>
            <div class="chat-messages" id="chatMessages">
                <div class="empty-state">Start a conversation...</div>
            </div>
            <div class="chat-input-container">
                <input type="text" class="chat-input" id="chatInput" placeholder="Type a message..." onkeypress="handleChatKeyPress(event)">
                <button class="send-button" onclick="sendMessage()">➤</button>
            </div>
        </div>
    </div>
    
    <!-- Persona Selection Modal -->
    <div class="modal-overlay" id="personaModal" onclick="closePersonaModalOnOverlay(event)">
        <div class="modal-content" onclick="event.stopPropagation()">
            <button class="modal-close" onclick="closePersonaModal()">×</button>
            <div class="modal-header">
                <div class="modal-title">Select AI Persona</div>
                <div class="modal-subtitle">Choose your AI assistant personality</div>
            </div>
            <div class="persona-list" id="personaList">
                <!-- Personas will be loaded here -->
            </div>
        </div>
    </div>
</body>
</html>
    """
