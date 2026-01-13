#!/usr/bin/env python3
"""Add sample video playback progress for testing recently played feature."""
import asyncio
from datetime import datetime, timedelta
from database.base import AsyncSessionLocal
from database.models import VideoPlaybackProgress, VideoMovie, VideoTVEpisode
from sqlalchemy import select

async def add_sample_progress():
    """Add sample playback progress entries."""
    async with AsyncSessionLocal() as session:
        # Get some movies
        movie_result = await session.execute(
            select(VideoMovie).limit(3)
        )
        movies = movie_result.scalars().all()
        
        # Get some episodes
        episode_result = await session.execute(
            select(VideoTVEpisode).limit(2)
        )
        episodes = episode_result.scalars().all()
        
        if not movies and not episodes:
            print("❌ No movies or episodes found in library. Please scan your video directory first.")
            return
        
        print(f"📹 Found {len(movies)} movies and {len(episodes)} episodes")
        print("🔄 Adding sample playback progress...\n")
        
        # Add progress for movies
        for idx, movie in enumerate(movies):
            # Simulate watching at different times
            last_played = datetime.now() - timedelta(hours=idx * 2)
            # Simulate different progress (30%, 60%, 90%)
            position = (movie.duration or 6000) * (0.3 + (idx * 0.3))
            
            progress = VideoPlaybackProgress(
                video_type='movie',
                video_id=movie.id,
                position=position,
                duration=movie.duration or 6000,
                last_played=last_played,
                completed=False
            )
            session.add(progress)
            print(f"✅ Added progress for movie: {movie.title}")
            print(f"   Position: {int(position)}s / {movie.duration or 6000}s")
            print(f"   Last played: {last_played}")
            print()
        
        # Add progress for episodes
        for idx, episode in enumerate(episodes):
            last_played = datetime.now() - timedelta(hours=(len(movies) + idx) * 2)
            position = (episode.duration or 2400) * 0.5
            
            progress = VideoPlaybackProgress(
                video_type='episode',
                video_id=episode.id,
                position=position,
                duration=episode.duration or 2400,
                last_played=last_played,
                completed=False
            )
            session.add(progress)
            print(f"✅ Added progress for episode ID: {episode.id}")
            print(f"   Position: {int(position)}s / {episode.duration or 2400}s")
            print(f"   Last played: {last_played}")
            print()
        
        await session.commit()
        
        total = len(movies) + len(episodes)
        print(f"\n🎉 Added {total} sample progress entries!")
        print("   Refresh the Videos page to see the Recently Played list.")

if __name__ == "__main__":
    asyncio.run(add_sample_progress())
