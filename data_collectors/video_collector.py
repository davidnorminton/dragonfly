"""Improved Video library scanner for Movies and TV Shows."""
import logging
import re
import subprocess
import json
from pathlib import Path
from typing import Dict, List, Optional, Any
from database.base import AsyncSessionLocal
from database.models import VideoMovie, VideoTVShow, VideoTVSeason, VideoTVEpisode, VideoPlaybackProgress, VideoSimilarContent
from sqlalchemy import select, delete
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
        
    def _cleanup_metadata_files(self, directory: Path) -> int:
        """Delete macOS metadata files (._* and .DS_Store) from directory recursively."""
        deleted_count = 0
        try:
            for item in directory.rglob('*'):
                if item.is_file():
                    # Delete macOS metadata files
                    if item.name.startswith('._') or item.name == '.DS_Store':
                        try:
                            item.unlink()
                            deleted_count += 1
                            logger.debug(f"Deleted metadata file: {item}")
                        except (OSError, PermissionError) as e:
                            logger.warning(f"Could not delete metadata file {item}: {e}")
            if deleted_count > 0:
                logger.info(f"🗑️  Deleted {deleted_count} macOS metadata files from {directory}")
        except Exception as e:
            logger.warning(f"Error cleaning up metadata files in {directory}: {e}")
        return deleted_count
    
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
        
        # Clean up macOS metadata files before scanning
        logger.info("🧹 Cleaning up macOS metadata files...")
        total_deleted = 0
        if self.movies_dir.exists():
            total_deleted += self._cleanup_metadata_files(self.movies_dir)
        if self.tv_dir.exists():
            total_deleted += self._cleanup_metadata_files(self.tv_dir)
        if total_deleted > 0:
            logger.info(f"✅ Cleaned up {total_deleted} metadata files")
        
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
        
        movie_files = [
            f for f in self.movies_dir.iterdir() 
            if f.is_file() 
            and f.suffix.lower() in VIDEO_EXTENSIONS
            and not f.name.startswith('._')  # Skip macOS metadata files
            and not f.name.startswith('.DS_Store')  # Skip macOS Finder files
        ]
        
        logger.info(f"Found {len(movie_files)} movie files (excluding hidden/metadata files)")
        
        movie_count = 0
        
        # First, pre-load all existing movie paths into a set for fast lookup
        # This avoids checking the database for each file and ensures we see all existing paths
        async with AsyncSessionLocal() as pre_session:
            pre_result = await pre_session.execute(select(VideoMovie.file_path))
            existing_paths = {path for (path,) in pre_result.all() if path}
            
            # Also build a map of resolved paths -> movie IDs for path normalization checks
            resolved_path_map = {}
            all_movies_result = await pre_session.execute(select(VideoMovie))
            for movie in all_movies_result.scalars().all():
                if movie.file_path:
                    try:
                        resolved = str(Path(movie.file_path).resolve())
                        if resolved not in resolved_path_map:
                            resolved_path_map[resolved] = movie.id
                    except (OSError, ValueError):
                        pass
        
        logger.info(f"📊 Loaded {len(existing_paths)} existing movie paths from database")
        
        async with AsyncSessionLocal() as session:
            for idx, movie_file in enumerate(movie_files, 1):
                try:
                    logger.info(f"\n[{idx}/{len(movie_files)}] {movie_file.name}")
                    
                    # Normalize path FIRST before any other processing
                    try:
                        normalized_path = str(movie_file.resolve())
                    except (OSError, ValueError) as e:
                        logger.warning(f"  ⚠️  Could not resolve path '{movie_file}': {e}, using as-is")
                        normalized_path = str(movie_file)
                    
                    # CRITICAL CHECK: If path is already in DB, skip this file entirely
                    if normalized_path in existing_paths:
                        logger.info(f"  ⏭️  SKIP: Path already in database: '{normalized_path}'")
                        continue
                    
                    # Also check if resolved path matches any existing resolved path
                    current_resolved = normalized_path
                    try:
                        current_resolved = str(movie_file.resolve())
                    except (OSError, ValueError):
                        pass
                    
                    if current_resolved in resolved_path_map:
                        logger.info(f"  ⏭️  SKIP: Resolved path already exists (ID: {resolved_path_map[current_resolved]}): '{current_resolved}'")
                        continue
                    
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
                    
                    # Step 4: Final DB check (double-check after all processing)
                    result = await session.execute(
                        select(VideoMovie).where(VideoMovie.file_path == normalized_path)
                    )
                    existing = result.scalar_one_or_none()
                    
                    if existing:
                        logger.info(f"  ⏭️  SKIP: Path found in DB during final check (ID: {existing.id})")
                        # Update the in-memory set so we don't check again
                        existing_paths.add(normalized_path)
                        if current_resolved:
                            resolved_path_map[current_resolved] = existing.id
                        continue
                    
                    # Step 5: Create new movie - path confirmed NOT in DB
                    logger.info(f"  💾 Creating new movie")
                    movie = VideoMovie(
                        file_path=normalized_path,
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
                    
                    # Flush before commit to trigger any unique constraint violations early
                    await session.flush()
                    
                    # Commit the changes
                    await session.commit()
                    
                    # Update in-memory set immediately after successful commit
                    existing_paths.add(normalized_path)
                    if current_resolved:
                        resolved_path_map[current_resolved] = movie.id
                    
                    movie_count += 1
                    logger.info(f"  ✅ Saved: '{movie.title}'")
                    
                except Exception as e:
                    # Check if it's a unique constraint violation (duplicate)
                    from sqlalchemy.exc import IntegrityError
                    if isinstance(e, IntegrityError) or (hasattr(e, 'orig') and 'unique constraint' in str(e.orig).lower()):
                        logger.warning(f"  ⚠️  Duplicate detected for {movie_file.name} (unique constraint violation) - skipping")
                        await session.rollback()
                        continue
                    
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
                    
                    # Priority order for show name:
                    # 1. TMDB API (PRIMARY)
                    # 2. Video file metadata (FALLBACK)
                    # 3. Directory name (LAST RESORT)
                    
                    tmdb_show = None
                    show_name_from_api = None
                    show_name_from_metadata = None
                    
                    # Step 1: Try TMDB API first (PRIMARY)
                    if self.tmdb_service:
                        logger.info(f"  🔍 [1/3] Searching TMDB API for show...")
                        tmdb_show = self.tmdb_service.search_tv_show(show_name)
                        
                        if tmdb_show:
                            show_name_from_api = tmdb_show['title']
                            logger.info(f"  ✅ TMDB API: '{show_name_from_api}'")
                            logger.info(f"     ID: {tmdb_show.get('tmdb_id')}")
                            logger.info(f"     Seasons: {tmdb_show.get('number_of_seasons', 'N/A')}")
                            logger.info(f"     Poster: {'✓' if tmdb_show.get('poster_path') else '✗'}")
                        else:
                            logger.warning(f"  ❌ Show not found on TMDB API")
                    
                    # Step 2: If API failed, try extracting from video file metadata (FALLBACK)
                    if not tmdb_show:
                        logger.info(f"  🔍 [2/3] Extracting show name from video file metadata...")
                        # Look for episode files to extract metadata
                        season_dirs = [d for d in show_dir.iterdir() if d.is_dir() and d.name.isdigit()]
                        for season_dir in season_dirs[:1]:  # Check first season only
                            episode_files = [
                                f for f in season_dir.iterdir()
                                if f.is_file() 
                                and f.suffix.lower() in VIDEO_EXTENSIONS
                                and not f.name.startswith('._')  # Skip macOS metadata files
                                and not f.name.startswith('.DS_Store')  # Skip macOS Finder files
                            ]
                            for ep_file in episode_files[:3]:  # Check first 3 episodes
                                show_name_from_metadata = self._extract_show_name_from_metadata(ep_file)
                                if show_name_from_metadata:
                                    logger.info(f"  ✅ Metadata: '{show_name_from_metadata}'")
                                    # Try TMDB again with metadata name
                                    if self.tmdb_service:
                                        logger.info(f"  🔍 Retrying TMDB API with metadata name...")
                                        tmdb_show = self.tmdb_service.search_tv_show(show_name_from_metadata)
                                        if tmdb_show:
                                            show_name_from_api = tmdb_show['title']
                                            logger.info(f"  ✅ TMDB API (retry): '{show_name_from_api}'")
                                    break
                            if show_name_from_metadata:
                                break
                        
                        if not show_name_from_metadata:
                            logger.info(f"  ⚠️  No show name found in video metadata")
                    
                    # Step 3: Use directory name as last resort
                    final_show_name = show_name_from_api or show_name_from_metadata or show_name
                    if final_show_name != show_name:
                        logger.info(f"  📝 [3/3] Using: '{final_show_name}' (source: {'API' if show_name_from_api else 'metadata'})")
                    else:
                        logger.info(f"  📝 [3/3] Using directory name: '{final_show_name}' (last resort)")
                    
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
                    
                    # Update show fields - prioritize API data
                    if tmdb_show:
                        show.title = tmdb_show['title']  # Always use API title when available
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
                        # Fallback: use metadata name if available, otherwise directory name
                        show.title = show_name_from_metadata or show_name
                    
                    await session.flush()  # Get show.id
                    show_count += 1
                    title_source = "API" if tmdb_show else ("metadata" if show_name_from_metadata else "directory")
                    logger.info(f"  ✅ Show saved: '{show.title}' (ID: {show.id}, source: {title_source})")
                    
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
                        episode_files = [
                            f for f in season_dir.iterdir()
                            if f.is_file() 
                            and f.suffix.lower() in VIDEO_EXTENSIONS
                            and not f.name.startswith('._')  # Skip macOS metadata files
                            and not f.name.startswith('.DS_Store')  # Skip macOS Finder files
                        ]
                        logger.info(f"    📹 Found {len(episode_files)} episode files")
                        
                        # Track metadata titles to detect duplicates (which would indicate incorrect metadata)
                        metadata_titles_seen = {}
                        
                        # Force update any existing episodes with "TheKing" or similar release group titles
                        if season.id:
                            result = await session.execute(
                                select(VideoTVEpisode).where(
                                    VideoTVEpisode.season_id == season.id
                                )
                            )
                            existing_episodes = result.scalars().all()
                            theking_episodes = [e for e in existing_episodes if e.title and 'theking' in e.title.lower()]
                            if theking_episodes:
                                logger.info(f"    ⚠️  Found {len(theking_episodes)} existing episodes with 'TheKing' title - will force update")
                        
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
                                # 1. TMDB API (PRIMARY)
                                # 2. Video file metadata (FALLBACK)
                                # 3. Parsed from filename
                                # 4. Default "Episode X"
                                
                                ep_title = None
                                ep_description = None
                                ep_metadata = None
                                title_source = None
                                meta_title = None
                                
                                # Extract metadata title for potential fallback (but don't use it yet)
                                # ALWAYS filter out release group names FIRST - this is the most important check
                                meta_title = None
                                if video_meta and video_meta.get('title'):
                                    raw_meta_title = video_meta['title']
                                    filename_lower = ep_file.name.lower()
                                    meta_title_lower = raw_meta_title.lower().strip()
                                    
                                    # CRITICAL: Check release group blacklist FIRST - this MUST catch "TheKing"
                                    release_groups = ['theking', 'the king', 'yify', 'yts', 'rarbg', 'ettv', 'eztv', 'killer', 'x264', 'x265', 'hevc', 'ac3', 'aac', 'bluray', 'webrip', 'web-dl', 'sajid790']
                                    if meta_title_lower in release_groups:
                                        logger.info(f"    │  ⚠️  BLOCKED: Release group/uploader metadata: '{raw_meta_title}'")
                                        meta_title = None  # Explicitly set to None
                                    # Check 2: Ignore if metadata title appears in filename (especially after dash)
                                    elif meta_title_lower in filename_lower:
                                        # Check if it appears after a dash, underscore, or before file extension
                                        if re.search(r'[-_]\s*' + re.escape(meta_title_lower) + r'(\s|\.|$|\.mp4|\.mkv|\.avi)', filename_lower):
                                            logger.info(f"    │  ⚠️  BLOCKED: Metadata appears in filename (release group): '{raw_meta_title}'")
                                            meta_title = None
                                        # Also check if it's the last word before extension
                                        elif filename_lower.endswith(meta_title_lower + '.mp4') or filename_lower.endswith(meta_title_lower + '.mkv'):
                                            logger.info(f"    │  ⚠️  BLOCKED: Metadata matches filename ending (release group): '{raw_meta_title}'")
                                            meta_title = None
                                        else:
                                            # It's in filename but not as release group - might be valid episode title
                                            meta_title = raw_meta_title
                                    # Check 3: Ignore if it looks like a filename (contains S##E## pattern or episode numbers)
                                    elif re.search(r'[Ss]\d+[Ee]\d+|\d+x\d+|\.S\d+E\d+', raw_meta_title):
                                        logger.info(f"    │  ⚠️  BLOCKED: Filename-like metadata: '{raw_meta_title}'")
                                        meta_title = None
                                    # Check 4: Ignore if it's just a single word that looks like a release group (all caps, short)
                                    elif len(raw_meta_title) < 15 and raw_meta_title.isupper() and not re.search(r'\s', raw_meta_title):
                                        logger.info(f"    │  ⚠️  BLOCKED: Suspicious single-word metadata: '{raw_meta_title}'")
                                        meta_title = None
                                    # Check 5: If metadata title is same across multiple episodes, it's likely wrong (handled later)
                                    else:
                                        # Metadata passed all checks, might be valid
                                        meta_title = raw_meta_title
                                        logger.info(f"    │  📼 Metadata title extracted: '{meta_title}' (will use as fallback if TMDB fails)")
                                    
                                    # FINAL CHECK: If somehow meta_title still contains "TheKing", block it
                                    if meta_title and 'theking' in meta_title.lower():
                                        logger.error(f"    │  ❌ CRITICAL: 'TheKing' detected in meta_title after filtering! Blocking.")
                                        meta_title = None
                                
                                # PRIORITY ORDER:
                                # 1. TMDB API (PRIMARY - always try first)
                                # 2. Metadata (FALLBACK - only if TMDB doesn't exist/fails)
                                # 3. Filename (FALLBACK - only if no metadata)
                                # 4. Default "Episode X" (LAST RESORT)
                                
                                # Step 1: Try TMDB API first (PRIMARY)
                                logger.info(f"    │  🔍 [1/4] Checking TMDB API for episode {ep_num}...")
                                if tmdb_season and tmdb_season.get('episodes'):
                                    episodes_list = tmdb_season['episodes']
                                    logger.info(f"    │     TMDB has {len(episodes_list)} episodes in season")
                                    
                                    # Try to find matching episode (handle both int and string comparisons)
                                    tmdb_episode = None
                                    for e in episodes_list:
                                        ep_num_tmdb = e.get('episode_number')
                                        # Handle both int and string comparisons
                                        if ep_num_tmdb == ep_num or str(ep_num_tmdb) == str(ep_num):
                                            tmdb_episode = e
                                            logger.info(f"    │     ✓ Found match: TMDB episode {ep_num_tmdb} = file episode {ep_num}")
                                            break
                                    
                                    if tmdb_episode:
                                        tmdb_title = tmdb_episode.get('name')
                                        if tmdb_title:
                                            ep_title = tmdb_title
                                            ep_description = tmdb_episode.get('overview')
                                            ep_metadata = {
                                                'tmdb_id': tmdb_episode.get('id'),
                                                'air_date': tmdb_episode.get('air_date'),
                                                'rating': tmdb_episode.get('vote_average')
                                            }
                                            title_source = 'tmdb'
                                            logger.info(f"    │  ✅ TMDB API: '{ep_title}'")
                                            if ep_description:
                                                logger.info(f"    │     Description: {ep_description[:50]}...")
                                        else:
                                            logger.warning(f"    │  ⚠️  TMDB episode {ep_num} found but has no title (name field is empty)")
                                    else:
                                        logger.warning(f"    │  ⚠️  Episode {ep_num} not found in TMDB data")
                                        logger.info(f"    │     Available TMDB episode numbers: {[e.get('episode_number') for e in episodes_list[:10]]}")
                                else:
                                    if not tmdb_season:
                                        logger.warning(f"    │  ⚠️  No TMDB season data available (tmdb_season is None)")
                                    elif not tmdb_season.get('episodes'):
                                        logger.warning(f"    │  ⚠️  TMDB season data exists but has no episodes list")
                                
                                # Step 2: Try video metadata as fallback (only if TMDB didn't provide a title)
                                if not ep_title:
                                    logger.info(f"    │  🔍 [2/4] TMDB failed, trying metadata...")
                                    if meta_title:
                                        # Double-check: Never use release group names as titles
                                        release_groups = ['theking', 'the king', 'yify', 'yts', 'rarbg', 'ettv', 'eztv', 'killer', 'x264', 'x265', 'hevc', 'ac3', 'aac', 'bluray', 'webrip', 'web-dl', 'sajid790']
                                        if meta_title.lower() in release_groups:
                                            logger.warning(f"    │  ⚠️  Rejecting metadata - release group name: '{meta_title}'")
                                            meta_title = None
                                        # Check if this metadata title was already used for another episode
                                        elif meta_title in metadata_titles_seen:
                                            logger.warning(f"    │  ⚠️  Metadata title '{meta_title}' already used for episode {metadata_titles_seen[meta_title]} - likely incorrect, skipping")
                                            meta_title = None
                                        
                                        if meta_title:
                                            metadata_titles_seen[meta_title] = ep_num
                                            ep_title = meta_title
                                            title_source = 'metadata'
                                            logger.info(f"    │  ✅ Metadata: '{ep_title}'")
                                    else:
                                        logger.info(f"    │     No metadata available")
                                
                                # Step 3: Try parsed filename next (only if TMDB and metadata both failed)
                                if not ep_title:
                                    logger.info(f"    │  🔍 [3/4] TMDB and metadata failed, trying filename...")
                                    ep_title = parsed_ep.get('title')
                                    if ep_title:
                                        title_source = 'filename'
                                        logger.info(f"    │  ✅ Filename: '{ep_title}'")
                                    else:
                                        logger.info(f"    │     No title in filename")
                                
                                # Step 4: Final fallback - default "Episode X"
                                if not ep_title:
                                    ep_title = f"Episode {ep_num}"
                                    title_source = 'default'
                                    logger.info(f"    │  ⚠️  [4/4] Using default title: '{ep_title}'")
                                
                                # CRITICAL FINAL CHECK: Never allow "TheKing" or release group names as title
                                # This is the absolute last check before saving - reject "TheKing" from ANY source
                                if ep_title and 'theking' in ep_title.lower():
                                    logger.error(f"    │  ❌ BLOCKED: Title contains 'TheKing' - rejecting and using default")
                                    # Try TMDB one more time if available
                                    if tmdb_season and tmdb_season.get('episodes'):
                                        for e in tmdb_season['episodes']:
                                            ep_num_tmdb = e.get('episode_number')
                                            if ep_num_tmdb == ep_num or str(ep_num_tmdb) == str(ep_num):
                                                tmdb_title = e.get('name')
                                                if tmdb_title and 'theking' not in tmdb_title.lower():
                                                    ep_title = tmdb_title
                                                    ep_description = e.get('overview')
                                                    ep_metadata = {
                                                        'tmdb_id': e.get('id'),
                                                        'air_date': e.get('air_date'),
                                                        'rating': e.get('vote_average')
                                                    }
                                                    title_source = 'tmdb'
                                                    logger.info(f"    │  ✅ Recovered from TMDB: '{ep_title}'")
                                                    break
                                    
                                    # If still "TheKing" or TMDB failed, use default
                                    if not ep_title or 'theking' in ep_title.lower():
                                        ep_title = f"Episode {ep_num}"
                                        title_source = 'default'
                                        logger.warning(f"    │  ⚠️  Using default title instead")
                                
                                # Create or update episode - try file_path first, then season+episode_number
                                result = await session.execute(
                                    select(VideoTVEpisode).where(
                                        VideoTVEpisode.file_path == str(ep_file)
                                    )
                                )
                                episode = result.scalar_one_or_none()
                                
                                # Fallback: if not found by file_path, try season_id + episode_number
                                if not episode:
                                    result = await session.execute(
                                        select(VideoTVEpisode).where(
                                            VideoTVEpisode.season_id == season.id,
                                            VideoTVEpisode.episode_number == ep_num
                                        )
                                    )
                                    episode = result.scalar_one_or_none()
                                    if episode:
                                        logger.info(f"    │  💾 Found existing episode by season+episode (ID: {episode.id}, file_path: {episode.file_path})")
                                        logger.info(f"    │     Updating file_path from '{episode.file_path}' to '{ep_file}'")
                                
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
                                    old_title = episode.title
                                    logger.info(f"    │  💾 Updating existing episode (ID: {episode.id})")
                                    logger.info(f"    │     Old title: '{old_title}'")
                                    logger.info(f"    │     New title: '{ep_title}' (source: {title_source})")
                                    
                                    # Final safety check: Never save "TheKing" as title
                                    if ep_title and 'theking' in ep_title.lower():
                                        logger.error(f"    │  ❌ ERROR: Attempted to save 'TheKing' as title! Using default instead.")
                                        ep_title = f"Episode {ep_num}"
                                        title_source = 'default'

                                # Always update these fields (for both new and existing episodes)
                                episode.episode_number = ep_num  # Important: update this for existing episodes too!
                                
                                # ABSOLUTE FINAL SAFETY CHECK: Never save "TheKing" - check right before assignment
                                if ep_title and 'theking' in ep_title.lower():
                                    logger.error(f"    │  ❌ CRITICAL ERROR: About to save 'TheKing' as title! Blocking and using default.")
                                    ep_title = f"Episode {ep_num}"
                                    title_source = 'default'
                                
                                # Log if we're updating from "TheKing"
                                if episode.title and 'theking' in episode.title.lower() and ep_title and 'theking' not in ep_title.lower():
                                    logger.info(f"    │  🔄 Updating title from '{episode.title}' to '{ep_title}'")
                                
                                # DEBUG: Log final title value before assignment
                                logger.info(f"    │  📝 Final title before save: '{ep_title}' (source: {title_source})")
                                
                                # Assign title - this is the final assignment, "TheKing" should never reach here
                                if ep_title and 'theking' in ep_title.lower():
                                    logger.error(f"    │  ❌ FATAL: 'TheKing' detected in final title! This should never happen!")
                                    ep_title = f"Episode {ep_num}"
                                    title_source = 'default'
                                
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
                                logger.info(f"    │  ✅ Saved: '{ep_title}' (source: {title_source}, episode {ep_num})")
                                
                                # Verify what was actually saved
                                await session.refresh(episode)
                                if episode.title != ep_title:
                                    logger.error(f"    │  ❌ ERROR: Title mismatch! Expected '{ep_title}' but saved '{episode.title}'")
                                else:
                                    logger.info(f"    │     ✓ Verified: Title correctly saved as '{episode.title}'")
                                
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
    
    def _extract_show_name_from_metadata(self, video_path: Path) -> Optional[str]:
        """
        Extract show name from video file metadata tags.
        
        Args:
            video_path: Path to video file
            
        Returns:
            Show name if found, None otherwise
        """
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json',
                 '-show_format', str(video_path)],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode != 0:
                return None
            
            data = json.loads(result.stdout)
            tags = {}
            if 'format' in data and 'tags' in data['format']:
                tags = data['format']['tags']
            
            # Try common metadata keys for show name
            for key in ['show', 'SHOW', 'Show', 'series', 'SERIES', 'Series', 
                       'tv_show', 'TV_SHOW', 'TV Show', 'album', 'ALBUM', 'Album',
                       'title', 'TITLE', 'Title']:  # Some files use 'title' for show name
                if key in tags and tags[key]:
                    potential_show_name = tags[key].strip()
                    # Ignore if it looks like a filename, episode pattern, or is too short
                    if (potential_show_name and 
                        len(potential_show_name) > 2 and
                        not re.search(r'[Ss]\d+[Ee]\d+|\d+x\d+|\.S\d+E\d+', potential_show_name) and
                        not potential_show_name.lower().endswith(('.mp4', '.mkv', '.avi', '.mov'))):
                        return potential_show_name
            
            return None
        except Exception as e:
            logger.debug(f"Could not extract show name from metadata {video_path}: {e}")
            return None
    
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


async def clear_video_library() -> bool:
    """Clear all video library data from the database."""
    try:
        async with AsyncSessionLocal() as session:
            # Delete in correct order due to foreign key constraints
            # Start with dependent tables first
            await session.execute(delete(VideoPlaybackProgress))
            await session.execute(delete(VideoSimilarContent))
            await session.execute(delete(VideoTVEpisode))
            await session.execute(delete(VideoTVSeason))
            await session.execute(delete(VideoTVShow))
            await session.execute(delete(VideoMovie))
            await session.commit()
            logger.info("Cleared all video library data")
            return True
    except Exception as e:
        logger.error(f"Error clearing video library: {e}", exc_info=True)
        return False
