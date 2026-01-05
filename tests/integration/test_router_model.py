import json
import os
from pathlib import Path

import pytest

try:
    from anthropic import Anthropic
except ImportError:  # pragma: no cover
    Anthropic = None


ROUTER_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "router.config"


@pytest.mark.skipif(
    Anthropic is None or not os.getenv("ANTHROPIC_API_KEY"),
    reason="Anthropic client or API key not available",
)
def test_router_model_classifies_get_time():
    """Call Anthropic using router.config and verify 'get time' is classified as task/get_time."""
    with ROUTER_CONFIG_PATH.open("r", encoding="utf-8") as f:
        cfg = json.load(f)

    anth = cfg.get("anthropic", {})
    api_key = os.getenv("ANTHROPIC_API_KEY")

    client = Anthropic(api_key=api_key)

    params = {
        "model": anth.get("anthropic_model"),
        "messages": [{"role": "user", "content": "get time"}],
        "max_tokens": anth.get("max_tokens", 256),
    }
    if anth.get("prompt_context"):
        params["system"] = anth["prompt_context"]
    if anth.get("temperature") is not None:
        params["temperature"] = anth["temperature"]
    if anth.get("top_p") is not None:
        params["top_p"] = anth["top_p"]

    msg = client.messages.create(**params)

    text = ""
    for block in msg.content:
        if getattr(block, "type", None) == "text":
            text += block.text

    assert "task" in text.lower(), f"Router did not classify as task: {text}"
    assert "get_time" in text, f"Router did not return get_time value: {text}"

