"""TMDB (The Movie Database) API service for fetching movie and TV show metadata."""
import logging
import requests
from typing import Optional, Dict, Any, List
from datetime import datetime

logger = logging.getLogger(__name__)

TMDB_API_BASE_URL = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p"


class TMDBService:
    """Service for interacting with The Movie Database API."""
    
    def __init__(self, api_key: str):
        """Initialize TMDB service with API key."""
        self.api_key = api_key
        self.session = requests.Session()
        self.session.params = {"api_key": api_key}  # type: ignore
    
    def search_movie(self, title: str, year: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """
        Search for a movie by title and optional year.
        
        Args:
            title: Movie title to search for
            year: Optional year to narrow down results
            
        Returns:
            Movie data dictionary or None if not found
        """
        try:
            params = {"query": title}
            if year:
                params["year"] = year
            
            response = self.session.get(
                f"{TMDB_API_BASE_URL}/search/movie",
                params=params,
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            results = data.get("results", [])
            
            if not results:
                logger.warning(f"No TMDB results found for movie: {title} ({year})")
                return None
            
            # Get the first (most relevant) result
            movie = results[0]
            
            # Fetch additional details
            movie_id = movie["id"]
            return self.get_movie_details(movie_id)
            
        except Exception as e:
            logger.error(f"Error searching TMDB for movie '{title}': {e}")
            return None
    
    def get_movie_details(self, movie_id: int) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a movie.
        
        Args:
            movie_id: TMDB movie ID
            
        Returns:
            Detailed movie data or None if error
        """
        try:
            response = self.session.get(
                f"{TMDB_API_BASE_URL}/movie/{movie_id}",
                timeout=10
            )
            response.raise_for_status()
            
            movie = response.json()
            
            # Format the data for our database
            return {
                "tmdb_id": movie.get("id"),
                "title": movie.get("title"),
                "original_title": movie.get("original_title"),
                "description": movie.get("overview"),
                "year": int(movie.get("release_date", "")[:4]) if movie.get("release_date") else None,
                "release_date": movie.get("release_date"),
                "runtime": movie.get("runtime"),  # in minutes
                "genres": [g["name"] for g in movie.get("genres", [])],
                "poster_path": self._get_poster_url(movie.get("poster_path")),
                "backdrop_path": self._get_backdrop_url(movie.get("backdrop_path")),
                "rating": movie.get("vote_average"),
                "vote_count": movie.get("vote_count"),
                "popularity": movie.get("popularity"),
                "imdb_id": movie.get("imdb_id"),
                "tagline": movie.get("tagline"),
                "status": movie.get("status"),
                "budget": movie.get("budget"),
                "revenue": movie.get("revenue"),
            }
            
        except Exception as e:
            logger.error(f"Error getting TMDB movie details for ID {movie_id}: {e}")
            return None
    
    def search_tv_show(self, title: str, year: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """
        Search for a TV show by title.
        
        Args:
            title: TV show title to search for
            year: Optional first air year to narrow down results
            
        Returns:
            TV show data dictionary or None if not found
        """
        try:
            params = {"query": title}
            if year:
                params["first_air_date_year"] = year
            
            response = self.session.get(
                f"{TMDB_API_BASE_URL}/search/tv",
                params=params,
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            results = data.get("results", [])
            
            if not results:
                logger.warning(f"No TMDB results found for TV show: {title}")
                return None
            
            # Get the first (most relevant) result
            show = results[0]
            
            # Fetch additional details
            show_id = show["id"]
            return self.get_tv_show_details(show_id)
            
        except Exception as e:
            logger.error(f"Error searching TMDB for TV show '{title}': {e}")
            return None
    
    def get_tv_show_details(self, show_id: int) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a TV show.
        
        Args:
            show_id: TMDB TV show ID
            
        Returns:
            Detailed TV show data or None if error
        """
        try:
            response = self.session.get(
                f"{TMDB_API_BASE_URL}/tv/{show_id}",
                timeout=10
            )
            response.raise_for_status()
            
            show = response.json()
            
            # Format the data for our database
            return {
                "tmdb_id": show.get("id"),
                "title": show.get("name"),
                "original_title": show.get("original_name"),
                "description": show.get("overview"),
                "year": int(show.get("first_air_date", "")[:4]) if show.get("first_air_date") else None,
                "first_air_date": show.get("first_air_date"),
                "last_air_date": show.get("last_air_date"),
                "genres": [g["name"] for g in show.get("genres", [])],
                "poster_path": self._get_poster_url(show.get("poster_path")),
                "backdrop_path": self._get_backdrop_url(show.get("backdrop_path")),
                "rating": show.get("vote_average"),
                "vote_count": show.get("vote_count"),
                "popularity": show.get("popularity"),
                "status": show.get("status"),
                "number_of_seasons": show.get("number_of_seasons"),
                "number_of_episodes": show.get("number_of_episodes"),
                "episode_run_time": show.get("episode_run_time")[0] if show.get("episode_run_time") and len(show.get("episode_run_time", [])) > 0 else None,  # Average episode length
                "networks": [n["name"] for n in show.get("networks", [])],
                "creators": [c["name"] for c in show.get("created_by", [])],
            }
            
        except Exception as e:
            logger.error(f"Error getting TMDB TV show details for ID {show_id}: {e}")
            return None
    
    def get_tv_season_details(self, show_id: int, season_number: int) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a TV season.
        
        Args:
            show_id: TMDB TV show ID
            season_number: Season number
            
        Returns:
            Season data or None if error
        """
        try:
            response = self.session.get(
                f"{TMDB_API_BASE_URL}/tv/{show_id}/season/{season_number}",
                timeout=10
            )
            response.raise_for_status()
            
            season = response.json()
            
            return {
                "tmdb_id": season.get("id"),
                "season_number": season.get("season_number"),
                "name": season.get("name"),
                "description": season.get("overview"),
                "air_date": season.get("air_date"),
                "poster_path": self._get_poster_url(season.get("poster_path")),
                "episode_count": len(season.get("episodes", [])),
                "episodes": season.get("episodes", [])
            }
            
        except Exception as e:
            logger.error(f"Error getting TMDB season details for show {show_id}, season {season_number}: {e}")
            return None
    
    def _get_poster_url(self, poster_path: Optional[str], size: str = "w500") -> Optional[str]:
        """
        Get full URL for poster image.
        
        Args:
            poster_path: TMDB poster path
            size: Image size (w92, w154, w185, w342, w500, w780, original)
            
        Returns:
            Full poster URL or None
        """
        if not poster_path:
            return None
        return f"{TMDB_IMAGE_BASE_URL}/{size}{poster_path}"
    
    def _get_backdrop_url(self, backdrop_path: Optional[str], size: str = "w1280") -> Optional[str]:
        """
        Get full URL for backdrop image.
        
        Args:
            backdrop_path: TMDB backdrop path
            size: Image size (w300, w780, w1280, original)
            
        Returns:
            Full backdrop URL or None
        """
        if not backdrop_path:
            return None
        return f"{TMDB_IMAGE_BASE_URL}/{size}{backdrop_path}"
    
    def get_movie_credits(self, movie_id: int) -> Optional[Dict[str, Any]]:
        """
        Get cast and crew credits for a movie.
        
        Args:
            movie_id: TMDB movie ID
            
        Returns:
            Dictionary with cast and crew lists or None if error
        """
        try:
            response = self.session.get(
                f"{TMDB_API_BASE_URL}/movie/{movie_id}/credits",
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            
            # Extract main cast (limit to top 6)
            cast = []
            for person in data.get("cast", [])[:6]:
                cast.append({
                    "name": person.get("name"),
                    "character": person.get("character"),
                    "profile_path": self._get_profile_url(person.get("profile_path"))
                })
            
            # Extract crew - find director, writer, producer with images
            crew = data.get("crew", [])
            director = None
            writer = None
            producer = None

            for person in crew:
                job = person.get("job", "")
                if job == "Director" and not director:
                    director = {
                        "name": person.get("name"),
                        "profile_path": self._get_profile_url(person.get("profile_path"))
                    }
                elif job in ["Screenplay", "Writer"] and not writer:
                    writer = {
                        "name": person.get("name"),
                        "profile_path": self._get_profile_url(person.get("profile_path"))
                    }
                elif job in ["Producer", "Executive Producer"] and not producer:
                    producer = {
                        "name": person.get("name"),
                        "profile_path": self._get_profile_url(person.get("profile_path"))
                    }

            return {
                "cast": cast,
                "director": director or {"name": "Unknown", "profile_path": None},
                "writer": writer or {"name": "Unknown", "profile_path": None},
                "producer": producer or {"name": "Unknown", "profile_path": None}
            }
            
        except Exception as e:
            logger.error(f"Error getting TMDB movie credits for ID {movie_id}: {e}")
            return None

    def get_tv_credits(self, show_id: int) -> Optional[Dict[str, Any]]:
        """
        Get cast and crew credits for a TV show.
        
        Args:
            show_id: TMDB TV show ID
            
        Returns:
            Dictionary with cast and crew lists or None if error
        """
        try:
            response = self.session.get(
                f"{TMDB_API_BASE_URL}/tv/{show_id}/credits",
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            
            # Extract main cast (limit to top 6)
            cast = []
            for person in data.get("cast", [])[:6]:
                cast.append({
                    "name": person.get("name"),
                    "character": person.get("character"),
                    "profile_path": self._get_profile_url(person.get("profile_path"))
                })
            
            # Extract crew - TV shows use "Creator" instead of "Director"
            crew = data.get("crew", [])
            creator = None
            writer = None
            producer = None

            for person in crew:
                job = person.get("job", "")
                if not creator and job in ["Creator", "Executive Producer"]:
                    creator = {
                        "name": person.get("name"),
                        "profile_path": self._get_profile_url(person.get("profile_path"))
                    }
                elif not writer and job in ["Writer", "Screenplay"]:
                    writer = {
                        "name": person.get("name"),
                        "profile_path": self._get_profile_url(person.get("profile_path"))
                    }
                elif not producer and job == "Producer":
                    producer = {
                        "name": person.get("name"),
                        "profile_path": self._get_profile_url(person.get("profile_path"))
                    }

            return {
                "cast": cast,
                "creator": creator or {"name": "Unknown", "profile_path": None},
                "writer": writer or {"name": "Unknown", "profile_path": None},
                "producer": producer or {"name": "Unknown", "profile_path": None}
            }
            
        except Exception as e:
            logger.error(f"Error getting TMDB TV show credits for ID {show_id}: {e}")
            return None
    
    def _get_profile_url(self, profile_path: Optional[str], size: str = "w185") -> Optional[str]:
        """
        Get full URL for person profile image.
        
        Args:
            profile_path: TMDB profile path
            size: Image size (w45, w185, h632, original)
            
        Returns:
            Full profile URL or None
        """
        if not profile_path:
            return None
        return f"{TMDB_IMAGE_BASE_URL}/{size}{profile_path}"
    
    def search_person(self, name: str) -> Optional[int]:
        """
        Search for a person by name and return their TMDB ID.
        
        Args:
            name: Person's name
            
        Returns:
            TMDB person ID or None if not found
        """
        try:
            response = self.session.get(
                f"{TMDB_API_BASE_URL}/search/person",
                params={"query": name},
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            results = data.get("results", [])
            
            if not results:
                return None
            
            return results[0].get("id")
            
        except Exception as e:
            logger.error(f"Error searching for person '{name}': {e}")
            return None
    
    def get_person_credits(self, person_id: int) -> Optional[Dict[str, List[Dict[str, Any]]]]:
        """
        Get movie credits for a person.
        
        Args:
            person_id: TMDB person ID
            
        Returns:
            Dictionary with cast and crew credits
        """
        try:
            response = self.session.get(
                f"{TMDB_API_BASE_URL}/person/{person_id}/movie_credits",
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            
            # Get cast credits (when they acted)
            cast_movies = []
            for movie in data.get("cast", []):
                if movie.get("title") and movie.get("release_date"):
                    cast_movies.append({
                        "title": movie.get("title"),
                        "year": movie.get("release_date", "")[:4],
                        "character": movie.get("character"),
                        "popularity": movie.get("popularity", 0)
                    })
            
            # Get crew credits (when they directed/wrote/produced)
            crew_movies = []
            for movie in data.get("crew", []):
                if movie.get("title") and movie.get("release_date"):
                    crew_movies.append({
                        "title": movie.get("title"),
                        "year": movie.get("release_date", "")[:4],
                        "job": movie.get("job"),
                        "popularity": movie.get("popularity", 0)
                    })
            
            return {
                "cast": sorted(cast_movies, key=lambda x: x["popularity"], reverse=True),
                "crew": sorted(crew_movies, key=lambda x: x["popularity"], reverse=True)
            }
            
        except Exception as e:
            logger.error(f"Error getting person credits for ID {person_id}: {e}")
            return None
    
    def get_uk_certification(self, movie_id: int) -> Optional[str]:
        """
        Get UK certification (rating) for a movie.
        
        Args:
            movie_id: TMDB movie ID
            
        Returns:
            UK certification (U, PG, 12, 12A, 15, 18, R18) or None
        """
        try:
            response = self.session.get(
                f"{TMDB_API_BASE_URL}/movie/{movie_id}/release_dates",
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            results = data.get("results", [])
            
            # Find UK release info
            for country_data in results:
                if country_data.get("iso_3166_1") == "GB":
                    # Get the first release with a certification
                    release_dates = country_data.get("release_dates", [])
                    for release in release_dates:
                        cert = release.get("certification", "").strip()
                        if cert:
                            logger.info(f"Found UK certification for movie {movie_id}: {cert}")
                            return cert
            
            logger.debug(f"No UK certification found for movie {movie_id}")
            return None
            
        except Exception as e:
            logger.error(f"Error getting UK certification for movie {movie_id}: {e}")
            return None
