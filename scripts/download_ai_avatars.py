#!/usr/bin/env python3
"""Download AI avatars from DiceBear API and save them locally."""
import asyncio
import aiohttp
from pathlib import Path
import sys

# Generate avatar URLs
def generate_avatar_url(seed):
    seeds = [
        'cortana-alpha',
        'ai-assistant-beta',
        'hologram-gamma',
        'neural-delta',
        'quantum-epsilon',
        'synth-zeta',
        'cyber-eta',
        'digital-theta',
        'nexus-iota',
        'matrix-kappa',
        'cyber-lambda',
        'quantum-mu',
        'neural-nu',
        'hologram-xi',
        'synth-omicron',
        'digital-pi',
        'ai-rho',
        'cortana-sigma',
        'nexus-tau',
        'matrix-upsilon',
        'cyber-phi',
        'quantum-chi',
        'neural-psi',
        'hologram-omega',
        'synth-alpha2',
        'digital-beta2',
        'ai-gamma2',
        'cortana-delta2',
        'nexus-epsilon2',
        'matrix-zeta2'
    ]
    
    colors = [
        '4a90e2', '7b68ee', '00d4ff', '9370db', '4169e1',
        '00ced1', '6a5acd', '1e90ff', '5b9bd5', '8b7ec8',
        '00bfff', '9370db', '4169e1', '00ced1', '6a5acd',
        '1e90ff', '5b9bd5', '8b7ec8', '4a90e2', '7b68ee',
        '00d4ff', '9370db', '4169e1', '00ced1', '6a5acd',
        '1e90ff', '5b9bd5', '8b7ec8', '4a90e2', '7b68ee'
    ]
    
    return f"https://api.dicebear.com/7.x/bottts/svg?seed={seeds[seed]}&backgroundColor={colors[seed]}"

async def download_avatar(session, url, filepath):
    """Download a single avatar."""
    try:
        async with session.get(url) as response:
            if response.status == 200:
                content = await response.read()
                filepath.write_bytes(content)
                print(f"✓ Downloaded: {filepath.name}")
                return True
            else:
                print(f"✗ Failed to download {url}: {response.status}")
                return False
    except Exception as e:
        print(f"✗ Error downloading {url}: {e}")
        return False

async def download_all_avatars():
    """Download all 30 avatars."""
    project_root = Path(__file__).parent.parent
    avatars_dir = project_root / "data" / "user_profiles" / "avatars"
    avatars_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Downloading avatars to: {avatars_dir}")
    print(f"Generating 30 AI avatars...\n")
    
    async with aiohttp.ClientSession() as session:
        tasks = []
        for i in range(30):
            url = generate_avatar_url(i)
            filename = f"ai-avatar-{i:02d}.svg"
            filepath = avatars_dir / filename
            
            # Skip if already exists
            if filepath.exists():
                print(f"⊘ Skipped (exists): {filename}")
                continue
            
            tasks.append(download_avatar(session, url, filepath))
        
        results = await asyncio.gather(*tasks)
        successful = sum(results)
        print(f"\n✓ Successfully downloaded {successful} avatars")
        print(f"  Location: {avatars_dir}")

if __name__ == "__main__":
    asyncio.run(download_all_avatars())
