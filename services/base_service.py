"""Base service class for all services."""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class BaseService(ABC):
    """Base class for all services."""
    
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(f"{__name__}.{name}")
    
    @abstractmethod
    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the service with given input data.
        
        Args:
            input_data: Input data dictionary
            
        Returns:
            Output data dictionary
        """
        pass
    
    def validate_input(self, input_data: Dict[str, Any], required_fields: list) -> bool:
        """
        Validate input data has required fields.
        
        Args:
            input_data: Input data to validate
            required_fields: List of required field names
            
        Returns:
            True if valid, raises ValueError if invalid
        """
        missing_fields = [field for field in required_fields if field not in input_data]
        if missing_fields:
            raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")
        return True
    
    async def __call__(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Make the service callable."""
        return await self.execute(input_data)

