"""Base collector class for data collection modules."""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class BaseCollector(ABC):
    """Base class for all data collectors."""
    
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(f"{__name__}.{name}")
    
    @abstractmethod
    async def collect(self) -> Dict[str, Any]:
        """
        Collect data from the source.
        
        Returns:
            Dictionary containing collected data
        """
        pass
    
    @abstractmethod
    def get_data_type(self) -> str:
        """Return the data type identifier."""
        pass
    
    def get_source(self) -> str:
        """Return the source identifier."""
        return self.name

