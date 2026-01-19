"""Script to clean up duplicate movie entries in the database."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.base import AsyncSessionLocal
from database.models import VideoMovie
from sqlalchemy import select, delete
from collections import defaultdict

async def cleanup_duplicates():
    """Find and remove duplicate movies based on normalized file paths."""
    async with AsyncSessionLocal() as session:
        # Get all movies
        result = await session.execute(select(VideoMovie))
        all_movies = result.scalars().all()
        
        print(f"Found {len(all_movies)} total movies in database")
        
        # Group by normalized path
        path_groups = defaultdict(list)
        
        for movie in all_movies:
            try:
                normalized = str(Path(movie.file_path).resolve())
                path_groups[normalized].append(movie)
            except (OSError, ValueError) as e:
                # Can't resolve path - might be invalid, keep it for now
                print(f"⚠️  Could not resolve path '{movie.file_path}': {e}")
                # Use the original path as the key
                path_groups[movie.file_path].append(movie)
        
        print(f"Found {len(path_groups)} unique normalized paths")
        
        # Find duplicates
        duplicates_to_delete = []
        paths_to_update = []
        
        for normalized_path, movies in path_groups.items():
            if len(movies) > 1:
                # Keep the one with the lowest ID, delete the rest
                movies.sort(key=lambda m: m.id)
                keep = movies[0]
                delete_list = movies[1:]
                
                print(f"\n🔍 Duplicate found for: {normalized_path}")
                print(f"   Keeping ID {keep.id}: {keep.title} (path: {keep.file_path})")
                
                for dup in delete_list:
                    duplicates_to_delete.append(dup.id)
                    print(f"   Deleting ID {dup.id}: {dup.title} (path: {dup.file_path})")
                
                # Update kept movie to use normalized path if different
                if keep.file_path != normalized_path:
                    paths_to_update.append((keep.id, normalized_path))
                    print(f"   Updating path: '{keep.file_path}' → '{normalized_path}'")
        
        if not duplicates_to_delete and not paths_to_update:
            print("\n✅ No duplicates found!")
            return
        
        print(f"\n📊 Summary:")
        print(f"   Duplicates to delete: {len(duplicates_to_delete)}")
        print(f"   Paths to normalize: {len(paths_to_update)}")
        
        # Confirm before proceeding
        response = input("\n❓ Proceed with cleanup? (yes/no): ")
        if response.lower() != 'yes':
            print("❌ Cleanup cancelled")
            return
        
        # Delete duplicates
        if duplicates_to_delete:
            await session.execute(
                delete(VideoMovie).where(VideoMovie.id.in_(duplicates_to_delete))
            )
            print(f"✅ Deleted {len(duplicates_to_delete)} duplicate movies")
        
        # Update paths to normalized versions
        if paths_to_update:
            for movie_id, normalized_path in paths_to_update:
                result = await session.execute(
                    select(VideoMovie).where(VideoMovie.id == movie_id)
                )
                movie = result.scalar_one_or_none()
                if movie:
                    old_path = movie.file_path
                    movie.file_path = normalized_path
                    print(f"   Updated ID {movie_id}: '{old_path}' → '{normalized_path}'")
        
        await session.commit()
        print("\n✅ Cleanup complete!")

if __name__ == "__main__":
    asyncio.run(cleanup_duplicates())
