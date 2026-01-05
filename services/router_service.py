from datetime import datetime, timezone
from typing import Dict, Any

from services.ai_service import AIService
from services.rag_service import RAGService


def route_request(route_type: str, route_value: str, mode: str = "qa") -> Dict[str, Any]:
    """
    Simple router that dispatches based on type/value coming from the AI router.

    Supported:
      - task/get_time
      - task/get_date
      - question/<text>  (answers via AIService)
    """
    if not route_type:
        return {"success": False, "error": "Missing route type"}

    route_type = route_type.strip().lower()
    val = (route_value or "").strip()

    if route_type == "task":
        if val in ("get_time", "time", "current_time"):
            now = datetime.now(timezone.utc)
            return {
                "success": True,
                "route": "get_time",
                "result": now.strftime("%H:%M:%S UTC"),
            }
        if val in ("get_date", "date", "current_date"):
            today = datetime.now(timezone.utc).date()
            return {
                "success": True,
                "route": "get_date",
                "result": today.isoformat(),
            }
        return {"success": False, "error": f"Unknown task: {val or '(none)'}"}

    if route_type == "question":
        if not val:
            return {"success": False, "error": "Missing question text"}
        if mode == "conversational":
            rag = RAGService()
            rag.reload_persona_config()
            resp = rag.execute({"question": val})
            return {
                "success": True,
                "route": "question",
                "result": resp.get("answer"),
                "model": resp.get("model") or resp.get("service"),
                "mode": mode,
            }
        ai = AIService()
        ai.reload_persona_config()
        resp = ai.execute({"question": val})
        return {
            "success": True,
            "route": "question",
            "result": resp.get("answer"),
            "model": resp.get("model") or resp.get("service"),
            "mode": mode,
        }

    return {"success": False, "error": f"Unsupported route type: {route_type}"}

