"""Artifacts as page markdown: one renderer per artifact kind.

An artifact's payload is kept out of the model's context, so a page cannot be written by
pasting a chart spec into an argument. The model writes `{{artifact}}` where the chart
belongs and the renderer for that kind supplies the markdown.

Adding a kind is a renderer and an entry in RENDERERS. Tools need no change: any string
argument carrying the token is resolved before the handler runs.
"""

import json
import re

TOKEN = re.compile(r"\{\{\s*artifact\s*(?::\s*(?P<title>[^{}]*?)\s*)?\}\}")


def _fenced(label, body):
    return f"```{label}\n{body}\n```"


def _vega(artifact):
    return _fenced("vega", json.dumps(artifact.get("spec") or {}, indent=2))


def _visualization(artifact):
    return _fenced(
        "galaxy",
        f"visualization(visualization_id={artifact.get('visualization')}, "
        f"history_dataset_id={artifact.get('dataset_id')})",
    )


def _mermaid(artifact):
    return _fenced("mermaid", artifact.get("diagram") or "")


RENDERERS = {
    "vega-lite": _vega,
    "visualization": _visualization,
    "mermaid": _mermaid,
}


def render(artifact):
    """This artifact as page markdown, or None when no renderer covers its kind."""
    renderer = RENDERERS.get((artifact or {}).get("kind"))
    return renderer(artifact) if renderer else None


def _pick(title, artifacts):
    """The artifact a token names, most recent first."""
    if not title:
        return artifacts[-1] if artifacts else None
    wanted = title.strip().lower()
    return next((a for a in reversed(artifacts) if (a.get("title") or "").lower() == wanted), None)


def _titles(artifacts):
    return [a.get("title") for a in artifacts if a.get("title")]


def resolve(text, artifacts):
    """Replace every {{artifact}} token in `text`; returns (text, refusal)."""
    if not isinstance(text, str) or not TOKEN.search(text):
        return text, None

    refusal = None

    def substitute(match):
        nonlocal refusal
        title = match.group("title")
        artifact = _pick(title, artifacts)
        if artifact is None:
            refusal = refusal or (
                f"No artifact titled {title!r} in this session."
                if title
                else "No artifact has been produced in this session yet."
            )
            if _titles(artifacts):
                refusal += f" Available: {', '.join(_titles(artifacts))}."
            return match.group(0)
        markdown = render(artifact)
        if markdown is None:
            refusal = refusal or (
                f"A {artifact.get('kind')!r} artifact cannot be written into a Galaxy page; "
                f"a page holds {', '.join(sorted(RENDERERS))}."
            )
            return match.group(0)
        return markdown

    return TOKEN.sub(substitute, text), refusal
