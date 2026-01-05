import json

from .client import http

MIN = 0.0000001
MAX = 999999999
MAX_TOKENS = 16384
TEMPERATURE = 0.3
TOP_P = 0.8


async def completions_post(payload):
    api_key = payload.get("ai_api_key")
    base_url = payload.get("ai_base_url")
    base_url = base_url.rstrip("/") if base_url else ""
    url = f"{base_url}/chat/completions"

    body = {
        "model": payload.get("ai_model"),
        "messages": payload["messages"],
        "max_tokens": normalize_parameter(
            payload.get("ai_maxTokens"),
            1,
            MAX,
            MAX_TOKENS,
        ),
        "temperature": normalize_parameter(
            payload.get("ai_temperature"),
            0,
            MAX,
            TEMPERATURE,
        ),
        "top_p": normalize_parameter(
            payload.get("ai_top_p"),
            MIN,
            1,
            TOP_P,
        ),
    }

    tools = payload.get("tools")
    if tools:
        body["tools"] = tools

    tool_choice = payload.get("tool_choice")
    if tool_choice:
        body["tool_choice"] = tool_choice
    elif tools:
        first_tool = tools[0]
        tool_name = first_tool.get("function", {}).get("name")
        if not tool_name:
            raise Exception("Tool provided without function name.")
        body["tool_choice"] = {
            "type": "function",
            "function": {"name": tool_name},
        }

    headers = dict()
    headers["Content-Type"] = "application/json"
    if api_key is not None:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["x-api-key"] = api_key

    return await http.request(
        method="POST",
        url=url,
        headers=headers,
        body=body,
    )


def get_tool_call(name, tool_calls):
    result = {}
    found = False

    if tool_calls:
        for call in tool_calls:
            fn = call.get("function")
            if fn and fn.get("name") == name:
                found = True
                args = fn.get("arguments")
                if isinstance(args, str) and args:
                    try:
                        parsed = json.loads(args)
                        result.update(parsed)
                    except Exception:
                        continue

    return result if found else None


def normalize_parameter(value, min_val, max_val, fallback):
    if value is None:
        return fallback
    if value < min_val:
        return min_val
    if value > max_val:
        return max_val
    return value


__all__ = ["completions_post", "get_tool_call"]
