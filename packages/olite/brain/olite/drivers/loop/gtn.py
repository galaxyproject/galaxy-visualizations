"""Galaxy Training Network discovery, ported from loom's `gtn_search` / `gtn_fetch`."""

import json
import logging
from html.parser import HTMLParser

from olite.substrate.http import http

logger = logging.getLogger(__name__)

GTN_HOST = "training.galaxyproject.org"
GTN_BASE = f"https://{GTN_HOST}"
GTN_API = f"{GTN_BASE}/training-material/api"
# A tutorial page is routinely over 100 KB of readable text, past the dispatcher's budget for
# a single result. Bounded here instead, where the tool knows the head is the part that
# matters -- objectives and the first hands-on sections -- and can say how to get the rest.
FETCH_MAX_CHARS = 40000
# An error page is HTML too; without this the whole 404 body lands in the transcript.
ERROR_MAX_CHARS = 400

# Chrome that carries no tutorial content; dropped whole, as loom drops them.
DROP_TAGS = {"script", "style", "nav", "header", "footer", "aside", "noscript"}
# Elements with no end tag, so depth accounting does not drift.
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}
# Most specific first: the first one present wins.
CONTENT_REGIONS = ("main", "article", "tutorial-content")


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chunks = []
        self.regions = {}
        self._depth = 0
        self._skip_until = None
        self._open_regions = []

    def handle_starttag(self, tag, attrs):
        if tag in VOID_TAGS:
            return
        self._depth += 1
        if self._skip_until is not None:
            return
        if tag in DROP_TAGS:
            self._skip_until = self._depth
            return
        name = tag if tag in CONTENT_REGIONS else None
        if name is None and "tutorial-content" in CONTENT_REGIONS:
            classes = dict(attrs).get("class") or ""
            if "tutorial-content" in classes.split():
                name = "tutorial-content"
        # Only the outermost occurrence of a region is captured; a nested <article>
        if name and name not in self.regions:
            self.regions[name] = []
            self._open_regions.append((name, self._depth))

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return
        if self._skip_until is not None and self._depth <= self._skip_until:
            self._skip_until = None
        while self._open_regions and self._open_regions[-1][1] >= self._depth:
            self._open_regions.pop()
        self._depth = max(0, self._depth - 1)

    def handle_data(self, data):
        if self._skip_until is not None:
            return
        self.chunks.append(data)
        for name, _ in self._open_regions:
            self.regions[name].append(data)


def _normalize(text):
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    out = []
    blanks = 0
    for line in lines:
        collapsed = " ".join(line.split())
        if collapsed:
            out.append(collapsed)
            blanks = 0
        else:
            blanks += 1
            if blanks < 2:
                out.append("")
    return "\n".join(out).strip()


def _strip_html(html):
    """Reduce a GTN page to readable text, preferring its most specific region."""
    parser = _TextExtractor()
    try:
        parser.feed(html)
        parser.close()
    except Exception as e:  # a malformed page should degrade, not raise
        logger.warning("GTN html parse failed, falling back to raw: %s", e)
        return _normalize(html)
    for name in CONTENT_REGIONS:
        chunk = parser.regions.get(name)
        if chunk and "".join(chunk).strip():
            return _normalize("".join(chunk))
    return _normalize("".join(parser.chunks))


# --- Handlers ----------------------------------------------------------------


async def _gtn_search(args):
    topic = (args or {}).get("topic")
    query = (args or {}).get("query")

    if not topic:
        data = await http.request("GET", f"{GTN_API}/topics.json")
        if not isinstance(data, dict):
            return {"error": "GTN returned an unexpected topics payload"}
        topics = [
            {"name": t.get("name"), "title": t.get("title"), "summary": t.get("summary")}
            for t in data.values()
            if isinstance(t, dict)
        ]
        return {
            "count": len(topics),
            "topics": topics,
            "hint": "Use gtn_search with a topic name to list its tutorials.",
        }

    data = await http.request("GET", f"{GTN_API}/topics/{topic}.json")
    if not isinstance(data, dict):
        return {
            "error": f'Topic "{topic}" not found. '
            "Use gtn_search with no arguments to list available topics."
        }

    tutorials = []
    for m in data.get("materials") or []:
        if not isinstance(m, dict):
            continue
        url = m.get("url") or ""
        tutorials.append(
            {
                "title": m.get("title"),
                "url": f"{GTN_BASE}{url}" if url.startswith("/") else url,
                "id": m.get("id") or m.get("tutorial_name"),
                "level": m.get("level"),
                "time_estimation": m.get("time_estimation"),
                "objectives": m.get("objectives") or [],
            }
        )

    if query:
        needle = query.lower()
        tutorials = [
            t
            for t in tutorials
            if needle in (t["title"] or "").lower()
            or any(needle in (o or "").lower() for o in t["objectives"])
        ]

    out = {"topic": data.get("title"), "count": len(tutorials)}
    if query:
        out["query"] = query
    out["tutorials"] = tutorials
    out["hint"] = "Use gtn_fetch with a tutorial URL to read its full content."
    return out


async def _gtn_fetch(args):
    url = ((args or {}).get("url") or "").strip()
    if not url:
        return {"error": "A tutorial url is required."}

    # Hostname check, not a substring check: "training.galaxyproject.org.evil.com"
    host = url.split("//", 1)[-1].split("/", 1)[0].split("@")[-1].split(":")[0].lower()
    if not url.lower().startswith(("http://", "https://")) or host != GTN_HOST:
        return {"error": f"Only URLs on {GTN_HOST} are allowed. Got: {host or url}"}

    try:
        page = await http.request("GET", url)
    except Exception as exc:
        detail = str(exc)
        if len(detail) > ERROR_MAX_CHARS:
            detail = detail[:ERROR_MAX_CHARS] + " ..."
        return {"url": url, "error": detail,
                "hint": "Check the url with gtn_search; tutorial paths include the topic, "
                        "and a topic listed in one place may live under another."}
    if not isinstance(page, str):
        page = json.dumps(page)
    text = _strip_html(page)
    if len(text) > FETCH_MAX_CHARS:
        return {"url": url, "content": text[:FETCH_MAX_CHARS], "truncated": True,
                "chars_total": len(text),
                "note": f"Showing the first {FETCH_MAX_CHARS} of {len(text)} characters. "
                        "Objectives and the first hands-on sections are here; open the url "
                        "for the rest."}
    return {"url": url, "content": text}


# --- Schemas -----------------------------------------------------------------

GTN_SEARCH = {
    "type": "function",
    "function": {
        "name": "gtn_search",
        "description": (
            "Browse GTN topics and discover tutorials. Call with no arguments to list all "
            "topics. Provide a topic ID to list its tutorials. Use query to filter tutorials "
            "by keyword in their title or objectives. Use this to find tutorial URLs before "
            "fetching with gtn_fetch."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "Topic ID to list tutorials for (e.g., 'transcriptomics', 'introduction')",
                },
                "query": {
                    "type": "string",
                    "description": "Keyword to filter tutorials by title or objectives (case-insensitive)",
                },
            },
        },
    },
}

GTN_FETCH = {
    "type": "function",
    "function": {
        "name": "gtn_fetch",
        "description": (
            "Fetch a Galaxy Training Network (GTN) tutorial page and return its content as "
            f"readable text. Only URLs on {GTN_HOST} are allowed. Use gtn_search first to "
            "discover valid tutorial URLs - do not guess or construct URLs. Use this to read "
            "tutorial instructions, tool names, parameters, and workflow steps so you can "
            "follow along and reproduce analyses in Galaxy."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": f"URL of the GTN tutorial page (must be on {GTN_HOST})",
                }
            },
            "required": ["url"],
        },
    },
}

HANDLERS = {"gtn_search": _gtn_search, "gtn_fetch": _gtn_fetch}


def tool_schemas():
    return [GTN_SEARCH, GTN_FETCH]


def get_handler(name):
    return HANDLERS.get(name)
