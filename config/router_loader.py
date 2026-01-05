import json
from pathlib import Path
from typing import Optional, Dict, Any


def router_config_path() -> Path:
    return Path(__file__).parent / "router.config"


def load_router_config() -> Optional[Dict[str, Any]]:
    path = router_config_path()
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def save_router_config(config: Dict[str, Any]) -> bool:
    path = router_config_path()
    try:
        with path.open("w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except Exception:
        return False

