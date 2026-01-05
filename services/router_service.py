import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Union

from services.ai_service import AIService
from services.rag_service import RAGService


def _ordinal_word(day: int) -> str:
    ordinals = {
        1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth",
        6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth",
        11: "eleventh", 12: "twelfth", 13: "thirteenth", 14: "fourteenth",
        15: "fifteenth", 16: "sixteenth", 17: "seventeenth", 18: "eighteenth",
        19: "nineteenth", 20: "twentieth", 21: "twenty-first", 22: "twenty-second",
        23: "twenty-third", 24: "twenty-fourth", 25: "twenty-fifth", 26: "twenty-sixth",
        27: "twenty-seventh", 28: "twenty-eighth", 29: "twenty-ninth", 30: "thirtieth",
        31: "thirty-first",
    }
    return ordinals.get(day, str(day))


async def route_request(route_type: str, route_value: str, mode: str = "qa") -> Dict[str, Any]:
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
            phrase = f"The time is {now.strftime('%-I:%M')}"
            return {
                "success": True,
                "route": "get_time",
                "result": phrase,
            }
        if val in ("get_date", "date", "current_date"):
            today = datetime.now(timezone.utc).date()
            ordinal = _ordinal_word(today.day)
            month = today.strftime("%B").lower()
            phrase = f"The date is the {ordinal} of {month}"
            return {
                "success": True,
                "route": "get_date",
                "result": phrase,
            }
        return {"success": False, "error": f"Unknown task: {val or '(none)'}"}

    if route_type == "question":
        if not val:
            return {"success": False, "error": "Missing question text"}
        # Simple heuristics: map common time/date questions to tasks
        lower_val = val.lower()
        if "time" in lower_val:
            now = datetime.now(timezone.utc)
            phrase = f"The time is {now.strftime('%-I:%M')}"
            return {"success": True, "route": "get_time", "result": phrase}
        if "date" in lower_val or "day" in lower_val:
            today = datetime.now(timezone.utc).date()
            ordinal = _ordinal_word(today.day)
            month = today.strftime("%B").lower()
            phrase = f"The date is the {ordinal} of {month}"
            return {"success": True, "route": "get_date", "result": phrase}
        try:
            if mode == "conversational":
                rag = RAGService()
                rag.reload_persona_config()
                resp = await rag.execute({"question": val})
                return {
                    "success": True,
                    "route": "question",
                    "result": resp.get("answer"),
                    "model": resp.get("model") or resp.get("service"),
                    "mode": mode,
                }
            ai = AIService()
            ai.reload_persona_config()
            resp = await ai.execute({"question": val})
            return {
                "success": True,
                "route": "question",
                "result": resp.get("answer"),
                "model": resp.get("model") or resp.get("service"),
                "mode": mode,
            }
        except Exception as exec_err:
            return {"success": False, "error": f"Question routing failed: {exec_err}"}

    return {"success": False, "error": f"Unsupported route type: {route_type}"}

