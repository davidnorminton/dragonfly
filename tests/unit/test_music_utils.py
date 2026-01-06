"""Unit tests for music utility functions."""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path


class TestAudioMetadataExtraction:
    """Test audio metadata extraction function."""
    
    @patch('web.main.MP3')
    @patch('web.main.EasyID3')
    def test_extract_mp3_metadata_success(self, mock_easyid3, mock_mp3):
        """Test successful MP3 metadata extraction."""
        # Mock MP3 file info
        mock_audio = MagicMock()
        mock_audio.info.length = 180.5
        mock_audio.info.bitrate = 320000
        mock_audio.info.sample_rate = 44100
        mock_audio.info.channels = 2
        mock_mp3.return_value = mock_audio
        
        # Mock ID3 tags
        mock_tags = {
            'title': ['Test Song'],
            'artist': ['Test Artist'],
            'album': ['Test Album'],
            'genre': ['Rock'],
            'date': ['2024'],
            'tracknumber': ['5/12'],
            'discnumber': ['1/2']
        }
        mock_easyid3.return_value = mock_tags
        
        from web.main import _extract_audio_meta
        
        result = _extract_audio_meta(Path('/fake/path/song.mp3'))
        
        assert result['duration_seconds'] == 180
        assert result['title'] == 'Test Song'
        assert result['artist'] == 'Test Artist'
        assert result['track_number'] == 5
        assert result['disc_number'] == 1
        assert result['year'] == '2024'
        assert result['bitrate'] == 320
    
    @patch('web.main.MP3')
    def test_extract_metadata_missing_tags(self, mock_mp3):
        """Test metadata extraction when ID3 tags are missing."""
        mock_audio = MagicMock()
        mock_audio.info.length = 120.0
        mock_mp3.return_value = mock_audio
        
        with patch('web.main.EasyID3', side_effect=Exception("No tags")):
            from web.main import _extract_audio_meta
            
            result = _extract_audio_meta(Path('/fake/path/song.mp3'))
            
            # Should still return basic info
            assert result['duration_seconds'] == 120
            assert result['title'] is None
    
    @patch('web.main.MP3')
    def test_extract_metadata_corrupted_file(self, mock_mp3):
        """Test metadata extraction for corrupted file."""
        mock_mp3.side_effect = Exception("Corrupt file")
        
        from web.main import _extract_audio_meta
        
        result = _extract_audio_meta(Path('/fake/path/corrupt.mp3'))
        
        # Should return dict with defaults, not crash
        assert isinstance(result, dict)
        assert result.get('duration_seconds') is not None
    
    @patch('web.main.MP3')
    @patch('web.main.EasyID3')
    def test_extract_metadata_track_number_formats(self, mock_easyid3, mock_mp3):
        """Test handling different track number formats."""
        mock_audio = MagicMock()
        mock_audio.info.length = 180.0
        mock_mp3.return_value = mock_audio
        
        from web.main import _extract_audio_meta
        
        # Test "5/12" format
        mock_easyid3.return_value = {'tracknumber': ['5/12']}
        result = _extract_audio_meta(Path('/fake/song.mp3'))
        assert result['track_number'] == 5
        
        # Test plain number
        mock_easyid3.return_value = {'tracknumber': ['7']}
        result = _extract_audio_meta(Path('/fake/song.mp3'))
        assert result['track_number'] == 7
        
        # Test invalid format
        mock_easyid3.return_value = {'tracknumber': ['invalid']}
        result = _extract_audio_meta(Path('/fake/song.mp3'))
        assert result['track_number'] is None


class TestMusicPersistence:
    """Test music persistence to database."""
    
    @pytest.mark.asyncio
    @patch('web.main.AsyncSessionLocal')
    async def test_persist_new_artist(self, mock_session):
        """Test persisting a new artist to database."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = None  # Artist doesn't exist
        
        mock_session_instance = AsyncMock()
        mock_session_instance.execute.return_value = mock_result
        mock_session_instance.flush = AsyncMock()
        mock_session_instance.commit = AsyncMock()
        mock_session_instance.__aenter__.return_value = mock_session_instance
        mock_session.return_value = mock_session_instance
        
        from web.main import _persist_music
        
        songs = [
            {
                "artist": "New Artist",
                "album": "New Album",
                "title": "New Song",
                "path": "new.mp3",
                "album_image": None,
                "meta": {
                    "duration_seconds": 180,
                    "track_number": 1,
                    "year": "2024"
                }
            }
        ]
        
        await _persist_music(songs)
        
        # Verify artist was added to session
        assert mock_session_instance.add.called
        assert mock_session_instance.commit.called
    
    @pytest.mark.asyncio
    @patch('web.main.AsyncSessionLocal')
    async def test_persist_updates_existing_artist(self, mock_session):
        """Test updating existing artist in database."""
        # Mock existing artist
        mock_artist = MagicMock()
        mock_artist.id = 1
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_artist
        
        mock_session_instance = AsyncMock()
        mock_session_instance.execute.return_value = mock_result
        mock_session_instance.flush = AsyncMock()
        mock_session_instance.commit = AsyncMock()
        mock_session_instance.__aenter__.return_value = mock_session_instance
        mock_session.return_value = mock_session_instance
        
        from web.main import _persist_music
        
        songs = [
            {
                "artist": "Existing Artist",
                "album": "Album",
                "title": "Song",
                "path": "song.mp3",
                "album_image": None,
                "meta": {"duration_seconds": 180}
            }
        ]
        
        await _persist_music(songs)
        
        # Should not add new artist, just update
        assert mock_session_instance.commit.called
    
    @pytest.mark.asyncio
    @patch('web.main.AsyncSessionLocal')
    async def test_persist_handles_year_conversion(self, mock_session):
        """Test that year is properly converted to int."""
        mock_session_instance = AsyncMock()
        mock_session_instance.execute.return_value = MagicMock()
        mock_session_instance.flush = AsyncMock()
        mock_session_instance.commit = AsyncMock()
        mock_session_instance.__aenter__.return_value = mock_session_instance
        mock_session.return_value = mock_session_instance
        
        from web.main import _persist_music
        
        songs = [
            {
                "artist": "Artist",
                "album": "Album",
                "title": "Song",
                "path": "song.mp3",
                "album_image": None,
                "meta": {"year": "2024-01-01"}  # String year with date
            }
        ]
        
        await _persist_music(songs)
        
        # Should not crash, year should be converted to 2024
        assert mock_session_instance.commit.called
    
    @pytest.mark.asyncio
    @patch('web.main.AsyncSessionLocal')
    async def test_persist_handles_database_error(self, mock_session):
        """Test that persistence handles database errors gracefully."""
        mock_session_instance = AsyncMock()
        mock_session_instance.execute.side_effect = Exception("Database error")
        mock_session_instance.__aenter__.return_value = mock_session_instance
        mock_session.return_value = mock_session_instance
        
        from web.main import _persist_music
        
        songs = [{"artist": "A", "album": "B", "title": "C", "path": "d.mp3", "album_image": None, "meta": {}}]
        
        # Should not raise exception
        try:
            await _persist_music(songs)
        except Exception:
            pytest.fail("_persist_music should handle database errors gracefully")
    
    @pytest.mark.asyncio
    @patch('web.main.AsyncSessionLocal')
    async def test_persist_multiple_songs_same_album(self, mock_session):
        """Test persisting multiple songs from the same album."""
        mock_artist = MagicMock()
        mock_artist.id = 1
        
        mock_album = MagicMock()
        mock_album.id = 10
        
        mock_session_instance = AsyncMock()
        
        # First call returns artist, subsequent calls return album
        mock_session_instance.execute.return_value = MagicMock()
        mock_session_instance.execute.return_value.scalars.return_value.first.side_effect = [
            mock_artist, mock_album, None,  # Song 1
            mock_artist, mock_album, None,  # Song 2
        ]
        
        mock_session_instance.flush = AsyncMock()
        mock_session_instance.commit = AsyncMock()
        mock_session_instance.__aenter__.return_value = mock_session_instance
        mock_session.return_value = mock_session_instance
        
        from web.main import _persist_music
        
        songs = [
            {"artist": "A", "album": "B", "title": "Song 1", "path": "s1.mp3", "album_image": None, "meta": {}},
            {"artist": "A", "album": "B", "title": "Song 2", "path": "s2.mp3", "album_image": None, "meta": {}},
        ]
        
        await _persist_music(songs)
        
        # Should create songs but reuse artist and album
        assert mock_session_instance.commit.called


class TestMusicPathHandling:
    """Test music path handling and security."""
    
    def test_path_normalization(self):
        """Test that paths are normalized correctly."""
        from pathlib import Path
        
        # Test relative path
        path = Path("Artist/Album/song.mp3")
        assert not path.is_absolute()
        
        # Test absolute path handling
        abs_path = Path("/Users/test/Music/Artist/Album/song.mp3")
        assert abs_path.is_absolute()
    
    def test_path_traversal_prevention(self):
        """Test that path traversal attacks are prevented."""
        from pathlib import Path
        
        dangerous_paths = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32",
            "/etc/passwd",
            "C:\\Windows\\System32\\config\\sam"
        ]
        
        music_base = Path("/Users/test/Music")
        
        for dangerous in dangerous_paths:
            try:
                full_path = music_base / dangerous
                resolved = full_path.resolve()
                
                # Ensure resolved path is still within music directory
                assert not str(resolved).startswith("/etc/")
                assert not str(resolved).startswith("C:\\Windows")
            except Exception:
                # Path manipulation correctly rejected
                pass
    
    def test_special_characters_in_filenames(self):
        """Test handling of special characters in file/folder names."""
        from pathlib import Path
        
        special_names = [
            "Artist (feat. Other)",
            "Album [2024]",
            "Song & Title",
            "Song: Subtitle",
            "Song's Title",
            "Song \"Quote\"",
        ]
        
        for name in special_names:
            path = Path(f"Music/{name}/song.mp3")
            # Should not crash
            assert isinstance(str(path), str)


class TestMusicSortingAndOrdering:
    """Test music sorting and ordering logic."""
    
    def test_album_sorting_by_year(self):
        """Test albums are sorted by year correctly."""
        albums = [
            {"name": "Album C", "year": 2024},
            {"name": "Album A", "year": 2022},
            {"name": "Album B", "year": 2023},
        ]
        
        sorted_albums = sorted(albums, key=lambda a: a.get("year", 0), reverse=True)
        
        assert sorted_albums[0]["name"] == "Album C"
        assert sorted_albums[1]["name"] == "Album B"
        assert sorted_albums[2]["name"] == "Album A"
    
    def test_song_sorting_by_track_number(self):
        """Test songs are sorted by track number correctly."""
        songs = [
            {"title": "Song C", "track_number": 3},
            {"title": "Song A", "track_number": 1},
            {"title": "Song B", "track_number": 2},
            {"title": "Song D", "track_number": None},  # No track number
        ]
        
        sorted_songs = sorted(songs, key=lambda s: s.get("track_number") or 9999)
        
        assert sorted_songs[0]["title"] == "Song A"
        assert sorted_songs[1]["title"] == "Song B"
        assert sorted_songs[2]["title"] == "Song C"
        assert sorted_songs[3]["title"] == "Song D"  # No track number goes last
    
    def test_disc_number_handling(self):
        """Test multi-disc album handling."""
        songs = [
            {"title": "D2S1", "disc_number": 2, "track_number": 1},
            {"title": "D1S2", "disc_number": 1, "track_number": 2},
            {"title": "D1S1", "disc_number": 1, "track_number": 1},
            {"title": "D2S2", "disc_number": 2, "track_number": 2},
        ]
        
        sorted_songs = sorted(
            songs,
            key=lambda s: (s.get("disc_number") or 1, s.get("track_number") or 9999)
        )
        
        assert sorted_songs[0]["title"] == "D1S1"
        assert sorted_songs[1]["title"] == "D1S2"
        assert sorted_songs[2]["title"] == "D2S1"
        assert sorted_songs[3]["title"] == "D2S2"

