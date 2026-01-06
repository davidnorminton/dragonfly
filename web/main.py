"""FastAPI application for the web GUI."""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse, JSONResponse
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging
import asyncio
import json
import mimetypes
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
from database.models import DeviceConnection, DeviceTelemetry, ChatMessage, CollectedData, MusicArtist, MusicAlbum, MusicSong, MusicPlaylist, MusicPlaylistSong
from sqlalchemy import select, desc, func, or_
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
from services.router_service import route_request
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
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

app = FastAPI(title="Dragonfly Home Assistant")

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


def _load_router_config() -> Optional[Dict[str, Any]]:
    """Load router.config if present."""
    cfg_path = Path(__file__).parent / ".." / "config" / "router.config"
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning("router.config not found at %s", cfg_path)
    except Exception as e:
        logger.warning("Failed to load router.config: %s", e)
    return None


def _get_anthropic_api_key() -> Optional[str]:
    """Fetch Anthropic API key from settings, api_keys.json, or env."""
    api_key = settings.ai_api_key or os.getenv("ANTHROPIC_API_KEY")
    if api_key:
        return api_key
    try:
        api_keys = load_api_keys()
        return api_keys.get("anthropic", {}).get("api_key")
    except Exception as e:
        logger.warning("Failed to load Anthropic API key from config: %s", e)
        return None


async def _run_router_inference(user_text: str) -> Optional[str]:
    """Run Anthropic router model on the given text."""
    cfg = _load_router_config() or {}
    anth_cfg = cfg.get("anthropic", {}) if isinstance(cfg, dict) else {}
    api_key = _get_anthropic_api_key()
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


@app.post("/api/system/restart")
async def restart_system():
    """
    Schedule a server restart. Returns immediately, then spawns a new process and exits.
    Frontend should clear caches and reload after calling this.
    """
    try:
        def _restart():
            try:
                cmd = [sys.executable] + sys.argv
                env = os.environ.copy()
                cwd = os.getcwd()
                logger.info(f"Spawning new process for restart: {cmd} (cwd={cwd})")
                subprocess.Popen(cmd, env=env, cwd=cwd)
            finally:
                os._exit(0)

        # Run restart in a separate thread after a short delay to let the response flush
        threading.Timer(1.0, _restart).start()
        return {"success": True, "message": "Server restart scheduled"}
    except Exception as e:
        logger.error(f"Failed to schedule restart: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to schedule restart")


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
                    tts = TTSService()
                    audio_bytes, _ = await tts.generate_audio(text, voice_id=voice_id, voice_engine=voice_engine, save_to_file=False)
                    if audio_bytes:
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
            meta["title"] = tags.get("title", [None])[0]
            meta["artist"] = tags.get("artist", [None])[0]
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
                album_stmt = select(MusicAlbum).where(MusicAlbum.artist_id == artist.id, MusicAlbum.title == album_title)
                album_res = await session.execute(album_stmt)
                album = album_res.scalars().first()
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
                    album.year = year_val or album.year
                    album.genre = album.genre or meta.get("genre")
                    if item.get("album_image"):
                        album.cover_path = item.get("album_image")
                    if meta:
                        album.extra_metadata = meta

                # Song
                song_stmt = select(MusicSong).where(MusicSong.file_path == item["path"])
                song_res = await session.execute(song_stmt)
                song = song_res.scalars().first()
                if not song:
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
                else:
                    song.title = song_title
                    song.track_number = meta.get("track_number")
                    song.disc_number = meta.get("disc_number")
                    song.duration_seconds = meta.get("duration_seconds")
                    song.bitrate = meta.get("bitrate")
                    song.sample_rate = meta.get("sample_rate")
                    song.channels = meta.get("channels")
                    song.codec = meta.get("codec")
                    song.genre = meta.get("genre")
                    song.year = year_val
                    song.extra_metadata = meta
            except Exception as e:
                logger.error(f"Failed to persist song {item.get('path')}: {e}", exc_info=True)
                continue

        await session.commit()
        logger.info(f"Persisted {len(tree_songs)} songs for artists: {sorted(artists_persisted)}")


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
                        "image": album.image_path,
                        "year": album.year,
                        "date": album.release_date,
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
                        artist_name = parts_img[0]
                        # Prioritize cover.jpg for artist images
                        if f.lower() == "cover.jpg":
                            artist_images[artist_name] = str(rel_img)
                        elif artist_name not in artist_images:
                            # Only set if not already set (cover.jpg takes priority)
                            artist_images[artist_name] = str(rel_img)
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
                artist, album_dir = parts[0], parts[1]
                artist_names_seen.add(artist)
                song = Path(parts[-1]).stem
                rel_path = str(full_path.relative_to(base_path))
                meta = _extract_audio_meta(full_path)
                title_from_meta = meta.get("title") or song
                album_title_from_meta = meta.get("album") or album_dir
                
                # Store the metadata album title (use first song's metadata album name)
                if not tree[artist][album_dir]["title"]:
                    tree[artist][album_dir]["title"] = album_title_from_meta
                
                tree[artist][album_dir]["songs"].append(
                    {
                        "name": title_from_meta,
                        "path": rel_path,
                        "duration": meta.get("duration_seconds"),
                        "track_number": meta.get("track_number"),
                    }
                )
                # Capture year/date for album ordering
                if meta.get("year") and not tree[artist][album_dir]["year"]:
                    try:
                        tree[artist][album_dir]["year"] = int(str(meta.get("year")).split("-")[0])
                    except Exception:
                        tree[artist][album_dir]["year"] = None
                if meta.get("date") and not tree[artist][album_dir]["date"]:
                    tree[artist][album_dir]["date"] = meta.get("date")
                collected_songs.append(
                    {
                        "artist": artist,
                        "album": album_title_from_meta,
                        "album_dir": album_dir,
                        "title": title_from_meta,
                        "path": rel_path,
                        "album_image": None,
                        "meta": meta,
                    }
                )
            except Exception:
                continue

        # Try to find an album cover in this directory if not already set
        album_dir = Path(root)
        rel_album = None
        try:
          rel_album = album_dir.relative_to(base_path)
        except Exception:
          rel_album = None
        if rel_album and len(rel_album.parts) >= 2:
            artist, album_dir_name = rel_album.parts[0], rel_album.parts[1]
            if tree[artist][album_dir_name]["image"] is None:
                for img in album_dir.iterdir():
                    if img.is_file() and img.suffix.lower() in image_exts:
                        rel_img = str(img.relative_to(base_path))
                        tree[artist][album_dir_name]["image"] = rel_img
                        # update collected_songs album_image for this album directory
                        for cs in collected_songs:
                            if cs["artist"] == artist and cs["album_dir"] == album_dir_name:
                                cs["album_image"] = rel_img
                        break

    # Extract album covers from MP3 metadata or download from MusicBrainz
    logger.info("Checking for missing album covers...")
    for artist, albums in tree.items():
        for album_dir, album_data in albums.items():
            if album_data["image"] is None:
                album_path = base_path / artist / album_dir
                
                # Try to extract from first MP3 in the album
                logger.info(f"No cover image file for {artist} - {album_dir}, trying to extract from MP3...")
                extracted_cover = None
                for song in album_data["songs"]:
                    song_path = base_path / song["path"]
                    if song_path.exists():
                        extracted_cover = _extract_album_art_from_mp3(song_path, album_path)
                        if extracted_cover:
                            logger.info(f"Successfully extracted cover art from {song_path.name}")
                            break
                
                if extracted_cover:
                    album_data["image"] = extracted_cover
                    # Update collected_songs with the new cover
                    for cs in collected_songs:
                        if cs["artist"] == artist and cs["album_dir"] == album_dir:
                            cs["album_image"] = extracted_cover
                elif album_data["title"]:
                    # If still no cover, try MusicBrainz as last resort
                    logger.info(f"No embedded cover art, trying MusicBrainz for {artist} - {album_data['title']}...")
                    downloaded_cover = await _download_album_cover(artist, album_data["title"], album_path)
                    if downloaded_cover:
                        album_data["image"] = downloaded_cover
                        # Update collected_songs with the new cover
                        for cs in collected_songs:
                            if cs["artist"] == artist and cs["album_dir"] == album_dir:
                                cs["album_image"] = downloaded_cover

    artists_out = []
    for artist, albums in tree.items():
        albums_out = []
        for album_dir, album_data in albums.items():
            albums_out.append(
                {
                    "name": album_data.get("title") or album_dir,  # Use metadata album title, fallback to directory name
                    "songs": album_data["songs"],
                    "image": album_data.get("image"),
                    "year": album_data.get("year"),
                    "date": album_data.get("date"),
                }
            )
        artists_out.append({"name": artist, "image": artist_images.get(artist), "albums": albums_out})

    # Persist to DB
    try:
        await _persist_music(collected_songs)
        logger.info(f"Scan complete. Artists found: {sorted(artist_names_seen)}")
    except Exception as e:
        logger.error(f"Failed to persist music library: {e}", exc_info=True)

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

            lines = [
                f"You are selecting the most popular songs for artist '{artist_name}'.",
                "Only choose songs that appear in the provided list. If you are unsure, skip it.",
                'Return STRICT JSON: {"songs": [{"title": "song title", "album": "album title"}]} with at most 20 items.',
                "Do not include songs not listed here.",
                "Albums and songs we have:",
            ]
            for album_title, tracks in albums_map.items():
                sorted_tracks = sorted(tracks, key=lambda t: t.get("track_number") or 9999)
                lines.append(f"- Album: {album_title}")
                for t in sorted_tracks:
                    tn = t.get("track_number")
                    tn_str = f"{tn}. " if tn else ""
                    lines.append(f"  - {tn_str}{t['title']}")
            prompt = "\n".join(lines)

            ai = AIService()
            ai.reload_persona_config()
            ai_resp = await ai.execute({"question": prompt})
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

            # Check if we already have about info cached
            if artist_row.extra_metadata and artist_row.extra_metadata.get("about"):
                return {"success": True, "about": artist_row.extra_metadata["about"]}

            # Generate about info using AI
            prompt = f"Write a concise summary about the band/artist '{artist_name}' in 250 words or less. Include their musical style, notable achievements, and influence. Be factual and informative."

            ai = AIService()
            ai.reload_persona_config()
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

            # Check if we already have discography cached
            if artist_row.extra_metadata and artist_row.extra_metadata.get("discography"):
                return {"success": True, "discography": artist_row.extra_metadata["discography"]}

            # Generate discography using AI
            prompt = f"""List all studio albums by the band/artist '{artist_name}' in chronological order. 
Return ONLY a JSON array with this exact format:
{{"albums": [{{"year": 1990, "title": "Album Name"}}, {{"year": 1992, "title": "Another Album"}}]}}

Include only official studio albums, not live albums, compilations, or EPs. Be accurate and factual."""

            ai = AIService()
            ai.reload_persona_config()
            ai_resp = await ai.execute({"question": prompt})
            raw_answer = ai_resp.get("answer", "") if isinstance(ai_resp, dict) else ""

            # Try to extract JSON from response
            parsed = _extract_json_object(raw_answer) or {}
            albums_list = parsed.get("albums") if isinstance(parsed, dict) else None

            if not albums_list or not isinstance(albums_list, list):
                return JSONResponse(
                    status_code=200,
                    content={"success": False, "error": "Failed to generate discography"}
                )

            # Sort by year
            albums_list = sorted(albums_list, key=lambda x: x.get("year", 9999))

            # Store in database
            artist_row.extra_metadata = artist_row.extra_metadata or {}
            artist_row.extra_metadata["discography"] = albums_list
            flag_modified(artist_row, "extra_metadata")
            await session.commit()

            return {"success": True, "discography": albums_list}
    except Exception as e:
        logger.error(f"Error generating discography for '{artist_name}': {e}", exc_info=True)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(e)}
        )


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
    Get chat history with pagination, filtered by mode and persona.
    Session IDs are ignored; history is grouped by persona + mode instead.
    """
    async with AsyncSessionLocal() as session:
        # Build base query
        query = select(ChatMessage)
        count_query = select(func.count(ChatMessage.id))
        
        # Filter by mode if provided
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
                    msg = ChatMessage(
                        session_id=session_id,
                        role=role,
                        message=message_text,
                        service_name=service_name,
                        mode=mode,
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
        
        logger.info(f"Chat request received: message='{message[:50] if message else None}', mode={mode}, stream={stream}")
        
        if not message:
            raise HTTPException(status_code=400, detail="Message is required")
        
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
        current_persona = get_current_persona_name()
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
            ai_service.reload_persona_config()  # Ensure we have the latest persona
            input_data = {"question": message}
            
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
                            persona_config = load_persona_config(current_persona)
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
            rag_service.reload_persona_config()  # Ensure we have the latest persona
            
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
                            persona_config = load_persona_config(current_persona)
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
    persona_config = load_persona_config(persona_name) if persona_name else load_persona_config()
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
            current_persona = get_current_persona_name()
            persona_config = load_persona_config(current_persona)
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
            current_persona = get_current_persona_name()
            persona_config = load_persona_config(current_persona)
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
    personas = list_available_personas()
    current = get_current_persona_name()
    current_config = load_persona_config(current)
    current_title = "CYBER" if current == "default" else (current_config.get("title", current) if current_config else current)
    return {
        "personas": personas,
        "current": current,
        "current_title": current_title
    }


@app.get("/api/expert-types")
async def get_expert_types_endpoint():
    """Get list of available expert types."""
    expert_types = list_expert_types()
    return {
        "expert_types": expert_types
    }


@app.get("/api/expert-types")
async def get_expert_types():
    """Get list of available expert types."""
    expert_types = list_expert_types()
    return {
        "expert_types": expert_types
    }


@app.get("/api/location")
async def get_location():
    """Get location configuration."""
    location_config = load_location_config()
    return location_config


# Config editing endpoints
@app.get("/api/config/persona/{persona_name}")
async def get_persona_config_endpoint(persona_name: str):
    """Get a specific persona configuration."""
    config = load_persona_config(persona_name)
    if not config:
        raise HTTPException(status_code=404, detail=f"Persona '{persona_name}' not found")
    return config


@app.put("/api/config/persona/{persona_name}")
async def save_persona_config_endpoint(persona_name: str, request: Request):
    """Save a persona configuration."""
    try:
        config = await request.json()
        success = save_persona_config(persona_name, config)
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
    location_config = load_location_config()
    return location_config


@app.put("/api/config/location")
async def save_location_config_endpoint(request: Request):
    """Save location configuration."""
    try:
        config = await request.json()
        success = save_location_config(config)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save location config")
        return {"success": True, "message": "Location config saved"}
    except Exception as e:
        logger.error(f"Error saving location config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config/api_keys")
async def get_api_keys_config_endpoint():
    """Get API keys configuration."""
    api_keys_config = load_api_keys()
    return api_keys_config


@app.put("/api/config/api_keys")
async def save_api_keys_config_endpoint(request: Request):
    """Save API keys configuration."""
    try:
        config = await request.json()
        success = save_api_keys(config)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save API keys config")
        return {"success": True, "message": "API keys config saved"}
    except Exception as e:
        logger.error(f"Error saving API keys config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config/router")
async def get_router_config_endpoint():
    """Get router configuration."""
    cfg = load_router_config()
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
        if not save_router_config(cfg):
            raise HTTPException(status_code=500, detail="Failed to save router config")
        return {"success": True, "message": "Router config saved"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving router config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
            
            # If we have recent data (less than 15 minutes old), return it
            if latest_data:
                collected_at = latest_data.collected_at
                if collected_at:
                    age_seconds = (datetime.now(timezone.utc) - collected_at.replace(tzinfo=timezone.utc)).total_seconds()
                    if age_seconds < 900:  # 15 minutes
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
                    expires_at=datetime.utcnow() + timedelta(minutes=15)  # Expire after 15 minutes
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
        
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
        
        summarizer = ArticleSummarizer()
        result = await summarizer.summarize_article_from_url(url)
        
        if result.get("success"):
            summary = result.get("summary")
            
            # Store the summary in the database with the article data
            try:
                async with AsyncSessionLocal() as session:
                    # Find the latest news data
                    news_result = await session.execute(
                        select(CollectedData)
                        .where(CollectedData.source == "news")
                        .where(CollectedData.data_type == "news_feed")
                        .order_by(desc(CollectedData.collected_at))
                        .limit(1)
                    )
                    latest_news_data = news_result.scalar_one_or_none()
                    
                    if latest_news_data and latest_news_data.data:
                        # Deep copy to ensure SQLAlchemy detects JSON change
                        import copy
                        data_copy = copy.deepcopy(latest_news_data.data)
                        articles = data_copy.get("data", {}).get("articles", [])
                        for article in articles:
                            if article.get("link") == url:
                                article["summary"] = summary
                                break
                        
                        data_copy.setdefault("data", {})["articles"] = articles
                        latest_news_data.data = data_copy
                        flag_modified(latest_news_data, "data")
                        await session.commit()
                        logger.info(f"Stored summary for article: {url}")
            except Exception as db_error:
                # Log but don't fail if database is locked - we still have the summary
                logger.warning(f"Could not store article summary in database (may be locked): {db_error}")
            
            return {
                "success": True,
                "summary": summary
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
            cfg = _load_router_config() or {}
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
    config = load_persona_config(persona_name)
    if not config:
        raise HTTPException(status_code=404, detail=f"Persona '{persona_name}' not found")
    
    # Set the persona
    success = set_current_persona(persona_name)
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
