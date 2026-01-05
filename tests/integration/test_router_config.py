import json
from pathlib import Path


def test_router_config_examples_present():
    """Ensure router.config includes the example routing rules described in the prompt."""
    cfg_path = Path(__file__).resolve().parent.parent.parent / "config" / "router.config"
    assert cfg_path.exists(), "router.config is missing"

    with cfg_path.open("r", encoding="utf-8") as f:
        cfg = json.load(f)

    anth = cfg.get("anthropic", {})
    prompt = anth.get("prompt_context", "")
    assert prompt, "prompt_context missing in router.config"

    # Example rules from the prompt
    assert "trigger: get time" in prompt
    assert "type: task" in prompt
    assert "value: get_time" in prompt

    assert "trigger: what is the capital of china" in prompt
    assert "type: question" in prompt
    assert "value: what is the capital of china" in prompt

    # Response format guidance should be present
    assert "Always return a single JSON object" in prompt
    assert "type: task or question" in prompt


