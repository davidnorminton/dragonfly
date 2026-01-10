#!/usr/bin/env python3
"""
Test script to verify video streaming endpoint works correctly.
Run this while your server is running to test the streaming functionality.
"""
import asyncio
import httpx
from database.base import AsyncSessionLocal
from database.models import VideoMovie
from sqlalchemy import select


async def test_video_streaming():
    """Test the video streaming endpoint."""
    print("🎬 Testing Video Streaming Endpoint\n")
    print("="*60)
    
    # Get a movie from database
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(VideoMovie).limit(1))
        movie = result.scalar_one_or_none()
        
        if not movie:
            print("❌ No movies found in database")
            print("   Please run a video scan first in Settings → Videos")
            return
        
        print(f"📽️  Test Movie: {movie.title}")
        print(f"   ID: {movie.id}")
        print(f"   Path: {movie.file_path}")
        print()
    
    base_url = "http://localhost:8000"
    stream_url = f"{base_url}/api/video/stream/{movie.id}"
    
    print(f"🔗 Testing URL: {stream_url}\n")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1: Initial request (should return 200 or 206)
        print("Test 1: Initial request without range...")
        try:
            response = await client.get(stream_url, follow_redirects=True)
            print(f"   Status: {response.status_code}")
            print(f"   Content-Type: {response.headers.get('content-type', 'N/A')}")
            print(f"   Accept-Ranges: {response.headers.get('accept-ranges', 'N/A')}")
            print(f"   Content-Length: {response.headers.get('content-length', 'N/A')}")
            
            if response.status_code == 200:
                print("   ✅ Initial request successful")
            else:
                print(f"   ❌ Unexpected status code: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return
        except Exception as e:
            print(f"   ❌ Error: {e}")
            print("\n⚠️  Is your server running? Start it with: python main.py")
            return
        
        print()
        
        # Test 2: Range request (simulating video player seeking)
        print("Test 2: Range request (bytes=0-1023)...")
        try:
            headers = {"Range": "bytes=0-1023"}
            response = await client.get(stream_url, headers=headers, follow_redirects=True)
            print(f"   Status: {response.status_code}")
            print(f"   Content-Range: {response.headers.get('content-range', 'N/A')}")
            print(f"   Content-Length: {response.headers.get('content-length', 'N/A')}")
            print(f"   Bytes received: {len(response.content)}")
            
            if response.status_code == 206:
                print("   ✅ Range request successful (206 Partial Content)")
            else:
                print(f"   ⚠️  Expected 206, got {response.status_code}")
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return
        
        print()
        
        # Test 3: Range request in middle of file
        print("Test 3: Range request (bytes=1000000-1001023)...")
        try:
            headers = {"Range": "bytes=1000000-1001023"}
            response = await client.get(stream_url, headers=headers, follow_redirects=True)
            print(f"   Status: {response.status_code}")
            print(f"   Content-Range: {response.headers.get('content-range', 'N/A')}")
            print(f"   Bytes received: {len(response.content)}")
            
            if response.status_code == 206:
                print("   ✅ Mid-file range request successful")
            else:
                print(f"   ⚠️  Expected 206, got {response.status_code}")
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return
    
    print()
    print("="*60)
    print("✅ All streaming tests passed!")
    print()
    print("Next steps:")
    print("  1. Open your browser to http://localhost:8000")
    print("  2. Go to Videos page")
    print("  3. Click 'Play' on a movie")
    print("  4. Check browser console (F12) for any errors")


if __name__ == "__main__":
    asyncio.run(test_video_streaming())
