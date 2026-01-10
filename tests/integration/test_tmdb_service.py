"""Integration tests for TMDB API service."""
import pytest
from services.tmdb_service import TMDBService


@pytest.mark.asyncio
class TestTMDBService:
    """Test TMDB API integration."""
    
    def test_search_movie_with_valid_key(self):
        """Test searching for a movie with a valid API key."""
        # Use the user's API key
        api_key = "caa2360ec72462ade320d249304deb58"
        tmdb = TMDBService(api_key)
        
        # Search for a well-known movie
        result = tmdb.search_movie("The Matrix", 1999)
        
        assert result is not None, "Movie search should return results"
        assert result["title"] == "The Matrix"
        assert result["year"] == 1999
        assert result["tmdb_id"] is not None
        assert result["description"] is not None
        assert result["poster_path"] is not None
        print(f"✓ Movie search successful: {result['title']} ({result['year']})")
        print(f"  TMDB ID: {result['tmdb_id']}")
        print(f"  Poster: {result['poster_path']}")
        print(f"  Description: {result['description'][:100]}...")
    
    def test_search_tv_show_with_valid_key(self):
        """Test searching for a TV show with a valid API key."""
        api_key = "caa2360ec72462ade320d249304deb58"
        tmdb = TMDBService(api_key)
        
        # Search for a well-known TV show
        result = tmdb.search_tv_show("Breaking Bad")
        
        assert result is not None, "TV show search should return results"
        assert "Breaking Bad" in result["title"]
        assert result["tmdb_id"] is not None
        assert result["description"] is not None
        assert result["poster_path"] is not None
        assert result["number_of_seasons"] is not None
        print(f"✓ TV show search successful: {result['title']}")
        print(f"  TMDB ID: {result['tmdb_id']}")
        print(f"  Seasons: {result['number_of_seasons']}")
        print(f"  Poster: {result['poster_path']}")
    
    def test_get_tv_season_details(self):
        """Test getting TV season details."""
        api_key = "caa2360ec72462ade320d249304deb58"
        tmdb = TMDBService(api_key)
        
        # Get Breaking Bad first
        show = tmdb.search_tv_show("Breaking Bad")
        assert show is not None
        
        # Get season 1 details
        season = tmdb.get_tv_season_details(show["tmdb_id"], 1)
        
        assert season is not None, "Season details should be returned"
        assert season["season_number"] == 1
        assert len(season["episodes"]) > 0
        print(f"✓ Season details successful: Season {season['season_number']}")
        print(f"  Episodes: {len(season['episodes'])}")
        print(f"  Episode 1: {season['episodes'][0]['name']}")
    
    def test_search_movie_not_found(self):
        """Test searching for a non-existent movie."""
        api_key = "caa2360ec72462ade320d249304deb58"
        tmdb = TMDBService(api_key)
        
        # Search for a movie that doesn't exist
        result = tmdb.search_movie("ThisMovieDoesNotExist12345xyz", 2099)
        
        assert result is None, "Non-existent movie should return None"
        print("✓ Correctly handled non-existent movie")
    
    def test_invalid_api_key(self):
        """Test with an invalid API key."""
        tmdb = TMDBService("invalid_key_12345")
        
        # Should handle gracefully and return None
        result = tmdb.search_movie("The Matrix", 1999)
        
        assert result is None, "Invalid API key should return None"
        print("✓ Correctly handled invalid API key")
    
    def test_no_api_key(self):
        """Test with no API key."""
        tmdb = TMDBService(None)
        
        # Should handle gracefully and return None
        result = tmdb.search_movie("The Matrix", 1999)
        
        assert result is None, "No API key should return None"
        print("✓ Correctly handled missing API key")
    
    def test_search_movie_without_year(self):
        """Test searching for a movie without specifying year."""
        api_key = "caa2360ec72462ade320d249304deb58"
        tmdb = TMDBService(api_key)
        
        # Search without year - should still work
        result = tmdb.search_movie("Inception")
        
        assert result is not None, "Movie search without year should work"
        assert "Inception" in result["title"]
        print(f"✓ Movie search without year successful: {result['title']} ({result['year']})")


if __name__ == "__main__":
    """Run tests directly for quick testing."""
    import sys
    
    print("\n" + "="*60)
    print("TMDB API Integration Tests")
    print("="*60 + "\n")
    
    test = TestTMDBService()
    
    tests = [
        ("Movie Search", test.test_search_movie_with_valid_key),
        ("TV Show Search", test.test_search_tv_show_with_valid_key),
        ("TV Season Details", test.test_get_tv_season_details),
        ("Movie Not Found", test.test_search_movie_not_found),
        ("Invalid API Key", test.test_invalid_api_key),
        ("No API Key", test.test_no_api_key),
        ("Movie Search (No Year)", test.test_search_movie_without_year),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            print(f"\nTest: {name}")
            print("-" * 60)
            test_func()
            passed += 1
        except AssertionError as e:
            print(f"✗ FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ ERROR: {e}")
            failed += 1
    
    print("\n" + "="*60)
    print(f"Results: {passed} passed, {failed} failed")
    print("="*60 + "\n")
    
    sys.exit(0 if failed == 0 else 1)
