"""Improved Video library scanner for Movies and TV Shows."""
import logging
import re
import subprocess
import json
from pathlib import Path
from typing import Dict, List, Optional, Any
from database.base import AsyncSessionLocal
from database.models import VideoMovie, VideoTVShow, VideoTVSeason, VideoTVEpisode
from sqlalchemy import select
from services.tmdb_service import TMDBService

logger = logging.getLogger(__name__)

# Common video file extensions
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.mpeg', '.mpg'}


class VideoScanner:
    """Scanner for video library (Movies and TV Shows)."""
    
    def __init__(self, video_directory: str, tmdb_api_key: Optional[str] = None):
        """Initialize scanner with video directory path."""
        self.video_directory = Path(video_directory)
        self.movies_dir = self.video_directory / "Movies"
        self.tv_dir = self.video_directory / "Tv"
        self.tmdb_service = TMDBService(tmdb_api_key) if tmdb_api_key else None
        
        logger.info(f"📁 Video Scanner initialized")
        logger.info(f"   Video directory: {self.video_directory}")
        logger.info(f"   Movies directory: {self.movies_dir}")
        logger.info(f"   TV directory: {self.tv_dir}")
        logger.info(f"   TMDB API: {'✓ Configured' if self.tmdb_service else '✗ Not configured'}")
        
    async def scan_library(self) -> Dict[str, Any]:
        """Scan the entire video library."""
        logger.info("="*80)
        logger.info("🎬 STARTING VIDEO LIBRARY SCAN")
        logger.info("="*80)
        
        results = {
            "success": True,
            "movies_scanned": 0,
            "tv_shows_scanned": 0,
            "seasons_scanned": 0,
            "episodes_scanned": 0,
            "errors": []
        }
        
        # Scan Movies
        if self.movies_dir.exists():
            try:
                movie_count = await self.scan_movies()
                results["movies_scanned"] = movie_count
            except Exception as e:
                error_msg = f"Error scanning movies: {str(e)}"
                logger.error(error_msg, exc_info=True)
                results["errors"].append(error_msg)
        else:
            logger.warning(f"Movies directory not found: {self.movies_dir}")
        
        # Scan TV Shows
        if self.tv_dir.exists():
            try:
                tv_results = await self.scan_tv_shows()
                results["tv_shows_scanned"] = tv_results["shows"]
                results["seasons_scanned"] = tv_results["seasons"]
                results["episodes_scanned"] = tv_results["episodes"]
            except Exception as e:
                error_msg = f"Error scanning TV shows: {str(e)}"
                logger.error(error_msg, exc_info=True)
                results["errors"].append(error_msg)
        else:
            logger.warning(f"TV directory not found: {self.tv_dir}")
        
        logger.info("="*80)
        logger.info(f"✓ SCAN COMPLETE")
        logger.info(f"  Movies: {results['movies_scanned']}")
        logger.info(f"  TV Shows: {results['tv_shows_scanned']}")
        logger.info(f"  Seasons: {results['seasons_scanned']}")
        logger.info(f"  Episodes: {results['episodes_scanned']}")
        logger.info(f"  Errors: {len(results['errors'])}")
        logger.info("="*80)
        
        return results
    
    async def scan_movies(self) -> int:
        """Scan Movies directory for movie files."""
        logger.info("\n" + "🎥 SCANNING MOVIES" + "="*66)
        
        movie_files = [f for f in self.movies_dir.iterdir() 
                      if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS]
        
        logger.info(f"Found {len(movie_files)} movie files")
        
        movie_count = 0
        async with AsyncSessionLocal() as session:
            for idx, movie_file in enumerate(movie_files, 1):
                try:
                    logger.info(f"\n[{idx}/{len(movie_files)}] {movie_file.name}")
                    
                    # Step 1: Parse filename
                    parsed = self._parse_movie_filename(movie_file.name)
                    logger.info(f"  📝 Parsed: '{parsed['title']}' ({parsed.get('year', 'N/A')})")
                    
                    # Step 2: Extract video metadata
                    video_meta = self._extract_video_metadata(movie_file)
                    if video_meta:
                        logger.info(f"  🎞️  Video: {video_meta.get('duration')}s, {video_meta.get('resolution')}, {video_meta.get('codec')}")
                    
                    # Step 3: Look up TMDB
                    tmdb_data = None
                    if self.tmdb_service:
                        logger.info(f"  🔍 Searching TMDB...")
                        tmdb_data = self.tmdb_service.search_movie(parsed['title'], parsed.get('year'))
                        
                        if tmdb_data:
                            logger.info(f"  ✅ TMDB: '{tmdb_data['title']}' ({tmdb_data.get('year')})")
                            logger.info(f"     ID: {tmdb_data.get('tmdb_id')}")
                            logger.info(f"     Poster: {'✓' if tmdb_data.get('poster_path') else '✗'}")
                            logger.info(f"     Description: {'✓' if tmdb_data.get('description') else '✗'}")
                        else:
                            logger.warning(f"  ❌ Not found on TMDB")
                    
                    # Step 4: Save to database
                    result = await session.execute(
                        select(VideoMovie).where(VideoMovie.file_path == str(movie_file))
                    )
                    existing = result.scalar_one_or_none()
                    
                    if existing:
                        logger.info(f"  💾 Updating existing movie (ID: {existing.id})")
                        movie = existing
                    else:
                        logger.info(f"  💾 Creating new movie")
                        movie = VideoMovie(
                            file_path=str(movie_file),
                            file_size=movie_file.stat().st_size
                        )
                        session.add(movie)
                    
                    # Update fields
                    if tmdb_data:
                        movie.title = tmdb_data['title']
                        movie.year = tmdb_data.get('year')
                        movie.description = tmdb_data.get('description')
                        movie.poster_path = tmdb_data.get('poster_path')
                        movie.extra_metadata = {
                            'tmdb_id': tmdb_data.get('tmdb_id'),
                            'genres': tmdb_data.get('genres', []),
                            'rating': tmdb_data.get('rating'),
                            'imdb_id': tmdb_data.get('imdb_id'),
                            'backdrop_path': tmdb_data.get('backdrop_path')
                        }
                        if tmdb_data.get('runtime'):
                            movie.duration = tmdb_data['runtime'] * 60
                    else:
                        movie.title = parsed['title']
                        movie.year = parsed.get('year')
                    
                    if video_meta:
                        if not movie.duration:  # Only set if TMDB didn't provide
                            movie.duration = video_meta.get('duration')
                        movie.resolution = video_meta.get('resolution')
                        movie.codec = video_meta.get('codec')
                    
                    await session.commit()
                    movie_count += 1
                    logger.info(f"  ✅ Saved: '{movie.title}'")
                    
                except Exception as e:
                    logger.error(f"  ❌ Error processing {movie_file.name}: {e}")
                    logger.error(f"      Exception type: {type(e).__name__}")
                    if hasattr(e, 'orig'):
                        logger.error(f"      Original error: {e.orig}")
                    await session.rollback()
        
        logger.info(f"\n{'='*80}")
        logger.info(f"✓ Movies complete: {movie_count} processed")
        return movie_count
    
    async def scan_tv_shows(self) -> Dict[str, int]:
        """Scan TV directory for shows, seasons, and episodes."""
        logger.info("\n" + "📺 SCANNING TV SHOWS" + "="*63)
        
        show_dirs = [d for d in self.tv_dir.iterdir() if d.is_dir()]
        logger.info(f"Found {len(show_dirs)} TV show directories")
        
        show_count = 0
        season_count = 0
        episode_count = 0
        
        async with AsyncSessionLocal() as session:
            for show_idx, show_dir in enumerate(show_dirs, 1):
                try:
                    show_name = show_dir.name
                    logger.info(f"\n{'='*80}")
                    logger.info(f"[{show_idx}/{len(show_dirs)}] 📺 {show_name}")
                    logger.info(f"{'='*80}")
                    
                    # Look up show on TMDB
                    tmdb_show = None
                    if self.tmdb_service:
                        logger.info(f"  🔍 Searching TMDB for show...")
                        tmdb_show = self.tmdb_service.search_tv_show(show_name)
                        
                        if tmdb_show:
                            logger.info(f"  ✅ TMDB: '{tmdb_show['title']}'")
                            logger.info(f"     ID: {tmdb_show.get('tmdb_id')}")
                            logger.info(f"     Seasons: {tmdb_show.get('number_of_seasons', 'N/A')}")
                            logger.info(f"     Poster: {'✓' if tmdb_show.get('poster_path') else '✗'}")
                        else:
                            logger.warning(f"  ❌ Show not found on TMDB")
                    
                    # Create or update show
                    result = await session.execute(
                        select(VideoTVShow).where(VideoTVShow.directory_path == str(show_dir))
                    )
                    show = result.scalar_one_or_none()
                    
                    if not show:
                        show = VideoTVShow(directory_path=str(show_dir))
                        session.add(show)
                        logger.info(f"  💾 Creating new show")
                    else:
                        logger.info(f"  💾 Updating existing show (ID: {show.id})")
                    
                    # Update show fields
                    if tmdb_show:
                        show.title = tmdb_show['title']
                        show.year = tmdb_show.get('year')
                        show.description = tmdb_show.get('description')
                        show.poster_path = tmdb_show.get('poster_path')
                        show.extra_metadata = {
                            'tmdb_id': tmdb_show.get('tmdb_id'),
                            'genres': tmdb_show.get('genres', []),
                            'rating': tmdb_show.get('rating'),
                            'status': tmdb_show.get('status'),
                            'number_of_seasons': tmdb_show.get('number_of_seasons'),
                            'networks': tmdb_show.get('networks', []),
                            'backdrop_path': tmdb_show.get('backdrop_path')
                        }
                    else:
                        show.title = show_name
                    
                    await session.flush()  # Get show.id
                    show_count += 1
                    logger.info(f"  ✅ Show saved: '{show.title}' (ID: {show.id})")
                    
                    # Scan seasons
                    season_dirs = [d for d in show_dir.iterdir() if d.is_dir() and d.name.isdigit()]
                    logger.info(f"\n  📁 Found {len(season_dirs)} season directories")
                    
                    for season_dir in sorted(season_dirs, key=lambda x: int(x.name)):
                        season_num = int(season_dir.name)
                        logger.info(f"\n  {'─'*76}")
                        logger.info(f"  Season {season_num}")
                        logger.info(f"  {'─'*76}")
                        
                        # Get TMDB season data
                        tmdb_season = None
                        if tmdb_show and show.extra_metadata and show.extra_metadata.get('tmdb_id'):
                            logger.info(f"    🔍 Fetching season {season_num} from TMDB...")
                            tmdb_season = self.tmdb_service.get_tv_season_details(
                                show.extra_metadata['tmdb_id'],
                                season_num
                            )
                            if tmdb_season:
                                ep_count = len(tmdb_season.get('episodes', []))
                                logger.info(f"    ✅ TMDB: {ep_count} episodes")
                            else:
                                logger.warning(f"    ❌ Season data not found on TMDB")
                        
                        # Create or update season
                        result = await session.execute(
                            select(VideoTVSeason).where(
                                VideoTVSeason.show_id == show.id,
                                VideoTVSeason.season_number == season_num
                            )
                        )
                        season = result.scalar_one_or_none()
                        
                        if not season:
                            season = VideoTVSeason(
                                show_id=show.id,
                                season_number=season_num,
                                directory_path=str(season_dir)
                            )
                            session.add(season)

                        if tmdb_season:
                            season.poster_path = tmdb_season.get('poster_path')
                        
                        await session.flush()  # Get season.id
                        season_count += 1
                        
                        # Scan episodes
                        episode_files = [f for f in season_dir.iterdir()
                                        if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS]
                        logger.info(f"    📹 Found {len(episode_files)} episode files")
                        
                        for ep_file in sorted(episode_files):
                            try:
                                logger.info(f"\n    ├─ {ep_file.name}")
                                
                                # Parse episode number
                                parsed_ep = self._parse_episode_filename(ep_file.name)
                                ep_num = parsed_ep.get('episode_number')
                                
                                if not ep_num:
                                    logger.warning(f"    │  ❌ Could not parse episode number")
                                    continue
                                
                                logger.info(f"    │  Episode {ep_num}")
                                
                                # Get video metadata (may contain episode title)
                                video_meta = self._extract_video_metadata(ep_file)
                                
                                # Priority order for episode title:
                                # 1. Video file metadata (embedded title tag)
                                # 2. TMDB API
                                # 3. Parsed from filename
                                # 4. Default "Episode X"
                                
                                ep_title = None
                                ep_description = None
                                ep_metadata = None
                                title_source = None
                                
                                # Check video metadata first (but ignore filename-like titles)
                                if video_meta and video_meta.get('title'):
                                    meta_title = video_meta['title']
                                    # Ignore if it looks like a filename (contains S##E## pattern or episode numbers)
                                    if not re.search(r'[Ss]\d+[Ee]\d+|\d+x\d+|\.S\d+E\d+', meta_title):
                                        ep_title = meta_title
                                        title_source = 'metadata'
                                        logger.info(f"    │  📼 Metadata title: '{ep_title}'")
                                    else:
                                        logger.info(f"    │  ⚠️  Ignoring filename-like metadata: '{meta_title}'")
                                
                                # Try TMDB next (only if we don't have a title from metadata)
                                if not ep_title and tmdb_season and tmdb_season.get('episodes'):
                                    tmdb_episode = next(
                                        (e for e in tmdb_season['episodes'] if e.get('episode_number') == ep_num),
                                        None
                                    )
                                    if tmdb_episode:
                                        ep_title = tmdb_episode.get('name')
                                        ep_description = tmdb_episode.get('overview')
                                        ep_metadata = {
                                            'tmdb_id': tmdb_episode.get('id'),
                                            'air_date': tmdb_episode.get('air_date'),
                                            'rating': tmdb_episode.get('vote_average')
                                        }
                                        if ep_title:
                                            title_source = 'tmdb'
                                            logger.info(f"    │  ✅ TMDB: '{ep_title}'")
                                        if ep_description:
                                            logger.info(f"    │     Description: {ep_description[:50]}...")
                                    else:
                                        logger.info(f"    │  ⚠️  Episode {ep_num} not in TMDB data")
                                
                                # Try parsed filename next
                                if not ep_title:
                                    ep_title = parsed_ep.get('title')
                                    if ep_title:
                                        title_source = 'filename'
                                        logger.info(f"    │  📝 Parsed from filename: '{ep_title}'")
                                
                                # Final fallback
                                if not ep_title:
                                    ep_title = f"Episode {ep_num}"
                                    title_source = 'default'
                                    logger.info(f"    │  ⚠️  Using default title")
                                
                                # Create or update episode
                                result = await session.execute(
                                    select(VideoTVEpisode).where(
                                        VideoTVEpisode.file_path == str(ep_file)
                                    )
                                )
                                episode = result.scalar_one_or_none()
                                
                                if not episode:
                                    episode = VideoTVEpisode(
                                        season_id=season.id,
                                        episode_number=ep_num,
                                        file_path=str(ep_file),
                                        file_size=ep_file.stat().st_size
                                    )
                                    session.add(episode)
                                    logger.info(f"    │  💾 Creating new episode")
                                else:
                                    logger.info(f"    │  💾 Updating existing episode (ID: {episode.id})")

                                # Always update these fields (for both new and existing episodes)
                                episode.episode_number = ep_num  # Important: update this for existing episodes too!
                                episode.title = ep_title
                                episode.description = ep_description
                                episode.extra_metadata = ep_metadata
                                episode.file_size = ep_file.stat().st_size

                                if video_meta:
                                    episode.duration = video_meta.get('duration')
                                    episode.resolution = video_meta.get('resolution')
                                    episode.codec = video_meta.get('codec')
                                
                                await session.commit()
                                episode_count += 1
                                logger.info(f"    │  ✅ Saved: '{ep_title}'")
                                
                            except Exception as e:
                                logger.error(f"    │  ❌ Error processing episode: {e}", exc_info=True)
                                await session.rollback()
                    
                    logger.info(f"\n  ✅ Show complete: {show.title}")
                    
                except Exception as e:
                    logger.error(f"❌ Error processing show {show_dir.name}: {e}", exc_info=True)
                    await session.rollback()
        
        logger.info(f"\n{'='*80}")
        logger.info(f"✓ TV Shows complete:")
        logger.info(f"  Shows: {show_count}")
        logger.info(f"  Seasons: {season_count}")
        logger.info(f"  Episodes: {episode_count}")
        
        return {
            "shows": show_count,
            "seasons": season_count,
            "episodes": episode_count
        }
    
    def _parse_movie_filename(self, filename: str) -> Dict[str, Any]:
        """Parse movie title and year from filename."""
        name = Path(filename).stem
        
        # Clean up the name
        cleaned = name.replace('.', ' ').replace('_', ' ')
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        # Strategy: Find the LAST occurrence of a 4-digit year (most likely release year)
        # Look for years in format: "YYYY" or "(YYYY)" or "[YYYY]" or ".YYYY."
        year_patterns = [
            (r'\[(\d{4})\]', 1),           # [2025]
            (r'\((\d{4})\)', 1),           # (2025)
            (r'\.(\d{4})\.', 1),           # .2025.
            (r'\s(\d{4})\s', 1),           # space 2025 space
            (r'\.(\d{4})$', 1),            # .2025 at end
            (r'\s(\d{4})$', 1),            # space 2025 at end
        ]
        
        year = None
        year_end = len(cleaned)
        
        # Try each pattern and use the LAST match found
        for pattern, group_idx in year_patterns:
            for match in re.finditer(pattern, cleaned):
                year_candidate = int(match.group(group_idx))
                if 1900 <= year_candidate <= 2099:
                    year = year_candidate
                    year_end = match.start()
        
        # Extract title (everything before year)
        title = cleaned[:year_end].strip()
        
        # Remove quality tags and release info
        title = re.sub(r'\b(1080p|720p|480p|2160p|4K|HEVC|x264|x265|BluRay|WEBRip|WEB-DL|YIFY|YTS|MX|AAC|10bit|BRrip|REMASTERED|REPACK|LT|AM)\b.*', '', title, flags=re.IGNORECASE)
        title = re.sub(r'\s+', ' ', title).strip()
        
        # Clean trailing punctuation
        title = re.sub(r'[\.\-\s]+$', '', title).strip()
        
        # If title is still empty, just use cleaned filename before any quality tags
        if not title:
            title = re.sub(r'\b(1080p|720p)\b.*', '', cleaned, flags=re.IGNORECASE).strip()
        
        return {'title': title, 'year': year}
    
    def _parse_episode_filename(self, filename: str) -> Dict[str, Any]:
        """Parse episode number and title from filename."""
        name = Path(filename).stem

        # Try to match S##E## or #x## format first
        match = re.search(r'[Ss](\d+)[Ee](\d+)|(\d+)[xX](\d+)', name)
        if match:
            ep_num = int(match.group(2) or match.group(4))

            # Extract title after episode marker
            title_part = name[match.end():].strip()
            title_part = re.sub(r'^[\s\-\.]+', '', title_part)

            if title_part:
                title_part = title_part.replace('.', ' ').replace('_', ' ')
                title_part = re.sub(r'\b(1080p|720p|480p|HEVC|x264|x265)\b.*', '', title_part, flags=re.IGNORECASE)
                title_part = re.sub(r'\s+', ' ', title_part).strip()

            return {
                'episode_number': ep_num,
                'title': title_part if title_part else None
            }
        
        # Fall back to simple numbered filename (e.g., "1.mkv", "2.mkv")
        if name.isdigit():
            return {
                'episode_number': int(name),
                'title': None
            }
        
        # No match found
        return {}
    
    def _extract_video_metadata(self, video_path: Path) -> Optional[Dict[str, Any]]:
        """Extract metadata from video file using ffprobe."""
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json',
                 '-show_format', '-show_streams', str(video_path)],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                return None
            
            data = json.loads(result.stdout)
            
            # Extract duration
            duration = None
            if 'format' in data and 'duration' in data['format']:
                duration = int(float(data['format']['duration']))
            
            # Extract metadata tags (title, episode, show name, etc.)
            tags = {}
            if 'format' in data and 'tags' in data['format']:
                tags = data['format']['tags']
            
            # Try to get episode title from metadata
            episode_title = None
            for key in ['title', 'TITLE', 'Title', 'episode', 'EPISODE']:
                if key in tags and tags[key]:
                    episode_title = tags[key]
                    break
            
            # Extract video stream info
            video_stream = next((s for s in data.get('streams', []) if s.get('codec_type') == 'video'), None)
            
            resolution = None
            codec = None
            if video_stream:
                width = video_stream.get('width')
                height = video_stream.get('height')
                if width and height:
                    if height >= 2160:
                        resolution = '2160p'
                    elif height >= 1080:
                        resolution = '1080p'
                    elif height >= 720:
                        resolution = '720p'
                    elif height >= 480:
                        resolution = '480p'
                    else:
                        resolution = f'{width}x{height}'
                
                codec = video_stream.get('codec_name')
            
            metadata = {
                'duration': duration,
                'resolution': resolution,
                'codec': codec
            }
            
            if episode_title:
                metadata['title'] = episode_title
            
            return metadata
        except Exception as e:
            logger.debug(f"Could not extract video metadata from {video_path}: {e}")
            return None
