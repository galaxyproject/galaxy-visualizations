"""Parsing JSON a model emitted. Ported from pi's `utils/json-parse.ts`."""

import json

VALID_JSON_ESCAPES = frozenset('"\\/bfnrtu')
_NAMED = {"\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t"}
_HEX = frozenset("0123456789abcdefABCDEF")


def _escape_control(char):
    return _NAMED.get(char) or "\\u%04x" % ord(char)


def repair_json(text):
    """Escape raw control characters inside strings and double invalid backslash escapes."""
    out = []
    in_string = False
    i = 0
    n = len(text)
    while i < n:
        char = text[i]
        if not in_string:
            out.append(char)
            if char == '"':
                in_string = True
            i += 1
            continue
        if char == '"':
            out.append(char)
            in_string = False
            i += 1
            continue
        if char == "\\":
            nxt = text[i + 1] if i + 1 < n else None
            if nxt is None:
                out.append("\\\\")
                i += 1
                continue
            if nxt == "u":
                digits = text[i + 2 : i + 6]
                if len(digits) == 4 and all(d in _HEX for d in digits):
                    out.append("\\u" + digits)
                    i += 6
                    continue
            if nxt in VALID_JSON_ESCAPES:
                out.append("\\" + nxt)
                i += 2
                continue
            out.append("\\\\")
            i += 1
            continue
        out.append(_escape_control(char) if ord(char) <= 0x1F else char)
        i += 1
    return "".join(out)


def loads_with_repair(text):
    """`json.loads`, retried once on a repaired copy. Raises if the repair does not help."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        repaired = repair_json(text)
        if repaired != text:
            return json.loads(repaired)
        raise
