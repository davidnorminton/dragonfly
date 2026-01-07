import pytest

from web.main import _parse_router_answer


def test_parse_router_answer_plain_json():
    data = {"type": "task", "value": "get_time"}
    parsed = _parse_router_answer('{"type":"task","value":"get_time"}')
    assert parsed == data


def test_parse_router_answer_code_fence_json():
    wrapped = "```json\n{\"type\":\"question\",\"value\":\"what is the capital of china\"}\n```"
    parsed = _parse_router_answer(wrapped)
    assert parsed == {"type": "question", "value": "what is the capital of china"}


def test_parse_router_answer_invalid_returns_none():
    assert _parse_router_answer("not json") is None
    assert _parse_router_answer("") is None
    assert _parse_router_answer(None) is None



