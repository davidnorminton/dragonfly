"""Video file converter service for converting MKV/AVI to MP4."""
import logging
import subprocess
import asyncio
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import multiprocessing

logger = logging.getLogger(__name__)

# Source formats to convert
SOURCE_FORMATS = {'.mkv', '.avi'}
TARGET_FORMAT = '.mp4'

# Number of concurrent conversions (use CPU count - 1 to leave one core free)
MAX_CONCURRENT_CONVERSIONS = max(1, multiprocessing.cpu_count() - 1)


class VideoConverter:
    """Service for converting video files to MP4 format with parallel processing."""
    
    def __init__(self, video_directory: str, max_concurrent: Optional[int] = None):
        """
        Initialize converter with video directory path.
        
        Args:
            video_directory: Path to video directory
            max_concurrent: Maximum concurrent conversions (defaults to CPU count - 1)
        """
        self.video_directory = Path(video_directory)
        self.movies_dir = self.video_directory / "Movies"
        self.tv_dir = self.video_directory / "Tv"
        
        # Set concurrency limit
        self.max_concurrent = max_concurrent or MAX_CONCURRENT_CONVERSIONS
        
        # Track conversion progress (thread-safe with asyncio)
        self.total_files = 0
        self.converted_files = 0
        self.failed_files = 0
        self.current_files = set()  # Currently processing files
        self.errors = []
        # Lock will be created lazily in async context when needed
        self._lock = None
        
    async def convert_all(self) -> Dict[str, Any]:
        """
        Convert all MKV/AVI files in the video library to MP4.
        
        Returns:
            Dictionary with conversion results and statistics.
        """
        logger.info("="*80)
        logger.info("🎬 STARTING VIDEO CONVERSION (PARALLEL MODE)")
        logger.info(f"   Max Concurrent: {self.max_concurrent} conversions")
        logger.info("="*80)
        
        results = {
            "success": True,
            "total_files": 0,
            "converted": 0,
            "failed": 0,
            "skipped": 0,
            "errors": []
        }
        
        # Scan for files to convert
        files_to_convert = []
        
        if self.movies_dir.exists():
            logger.info(f"\n📁 Scanning Movies directory...")
            movie_files = self._scan_directory(self.movies_dir)
            files_to_convert.extend(movie_files)
            logger.info(f"   Found {len(movie_files)} files to convert")
        
        if self.tv_dir.exists():
            logger.info(f"\n📁 Scanning TV directory...")
            tv_files = self._scan_directory(self.tv_dir, recursive=True)
            files_to_convert.extend(tv_files)
            logger.info(f"   Found {len(tv_files)} files to convert")
        
        results["total_files"] = len(files_to_convert)
        self.total_files = len(files_to_convert)
        
        if not files_to_convert:
            logger.info("\n✓ No files need conversion")
            return results
        
        logger.info(f"\n🔄 Converting {len(files_to_convert)} files in batches of {self.max_concurrent}...")
        logger.info("="*80)
        
        # Create semaphore to limit concurrent conversions
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        # Create lock if not exists (lazy initialization in async context)
        if self._lock is None:
            self._lock = asyncio.Lock()
        
        # Convert files concurrently with semaphore
        async def convert_with_semaphore(file_path: Path, index: int):
            async with semaphore:
                try:
                    async with self._lock:
                        self.current_files.add(file_path.name)
                    
                    logger.info(f"\n[{index}/{len(files_to_convert)}] 🔄 Starting: {file_path.name}")
                    success = await self._convert_file(file_path, index, len(files_to_convert))
                    
                    async with self._lock:
                        self.current_files.discard(file_path.name)
                        if success:
                            self.converted_files += 1
                        else:
                            self.failed_files += 1
                    
                    return success
                    
                except Exception as e:
                    error_msg = f"Error converting {file_path.name}: {str(e)}"
                    logger.error(f"  ❌ {error_msg}")
                    
                    async with self._lock:
                        self.current_files.discard(file_path.name)
                        self.errors.append(error_msg)
                        self.failed_files += 1
                    
                    return False
        
        # Run all conversions concurrently
        conversion_tasks = [
            convert_with_semaphore(file_path, idx)
            for idx, file_path in enumerate(files_to_convert, 1)
        ]
        
        conversion_results = await asyncio.gather(*conversion_tasks, return_exceptions=True)
        
        # Count results
        for result in conversion_results:
            if isinstance(result, Exception):
                results["failed"] += 1
                results["errors"].append(str(result))
            elif result:
                results["converted"] += 1
            else:
                results["failed"] += 1
        
        logger.info("\n" + "="*80)
        logger.info(f"✓ CONVERSION COMPLETE")
        logger.info(f"  Total: {results['total_files']}")
        logger.info(f"  Converted: {results['converted']}")
        logger.info(f"  Failed: {results['failed']}")
        logger.info(f"  Speed: {self.max_concurrent} concurrent conversions")
        logger.info("="*80)
        
        self.current_files.clear()
        return results
    
    def _scan_directory(self, directory: Path, recursive: bool = False) -> List[Path]:
        """Scan directory for files that need conversion."""
        files = []
        
        if recursive:
            # Recursively scan subdirectories for TV shows
            for item in directory.rglob('*'):
                if item.is_file() and item.suffix.lower() in SOURCE_FORMATS:
                    files.append(item)
        else:
            # Only scan top level for movies
            for item in directory.iterdir():
                if item.is_file() and item.suffix.lower() in SOURCE_FORMATS:
                    files.append(item)
        
        return files
    
    async def _convert_file(self, source_path: Path, index: int = 0, total: int = 0) -> bool:
        """
        Convert a single video file to MP4 (optimized for speed).
        
        Args:
            source_path: Path to source video file
            index: Current file index (for logging)
            total: Total files (for logging)
            
        Returns:
            True if conversion successful, False otherwise
        """
        # Generate output path
        output_path = source_path.with_suffix(TARGET_FORMAT)
        
        # Skip if output already exists
        if output_path.exists():
            logger.info(f"  [{index}/{total}] ⚠️  {source_path.name}: MP4 already exists, skipping")
            return True
        
        logger.info(f"  [{index}/{total}] 🔄 Converting: {source_path.name}")
        
        # Build ffmpeg command (optimized for speed)
        # -i: input file
        # -c:v copy: copy video stream (FAST - no re-encoding!)
        # -c:a aac: convert audio to AAC (MP4 compatible)
        # -b:a 192k: audio bitrate
        # -movflags +faststart: optimize for streaming
        # -threads 0: use all available threads
        # -preset ultrafast: fastest encoding (for audio)
        # -loglevel error: suppress verbose output
        # -stats: show progress stats
        # -y: overwrite output file if exists
        cmd = [
            'ffmpeg',
            '-i', str(source_path),
            '-c:v', 'copy',  # Copy video (FAST, no quality loss)
            '-c:a', 'aac',   # Convert audio to AAC
            '-b:a', '192k',  # Audio bitrate
            '-movflags', '+faststart',  # Optimize for web playback
            '-threads', '0',  # Use all available threads
            '-preset', 'ultrafast',  # Fastest encoding preset
            '-loglevel', 'error',  # Only show errors
            '-stats',  # Show progress
            '-y',  # Overwrite if exists
            str(output_path)
        ]
        
        try:
            # Run conversion
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                # Verify output file was created
                if output_path.exists() and output_path.stat().st_size > 0:
                    # Get file sizes
                    original_size = source_path.stat().st_size / (1024 * 1024)  # MB
                    new_size = output_path.stat().st_size / (1024 * 1024)  # MB
                    size_diff = ((new_size - original_size) / original_size * 100) if original_size > 0 else 0
                    
                    logger.info(f"  [{index}/{total}] ✅ {source_path.name}: {original_size:.1f}MB → {new_size:.1f}MB ({size_diff:+.1f}%)")
                    
                    # Delete original file
                    source_path.unlink()
                    logger.info(f"  [{index}/{total}] 🗑️  Deleted original: {source_path.name}")
                    
                    return True
                else:
                    logger.error(f"  [{index}/{total}] ❌ {source_path.name}: Output file not created or empty")
                    return False
            else:
                error_output = stderr.decode('utf-8', errors='ignore')
                logger.error(f"  [{index}/{total}] ❌ {source_path.name}: Conversion failed - {error_output[:200]}")
                
                # Clean up failed output file
                if output_path.exists():
                    output_path.unlink()
                
                return False
                
        except Exception as e:
            logger.error(f"  [{index}/{total}] ❌ {source_path.name}: Conversion error - {e}")
            
            # Clean up failed output file
            if output_path.exists():
                output_path.unlink()
            
            return False
    
    def get_progress(self) -> Dict[str, Any]:
        """Get current conversion progress."""
        return {
            "total": self.total_files,
            "converted": self.converted_files,
            "failed": self.failed_files,
            "current_files": list(self.current_files),  # List of files currently being converted
            "concurrent": len(self.current_files),  # Number of concurrent conversions
            "percentage": int((self.converted_files + self.failed_files) / self.total_files * 100) if self.total_files > 0 else 0,
            "max_concurrent": self.max_concurrent
        }
    
    def scan_for_conversion(self) -> Dict[str, Any]:
        """
        Scan video directories and return list of files that need conversion.
        
        Returns:
            Dictionary with scan results including files to convert and delete.
        """
        logger.info("🔍 Scanning for videos to convert...")
        
        files_to_convert = []
        files_to_delete = []
        
        # Scan Movies directory
        if self.movies_dir.exists():
            logger.info(f"  📁 Scanning: {self.movies_dir}")
            movie_files = self._scan_directory(self.movies_dir)
            files_to_convert.extend(movie_files)
        
        # Scan TV directory
        if self.tv_dir.exists():
            logger.info(f"  📁 Scanning: {self.tv_dir}")
            tv_files = self._scan_directory(self.tv_dir, recursive=True)
            files_to_convert.extend(tv_files)
        
        # Build file lists for frontend
        convert_list = []
        delete_list = []
        total_source_size = 0
        
        for file_path in files_to_convert:
            file_info = {
                "name": file_path.name,
                "path": str(file_path),
                "format": file_path.suffix.upper(),
                "size": file_path.stat().st_size,
                "size_mb": round(file_path.stat().st_size / (1024 * 1024), 2)
            }
            convert_list.append(file_info)
            total_source_size += file_path.stat().st_size
            
            # This file will be deleted after conversion
            delete_list.append({
                "name": file_path.name,
                "path": str(file_path),
                "format": file_path.suffix.upper(),
                "size_mb": file_info["size_mb"]
            })
        
        logger.info(f"  ✓ Found {len(convert_list)} files to convert")
        logger.info(f"  ✓ Total size: {total_source_size / (1024**3):.2f} GB")
        
        return {
            "success": True,
            "files_to_convert": convert_list,
            "files_to_delete": delete_list,
            "summary": {
                "total_to_convert": len(convert_list),
                "total_to_delete": len(delete_list),
                "space_to_free": f"{total_source_size / (1024**3):.2f} GB"
            }
        }
    
    async def convert_all_streaming(self):
        """
        Convert all videos with real-time progress updates (async generator).
        Yields progress events for streaming to frontend.
        """
        # Scan for files
        files_to_convert = []
        
        if self.movies_dir.exists():
            movie_files = self._scan_directory(self.movies_dir)
            files_to_convert.extend(movie_files)
        
        if self.tv_dir.exists():
            tv_files = self._scan_directory(self.tv_dir, recursive=True)
            files_to_convert.extend(tv_files)
        
        total_files = len(files_to_convert)
        self.total_files = total_files
        self.converted_files = 0
        self.failed_files = 0
        
        # Start event
        yield {
            "type": "start",
            "total_files": total_files
        }
        
        if total_files == 0:
            yield {
                "type": "complete",
                "converted": 0,
                "deleted": 0,
                "errors": 0
            }
            return
        
        # Convert files sequentially for progress tracking
        converted_count = 0
        deleted_count = 0
        error_count = 0
        
        for idx, file_path in enumerate(files_to_convert, 1):
            # Converting event
            yield {
                "type": "converting",
                "file": file_path.name,
                "current": idx,
                "total": total_files
            }
            
            try:
                output_path = file_path.with_suffix(TARGET_FORMAT)
                
                # Skip if already exists
                if output_path.exists():
                    logger.info(f"  [{idx}/{total_files}] ⚠️  {file_path.name}: MP4 already exists, skipping")
                    yield {
                        "type": "converted",
                        "file": file_path.name
                    }
                    converted_count += 1
                    continue
                
                # Run conversion
                cmd = [
                    'ffmpeg',
                    '-i', str(file_path),
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-movflags', '+faststart',
                    '-threads', '0',
                    '-preset', 'ultrafast',
                    '-loglevel', 'error',
                    '-stats',
                    '-y',
                    str(output_path)
                ]
                
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                stdout, stderr = await process.communicate()
                
                if process.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                    # Success
                    yield {
                        "type": "converted",
                        "file": file_path.name
                    }
                    converted_count += 1
                    
                    # Delete original
                    file_path.unlink()
                    yield {
                        "type": "deleted",
                        "file": file_path.name,
                        "reason": "Original file after conversion",
                        "count": deleted_count + 1
                    }
                    deleted_count += 1
                else:
                    # Failed
                    error_msg = stderr.decode('utf-8', errors='ignore')[:200] if stderr else "Unknown error"
                    yield {
                        "type": "error",
                        "file": file_path.name,
                        "error": error_msg
                    }
                    error_count += 1
                    
                    # Clean up failed output
                    if output_path.exists():
                        output_path.unlink()
            
            except Exception as e:
                yield {
                    "type": "error",
                    "file": file_path.name,
                    "error": str(e)
                }
                error_count += 1
        
        # Complete event
        yield {
            "type": "complete",
            "converted": converted_count,
            "deleted": deleted_count,
            "errors": error_count
        }