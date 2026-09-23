"""Pull a named symbol's source out of loom (TypeScript) or olite (Python).

The seam registry hashes these extracts, so drift upstream shows up as a changed
hash rather than as something nobody noticed.
"""

import hashlib
import re


def ts_symbol(text, symbol):
    """The full source of a top-level `function symbol(...)  { ... }`, brace-matched."""
    m = re.search(rf"^(?:export )?(?:async )?function {re.escape(symbol)}\b", text, re.M)
    if not m:
        return None
    # Skip the parameter list: an inline type annotation like `{ omitAnchors?: boolean }`
    # otherwise gets mistaken for the body and the match closes early.
    k = text.index("(", m.start())
    depth = 0
    for k in range(k, len(text)):
        if text[k] == "(":
            depth += 1
        elif text[k] == ")":
            depth -= 1
            if depth == 0:
                break
    i = text.index("{", k)
    depth, j = 0, i
    while j < len(text):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[m.start() : j + 1]
        j += 1
    return None


def py_symbol(text, symbol):
    """A module-level `SYMBOL = \"\"\"...\"\"\"` constant, or a `def symbol(...)` body."""
    m = re.search(rf'^{re.escape(symbol)} = ("""|\'\'\')', text, re.M)
    if m:
        quote = m.group(1)
        end = text.index(quote, m.end())
        return text[m.start() : end + len(quote)]
    m = re.search(rf"^{re.escape(symbol)} = {{$", text, re.M)
    if m:
        lines = text[m.start():].splitlines()
        body = [lines[0]]
        for line in lines[1:]:
            body.append(line)
            if line == "}":
                break
        return "\n".join(body)
    m = re.search(rf"^def {re.escape(symbol)}\b", text, re.M)
    if not m:
        return None
    rest = text[m.start() :].splitlines()
    out = [rest[0]]
    for line in rest[1:]:
        if line and not line[0].isspace():
            break
        out.append(line)
    return "\n".join(out).rstrip()


def fingerprint(source):
    """Whitespace-normalised hash: reflowing a paragraph is not a semantic change."""
    return hashlib.sha256(" ".join((source or "").split()).encode()).hexdigest()[:16]


def ts_const(text, symbol):
    """An `export const NAME = `...`;` template-literal constant."""
    m = re.search(rf"^export const {re.escape(symbol)}\s*=\s*`", text, re.M)
    if not m:
        return None
    i = text.index("`", m.end() - 1)
    j = i + 1
    while j < len(text):
        if text[j] == "\\":
            j += 2
            continue
        if text[j] == "`":
            return text[m.start() : j + 1]
        j += 1
    return None


def section(source, heading):
    """One `### heading` sub-section, so a seam tracks its own text and not its neighbours'."""
    if source is None:
        return None
    lines = source.splitlines()
    for n, line in enumerate(lines):
        if line.strip().startswith("###") and heading in line:
            out = [line]
            for rest in lines[n + 1 :]:
                if rest.strip().startswith("###"):
                    break
                out.append(rest)
            return "\n".join(out).rstrip()
    return None
