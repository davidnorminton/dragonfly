"""Video library scanner for Movies and TV Shows."""
import logging
import os
import re
import json
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Any
from database.base import AsyncSessionLocal
from database.models import VideoMovie, VideoTVShow, VideoTVSeason, VideoTVEpisode
from sqlalchemy import select, delete as sql_delete
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
        
    async def scan_library(self) -> Dict[str, Any]:
        """
        Scan the entire video library.
        
        Returns:
            Dictionary with scan results including counts of movies, shows, seasons, and episodes.
        """
        logger.info(f"Starting video library scan in: {self.video_directory}")
        logger.info(f"TMDB API key configured: {bool(self.tmdb_service)}")
        
        if not self.video_directory.exists():
            logger.error(f"Video directory does not exist: {self.video_directory}")
            return {
                "success": False,
                "error": f"Video directory does not exist: {self.video_directory}"
            }
        
        results = {
            "success": True,
            "movies_scanned": 0,
            "tv_shows_scanned": 0,
            "seasons_scanned": 0,
            "episodes_scanned": 0,
            "errors": []
        }
        
        # Scan Movies
        logger.info(f"Checking for Movies directory: {self.movies_dir}")
        if self.movies_dir.exists():
            logger.info(f"Movies directory exists, starting scan...")
            try:
                movie_count = await self.scan_movies()
                results["movies_scanned"] = movie_count
                logger.info(f"✓ Scanned {movie_count} movies")
            except Exception as e:
                error_msg = f"Error scanning movies: {str(e)}"
                logger.error(error_msg, exc_info=True)
                results["errors"].append(error_msg)
        else:
            error_msg = f"Movies directory does not exist: {self.movies_dir}"
            logger.warning(error_msg)
            results["errors"].append(error_msg)
        
        # Scan TV Shows
        logger.info(f"Checking for TV directory: {self.tv_dir}")
        if self.tv_dir.exists():
            logger.info(f"TV directory exists, starting scan...")
            try:
                tv_results = await self.scan_tv_shows()
                results["tv_shows_scanned"] = tv_results["shows"]
                results["seasons_scanned"] = tv_results["seasons"]
                results["episodes_scanned"] = tv_results["episodes"]
                logger.info(f"✓ Scanned {tv_results['shows']} TV shows, {tv_results['seasons']} seasons, {tv_results['episodes']} episodes")
            except Exception as e:
                error_msg = f"Error scanning TV shows: {str(e)}"
                logger.error(error_msg, exc_info=True)
                results["errors"].append(error_msg)
        else:
            error_msg = f"TV directory does not exist: {self.tv_dir}"
            logger.warning(error_msg)
            results["errors"].append(error_msg)
        
        logger.info(f"Scan complete. Results: {results}")
        return results
    
    async def scan_movies(self) -> int:
        """
        Scan the Movies directory for movie files.
        
        Returns:
            Number of movies scanned.
        """
        async with AsyncSessionLocal() as session:
            movie_count = 0
            
            # List all items in directory
            items = list(self.movies_dir.iterdir())
            logger.info(f"Found {len(items)} items in Movies directory")
            
            for item in items:
                if item.is_file() and item.suffix.lower() in VIDEO_EXTENSIONS:
                    try:
                        logger.info(f"Processing movie file: {item.name}")
                        
                        # Parse movie information from filename
                        movie_info = self._parse_movie_filename(item.name)
                        logger.info(f"  Parsed title: {movie_info['title']}, Year: {movie_info.get('year')}")
                        
                        # Extract metadata from video file
                        logger.info(f"  Extracting video metadata...")
                        metadata = self._extract_video_metadata(item)
                        if metadata:
                            movie_info.update(metadata)
                            logger.info(f"  Extracted: duration={metadata.get('duration')}s, resolution={metadata.get('resolution')}, codec={metadata.get('codec')}")
                        
                        # Look up movie information from TMDB
                        if self.tmdb_service:
                            logger.info(f"  Looking up on TMDB: '{movie_info['title']}' ({movie_info.get('year')})")
                            tmdb_data = self.tmdb_service.search_movie(
                                movie_info["title"],
                                movie_info.get("year")
                            )
                            if tmdb_data:
                                logger.info(f"  ✓ Found on TMDB: {tmdb_data.get('title')} ({tmdb_data.get('year')})")
                                logger.info(f"    TMDB ID: {tmdb_data.get('tmdb_id')}")
                                logger.info(f"    Poster: {tmdb_data.get('poster_path')}")
                                logger.info(f"    Description: {tmdb_data.get('description', '')[:100]}...")
                                
                                # Override with TMDB data
                                movie_info["title"] = tmdb_data.get("title", movie_info["title"])
                                movie_info["description"] = tmdb_data.get("description")
                                movie_info["poster_path"] = tmdb_data.get("poster_path")
                                movie_info["year"] = tmdb_data.get("year", movie_info.get("year"))
                                if tmdb_data.get("runtime"):
                                    movie_info["duration"] = tmdb_data["runtime"] * 60  # Convert to seconds

                                # Store additional metadata as JSON
                                movie_info["extra_metadata"] = {
                                    "tmdb_id": tmdb_data.get("tmdb_id"),
                                    "genres": tmdb_data.get("genres", []),
                                    "rating": tmdb_data.get("rating"),
                                    "tagline": tmdb_data.get("tagline"),
                                    "imdb_id": tmdb_data.get("imdb_id"),
                                    "backdrop_path": tmdb_data.get("backdrop_path"),
                                }
                                logger.info(f"    Movie info updated with TMDB data: '{movie_info['title']}'")
                            else:
                                logger.warning(f"  ✗ Movie not found on TMDB - will use filename")
                        else:
                            logger.warning(f"  ✗ TMDB service not configured, skipping API lookup")
                        
                        # Check if movie already exists
                        logger.info(f"  Checking database for existing movie...")
                        result = await session.execute(
                            select(VideoMovie).where(VideoMovie.file_path == str(item))
                        )
                        existing_movie = result.scalar_one_or_none()

                        if existing_movie:
                            logger.info(f"  Updating existing movie in database (ID: {existing_movie.id})")
                            # Update existing movie
                            for key, value in movie_info.items():
                                if hasattr(existing_movie, key):
                                    setattr(existing_movie, key, value)
                            logger.info(f"  Updated movie: {existing_movie.title}")
                        else:
                            logger.info(f"  Creating new movie entry in database")
                            # Create new movie
                            movie = VideoMovie(
                                title=movie_info.get("title", item.stem),
                                file_path=str(item),
                                file_size=item.stat().st_size,
                                duration=movie_info.get("duration"),
                                year=movie_info.get("year"),
                                resolution=movie_info.get("resolution"),
                                codec=movie_info.get("codec"),
                                description=movie_info.get("description"),
                                poster_path=movie_info.get("poster_path"),
                                extra_metadata=movie_info.get("extra_metadata")
                            )
                            session.add(movie)
                            logger.info(f"  Movie added to session: '{movie.title}' ({movie.year})")
                        
                        # Commit after each movie to avoid large batched queries
                        logger.info(f"  Committing movie to database...")
                        await session.commit()
                        movie_count += 1
                        logger.info(f"  ✓ Movie #{movie_count} committed successfully: '{movie_info.get('title', item.stem)}'")

                    except Exception as e:
                        logger.error(f"  ✗ Error processing movie file {item}: {e}", exc_info=True)
                        # Rollback this movie and continue with next
                        await session.rollback()
                else:
                    if item.is_file():
                        logger.debug(f"Skipping non-video file: {item.name} (extension: {item.suffix})")
            
            logger.info(f"✓ All movies committed successfully ({movie_count} total)")
            return movie_count
    
    async def scan_tv_shows(self) -> Dict[str, int]:
        """
        Scan the TV directory for TV shows, seasons, and episodes.
        
        Returns:
            Dictionary with counts of shows, seasons, and episodes.
        """
        async with AsyncSessionLocal() as session:
            show_count = 0
            season_count = 0
            episode_count = 0
            
            # List all items in TV directory
            items = list(self.tv_dir.iterdir())
            logger.info(f"Found {len(items)} items in TV directory")
            
            # Iterate through show directories
            for show_dir in items:
                if not show_dir.is_dir():
                    logger.debug(f"Skipping non-directory: {show_dir.name}")
                    continue
                
                logger.info(f"Processing TV show: {show_dir.name}")
                
                try:
                    show_name = show_dir.name
                    logger.info(f"  Show name: {show_name}")
                    
                    # Look up TV show information from TMDB
                    show_data = {}
                    show_tmdb_id = None
                    if self.tmdb_service:
                        logger.info(f"  Looking up on TMDB: '{show_name}'")
                        tmdb_data = self.tmdb_service.search_tv_show(show_name)
                        if tmdb_data:
                            show_tmdb_id = tmdb_data.get("tmdb_id")
                            logger.info(f"  ✓ Found on TMDB: {tmdb_data.get('title')} ({tmdb_data.get('number_of_seasons')} seasons)")
                            logger.info(f"    TMDB ID: {show_tmdb_id}")
                            logger.info(f"    Poster: {tmdb_data.get('poster_path')}")
                            show_data = {
                                "title": tmdb_data.get("title", show_name),
                                "description": tmdb_data.get("description"),
                                "poster_path": tmdb_data.get("poster_path"),
                                "year": tmdb_data.get("year"),
                                "extra_metadata": {
                                    "tmdb_id": show_tmdb_id,
                                    "genres": tmdb_data.get("genres", []),
                                    "rating": tmdb_data.get("rating"),
                                    "status": tmdb_data.get("status"),
                                    "number_of_seasons": tmdb_data.get("number_of_seasons"),
                                    "number_of_episodes": tmdb_data.get("number_of_episodes"),
                                    "networks": tmdb_data.get("networks", []),
                                    "backdrop_path": tmdb_data.get("backdrop_path"),
                                }
                            }
                        else:
                            logger.warning(f"  ✗ TV show not found on TMDB")
                    else:
                        logger.warning(f"  ✗ TMDB service not configured, skipping API lookup")
                    
                    # Check if show already exists
                    logger.info(f"  Checking database for existing show...")
                    result = await session.execute(
                        select(VideoTVShow).where(VideoTVShow.title == show_name)
                    )
                    show = result.scalar_one_or_none()
                    
                    if not show:
                        logger.info(f"  Creating new show entry in database")
                        # Create new show
                        show = VideoTVShow(
                            title=show_data.get("title", show_name),
                            directory_path=str(show_dir),
                            description=show_data.get("description"),
                            poster_path=show_data.get("poster_path"),
                            year=show_data.get("year"),
                            extra_metadata=show_data.get("extra_metadata")
                        )
                        session.add(show)
                        await session.flush()  # Get the show ID
                        logger.info(f"  Show created with ID: {show.id}")
                    else:
                        logger.info(f"  Updating existing show (ID: {show.id})")
                        # Update existing show with TMDB data
                        if show_data:
                            for key, value in show_data.items():
                                if hasattr(show, key) and value is not None:
                                    setattr(show, key, value)
                                    logger.info(f"    Updated {key}: {str(value)[:100]}")

                    show_count += 1

                    # Commit the show immediately
                    await session.commit()
                    logger.info(f"  ✓ Show committed to database: '{show.title}'")
                    logger.info(f"    TMDB ID in DB: {show.extra_metadata.get('tmdb_id') if show.extra_metadata else 'None'}")
                    logger.info(f"    Poster in DB: {show.poster_path}")
                    
                    # Count seasons
                    season_dirs = [d for d in show_dir.iterdir() if d.is_dir()]
                    logger.info(f"  Found {len(season_dirs)} season directories")
                    
                    # Scan seasons within the show directory
                    for season_dir in season_dirs:
                        logger.info(f"    Processing season directory: {season_dir.name}")
                        
                        # Parse season number from directory name
                        season_num = self._parse_season_number(season_dir.name)
                        if season_num is None:
                            logger.warning(f"    Could not parse season number from: {season_dir.name}")
                            continue
                        
                        logger.info(f"    Season number: {season_num}")
                        
                        # Check if season already exists
                        result = await session.execute(
                            select(VideoTVSeason).where(
                                VideoTVSeason.show_id == show.id,
                                VideoTVSeason.season_number == season_num
                            )
                        )
                        season = result.scalar_one_or_none()
                        
                        if not season:
                            # Create new season
                            season = VideoTVSeason(
                                show_id=show.id,
                                season_number=season_num,
                                directory_path=str(season_dir)
                            )
                            session.add(season)
                            await session.flush()  # Get the season ID
                        
                        season_count += 1
                        
                        # Commit the season immediately
                        await session.commit()
                        logger.info(f"    ✓ Season committed to database")
                        
                        # Get TMDB season data if available
                        season_tmdb_data = None
                        if self.tmdb_service and show.extra_metadata and show.extra_metadata.get("tmdb_id"):
                            show_tmdb_id = show.extra_metadata["tmdb_id"]
                            logger.info(f"    Fetching season {season_num} details from TMDB (show ID: {show_tmdb_id})...")
                            season_tmdb_data = self.tmdb_service.get_tv_season_details(
                                show_tmdb_id,
                                season_num
                            )
                            if season_tmdb_data:
                                episode_count = season_tmdb_data.get('episode_count', 0)
                                logger.info(f"    ✓ Got TMDB data for season {season_num}: {episode_count} episodes")
                                if season_tmdb_data.get("episodes"):
                                    logger.info(f"    Episode names from TMDB: {[e.get('name', 'N/A') for e in season_tmdb_data['episodes'][:3]]}")
                            else:
                                logger.warning(f"    ✗ Failed to get TMDB season data")
                        else:
                            if not self.tmdb_service:
                                logger.warning(f"    ✗ TMDB service not available")
                            elif not show.extra_metadata:
                                logger.warning(f"    ✗ Show has no extra_metadata")
                            elif not show.extra_metadata.get("tmdb_id"):
                                logger.warning(f"    ✗ Show metadata has no tmdb_id")
                        
                        # Scan episodes within the season directory
                        episode_files = [f for f in season_dir.iterdir() if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS]
                        logger.info(f"    Found {len(episode_files)} video files")
                        
                        for episode_file in episode_files:
                            try:
                                logger.info(f"      Processing episode: {episode_file.name}")
                                # Parse episode information
                                episode_info = self._parse_episode_filename(episode_file.name)
                                logger.info(f"      Episode number: {episode_info['episode_number']}, Title: {episode_info.get('title', 'N/A')}")
                                
                                # Extract video metadata
                                metadata = self._extract_video_metadata(episode_file)
                                if metadata:
                                    episode_info.update(metadata)
                                
                                # Match with TMDB episode data
                                if season_tmdb_data and season_tmdb_data.get("episodes"):
                                    ep_num = episode_info["episode_number"]
                                    logger.info(f"      Matching episode {ep_num} with TMDB data...")
                                    logger.info(f"      Available TMDB episodes: {[f'E{e['episode_number']}:{e.get('name', 'N/A')}' for e in season_tmdb_data['episodes'][:5]]}")
                                    
                                    tmdb_episode = next(
                                        (ep for ep in season_tmdb_data["episodes"] if ep.get("episode_number") == ep_num),
                                        None
                                    )
                                    if tmdb_episode:
                                        # Use TMDB name if available, otherwise keep parsed title
                                        tmdb_name = tmdb_episode.get("name")
                                        if tmdb_name:
                                            episode_info["title"] = tmdb_name
                                            logger.info(f"      ✓ TMDB episode title: '{tmdb_name}'")
                                        else:
                                            logger.warning(f"      ✗ TMDB episode found but has no name")
                                        
                                        # Always set description from TMDB if available
                                        tmdb_overview = tmdb_episode.get("overview")
                                        if tmdb_overview:
                                            episode_info["description"] = tmdb_overview
                                            logger.info(f"      ✓ TMDB description: {tmdb_overview[:50]}...")
                                        
                                        episode_info["extra_metadata"] = {
                                            "tmdb_id": tmdb_episode.get("id"),
                                            "air_date": tmdb_episode.get("air_date"),
                                            "rating": tmdb_episode.get("vote_average"),
                                        }
                                    else:
                                        logger.warning(f"      ✗ Episode {ep_num} not found in TMDB episode list")
                                else:
                                    if not season_tmdb_data:
                                        logger.warning(f"      ✗ No TMDB season data available")
                                    elif not season_tmdb_data.get("episodes"):
                                        logger.warning(f"      ✗ TMDB season data has no episodes array")
                                
                                # Ensure episode has at least a basic title
                                if not episode_info.get("title"):
                                    episode_info["title"] = f"Episode {episode_info['episode_number']}"
                                    logger.info(f"      Using default title: '{episode_info['title']}'")
                                
                                # Check if episode already exists
                                result = await session.execute(
                                    select(VideoTVEpisode).where(
                                        VideoTVEpisode.file_path == str(episode_file)
                                    )
                                )
                                existing_episode = result.scalar_one_or_none()
                                
                                if existing_episode:
                                    # Update existing episode
                                    logger.info(f"      Updating existing episode in database")
                                    for key, value in episode_info.items():
                                        if hasattr(existing_episode, key):
                                            setattr(existing_episode, key, value)
                                    existing_episode.file_size = episode_file.stat().st_size
                                else:
                                    # Create new episode
                                    logger.info(f"      Creating new episode in database")
                                    episode = VideoTVEpisode(
                                        season_id=season.id,
                                        episode_number=episode_info["episode_number"],
                                        title=episode_info.get("title", f"Episode {episode_info['episode_number']}"),
                                        file_path=str(episode_file),
                                        file_size=episode_file.stat().st_size,
                                        duration=episode_info.get("duration"),
                                        resolution=episode_info.get("resolution"),
                                        codec=episode_info.get("codec"),
                                        description=episode_info.get("description"),
                                        extra_metadata=episode_info.get("extra_metadata")
                                    )
                                    session.add(episode)
                                    logger.info(f"      Episode added to session: '{episode_info.get('title')}'")

                                
                                episode_count += 1
                                logger.info(f"      ✓ Episode processed")
                                
                                # Commit after each episode to avoid large batched queries
                                await session.commit()
                                logger.info(f"      ✓ Episode committed to database")
                            except Exception as e:
                                logger.error(f"      ✗ Error processing episode file {episode_file}: {e}", exc_info=True)
                                # Rollback this episode and continue with next
                                await session.rollback()
                
                except Exception as e:
                    logger.error(f"  ✗ Error processing TV show directory {show_dir}: {e}", exc_info=True)
                    await session.rollback()
            
            logger.info(f"✓ All TV data committed successfully ({show_count} shows, {season_count} seasons, {episode_count} episodes)")
            
            return {
                "shows": show_count,
                "seasons": season_count,
                "episodes": episode_count
            }
    
    def _extract_video_metadata(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """
        Extract metadata from video file using ffprobe.
        
        Args:
            file_path: Path to video file
            
        Returns:
            Dictionary with duration, resolution, codec, etc.
        """
        try:
            # Run ffprobe to get video metadata
            result = subprocess.run(
                [
                    'ffprobe',
                    '-v', 'quiet',
                    '-print_format', 'json',
                    '-show_format',
                    '-show_streams',
                    str(file_path)
                ],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                logger.warning(f"ffprobe failed for {file_path}: {result.stderr}")
                return None
            
            data = json.loads(result.stdout)
            metadata = {}
            
            # Get format information
            if 'format' in data:
                fmt = data['format']
                # Duration in seconds
                if 'duration' in fmt:
                    try:
                        metadata['duration'] = int(float(fmt['duration']))
                    except (ValueError, TypeError):
                        pass
            
            # Get video stream information
            video_stream = next(
                (s for s in data.get('streams', []) if s.get('codec_type') == 'video'),
                None
            )
            
            if video_stream:
                # Codec
                if 'codec_name' in video_stream:
                    metadata['codec'] = video_stream['codec_name']
                
                # Resolution
                width = video_stream.get('width')
                height = video_stream.get('height')
                if width and height:
                    # Determine resolution label
                    if height >= 2160:
                        metadata['resolution'] = '4K'
                    elif height >= 1080:
                        metadata['resolution'] = '1080p'
                    elif height >= 720:
                        metadata['resolution'] = '720p'
                    elif height >= 480:
                        metadata['resolution'] = '480p'
                    else:
                        metadata['resolution'] = f'{width}x{height}'
            
            return metadata if metadata else None
            
        except subprocess.TimeoutExpired:
            logger.error(f"ffprobe timeout for {file_path}")
            return None
        except Exception as e:
            logger.error(f"Error extracting metadata from {file_path}: {e}")
            return None
    
    def _parse_movie_filename(self, filename: str) -> Dict[str, Any]:
        """
        Parse movie information from filename.
        
        Examples:
            "The Matrix (1999) 1080p.mkv" -> {"title": "The Matrix", "year": 1999, "resolution": "1080p"}
            "Inception.2010.4K.mp4" -> {"title": "Inception", "year": 2010, "resolution": "4K"}
        """
        # Remove extension
        name = Path(filename).stem
        
        info = {}
        
        # Try to extract year (4 digits in parentheses or standalone)
        year_match = re.search(r'\((\d{4})\)|\.(\d{4})\.|\s(\d{4})\s', name)
        if year_match:
            year_str = year_match.group(1) or year_match.group(2) or year_match.group(3)
            info["year"] = int(year_str)
            # Remove year from name
            name = name[:year_match.start()] + name[year_match.end():]
        
        # Try to extract resolution
        resolution_match = re.search(r'(1080p|720p|480p|4K|2160p)', name, re.IGNORECASE)
        if resolution_match:
            info["resolution"] = resolution_match.group(1)
            # Remove resolution from name
            name = name[:resolution_match.start()] + name[resolution_match.end():]
        
        # Clean up the title
        name = name.replace('.', ' ').replace('_', ' ')
        name = re.sub(r'\s+', ' ', name).strip()
        info["title"] = name if name else filename
        
        return info
    
    def _parse_season_number(self, dirname: str) -> Optional[int]:
        """
        Parse season number from directory name.
        
        Examples:
            "Season 1" -> 1
            "Season 01" -> 1
            "1" -> 1
            "01" -> 1
        """
        # Try various patterns
        patterns = [
            r'[Ss]eason\s*(\d+)',
            r'^(\d+)$'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, dirname)
            if match:
                return int(match.group(1))
        
        return None
    
    def _parse_episode_filename(self, filename: str) -> Dict[str, Any]:
        """
        Parse episode information from filename.
        
        Examples:
            "S01E01 - Pilot.mkv" -> {"episode_number": 1, "title": "Pilot"}
            "Breaking Bad S01E01 Pilot.mp4" -> {"episode_number": 1, "title": "Pilot"}
            "1x01 - Pilot.mkv" -> {"episode_number": 1, "title": "Pilot"}
        """
        name = Path(filename).stem
        
        info = {}
        
        # Try to extract S##E## or #x## pattern
        episode_match = re.search(r'[Ss](\d+)[Ee](\d+)|(\d+)[xX](\d+)', name)
        if episode_match:
            if episode_match.group(2):  # S##E## format
                info["episode_number"] = int(episode_match.group(2))
            elif episode_match.group(4):  # #x## format
                info["episode_number"] = int(episode_match.group(4))
            
            # Try to extract title (everything after the episode number)
            title_part = name[episode_match.end():].strip()
            # Remove leading dashes, dots, or spaces
            title_part = re.sub(r'^[\s\-\.]+', '', title_part)
            if title_part:
                # Clean up title
                title_part = title_part.replace('.', ' ').replace('_', ' ')
                title_part = re.sub(r'\s+', ' ', title_part).strip()
                info["title"] = title_part
        else:
            # Fallback: try to find any episode number
            ep_match = re.search(r'[Ee]pisode\s*(\d+)|[Ee]p\.?\s*(\d+)', name)
            if ep_match:
                info["episode_number"] = int(ep_match.group(1) or ep_match.group(2))
        
        # Try to extract resolution
        resolution_match = re.search(r'(1080p|720p|480p|4K|2160p)', name, re.IGNORECASE)
        if resolution_match:
            info["resolution"] = resolution_match.group(1)
        
        # If no episode number found, use filename as fallback
        if "episode_number" not in info:
            info["episode_number"] = 0
            info["title"] = name
        
        return info


async def clear_video_library():
    """Clear all video library data from the database."""
    async with AsyncSessionLocal() as session:
        try:
            # Delete in correct order due to foreign key constraints
            await session.execute(sql_delete(VideoTVEpisode))
            await session.execute(sql_delete(VideoTVSeason))
            await session.execute(sql_delete(VideoTVShow))
            await session.execute(sql_delete(VideoMovie))
            await session.commit()
            logger.info("Cleared all video library data")
            return True
        except Exception as e:
            logger.error(f"Error clearing video library: {e}", exc_info=True)
            await session.rollback()
            return False
