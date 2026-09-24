"""GTN discovery: the two-step search/fetch shape, and the hostname allowlist."""

import asyncio
import json

import pytest

from olit.drivers.loop import gtn
from olit.drivers.loop.tools import ToolSurface

from .fakes import refused

TOPICS = {
    "transcriptomics": {"name": "transcriptomics", "title": "Transcriptomics", "summary": "RNA-seq"},
    "admin": {"name": "admin", "title": "Server administration", "summary": "admin things"},
}

TOPIC = {
    "name": "transcriptomics",
    "title": "Transcriptomics",
    "materials": [
        {
            "title": "Reference-based RNA-Seq",
            "url": "/topics/transcriptomics/tutorials/ref-based/tutorial.html",
            "tutorial_name": "ref-based",
            "level": "Intermediate",
            "objectives": ["Analyse RNA-Seq data", "Call differential expression"],
        },
        {
            "title": "Introduction slides",
            "url": "/topics/transcriptomics/tutorials/introduction/slides.html",
            "tutorial_name": "introduction",
        },
    ],
}

PAGE = """<html><head><style>.x{color:red}</style><script>alert(1)</script></head>
<body><nav>Skip to content</nav><header>GTN</header>
<main><h1>Reference-based RNA-Seq</h1><p>Run <code>fastp</code> &amp; then HISAT2.</p></main>
<footer>Contact us</footer></body></html>"""


class FakeHttp:
    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    async def request(self, method, url, headers=None, body=None):
        self.calls.append(url)
        for prefix, value in self.routes.items():
            if url.startswith(prefix):
                return value
        raise AssertionError(f"unexpected fetch: {url}")


@pytest.fixture
def net(monkeypatch):
    client = FakeHttp(
        {
            f"{gtn.GTN_API}/topics.json": TOPICS,
            f"{gtn.GTN_API}/topics/transcriptomics.json": TOPIC,
            f"{gtn.GTN_API}/topics/nope.json": "404 page",
            f"{gtn.GTN_BASE}/topics/": PAGE,
        }
    )
    monkeypatch.setattr(gtn, "http", client)
    return client


def run(coro):
    return asyncio.run(coro)


# --- Search -------------------------------------------------------------------


def test_no_arguments_lists_topics_and_points_at_the_next_step(net):
    out = run(gtn._gtn_search({}))

    assert out["count"] == 2
    assert {t["name"] for t in out["topics"]} == {"transcriptomics", "admin"}
    assert "gtn_search with a topic name" in out["hint"]


def test_a_topic_lists_tutorials_with_absolute_urls(net):
    out = run(gtn._gtn_search({"topic": "transcriptomics"}))

    assert out["topic"] == "Transcriptomics"
    assert out["count"] == 2
    first = out["tutorials"][0]
    # The API returns a site-relative path; the model needs something gtn_fetch takes.
    assert first["url"] == f"{gtn.GTN_BASE}/topics/transcriptomics/tutorials/ref-based/tutorial.html"
    assert "gtn_fetch" in out["hint"]


def test_missing_optional_fields_do_not_break_a_listing(net):
    """Slides carry no level or objectives; loom tolerates that and so must this."""
    out = run(gtn._gtn_search({"topic": "transcriptomics"}))
    slides = out["tutorials"][1]

    assert slides["level"] is None
    assert slides["objectives"] == []
    assert slides["id"] == "introduction"


def test_query_filters_on_title_and_objectives(net):
    by_title = run(gtn._gtn_search({"topic": "transcriptomics", "query": "slides"}))
    assert [t["title"] for t in by_title["tutorials"]] == ["Introduction slides"]

    by_objective = run(gtn._gtn_search({"topic": "transcriptomics", "query": "differential"}))
    assert [t["title"] for t in by_objective["tutorials"]] == ["Reference-based RNA-Seq"]
    assert by_objective["query"] == "differential"


def test_an_unknown_topic_says_how_to_find_a_real_one(net):
    out = refused(run(gtn._gtn_search({"topic": "nope"})))
    assert "not found" in out["error"]
    assert "list available topics" in out["error"]


def test_a_404_topic_does_not_put_the_error_page_in_the_transcript(monkeypatch):
    """GTN answers an unknown topic with 404, which the http layer raises."""

    class Raising:
        async def request(self, method, url, headers=None, body=None):
            if url.endswith("topics.json"):
                return TOPICS
            raise RuntimeError("HTTP 404: <!DOCTYPE html><html>...404 Page Not Found...</html>")

    monkeypatch.setattr(gtn, "http", Raising())
    out = refused(run(gtn._gtn_search({"topic": "nope"})))

    assert "not found" in out["error"]
    assert "DOCTYPE" not in out["error"]


# --- The allowlist ------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.com/steal",
        "https://training.galaxyproject.org.evil.com/x",  # suffix, not the host
        "https://evil.com/?u=training.galaxyproject.org",  # host in the query
        "https://evil.com@training.galaxyproject.org.attacker.net/x",
        "http://localhost:8080/api/histories",
        "file:///etc/passwd",
        "//training.galaxyproject.org/x",  # scheme-relative
        "",
    ],
)
def test_only_the_gtn_host_is_fetchable(net, url):
    out = refused(run(gtn._gtn_fetch({"url": url})))

    assert "error" in out, f"should have been refused: {url}"
    assert net.calls == [], "a refused url must not reach the network"


def test_the_userinfo_trick_does_not_smuggle_a_host(net):
    """`https://training.galaxyproject.org@evil.com/` fetches evil.com in a browser."""
    out = refused(run(gtn._gtn_fetch({"url": "https://training.galaxyproject.org@evil.com/x"})))

    assert "error" in out
    assert net.calls == []


def test_a_real_gtn_url_is_fetched_and_reduced_to_text(net):
    url = f"{gtn.GTN_BASE}/topics/transcriptomics/tutorials/ref-based/tutorial.html"
    out = run(gtn._gtn_fetch({"url": url}))

    assert out["url"] == url
    assert "Reference-based RNA-Seq" in out["content"]
    # Entities decoded, chrome dropped, scripts gone.
    assert "fastp & then HISAT2" in out["content"]
    for gone in ("alert(1)", "color:red", "Skip to content", "Contact us"):
        assert gone not in out["content"]


# --- HTML reduction -----------------------------------------------------------


def test_the_most_specific_region_wins():
    html = "<body><article>outer</article><main>the tutorial</main></body>"
    assert gtn._strip_html(html) == "the tutorial"


def test_a_tutorial_content_class_is_recognised():
    html = '<body><div class="tutorial-content">lesson body</div><p>chrome</p></body>'
    assert gtn._strip_html(html) == "lesson body"


def test_a_page_with_no_content_region_falls_back_to_everything():
    assert "hello" in gtn._strip_html("<body><p>hello</p></body>")


def test_blank_runs_collapse():
    out = gtn._strip_html("<main><p>a</p>\n\n\n\n<p>b</p></main>")
    assert "\n\n\n" not in out
    assert "a" in out and "b" in out


def test_malformed_html_degrades_instead_of_raising():
    assert "text" in gtn._strip_html("<main><p>text</main></div></p>")


# --- Wiring -------------------------------------------------------------------


class FakeManifest:
    def allows(self, capability):
        return False


class FakeSubstrate:
    manifest = FakeManifest()


def test_both_tools_are_advertised_even_with_nothing_granted(net):
    """GTN is public material on one host, so it is not manifest-gated."""
    names = [t["function"]["name"] for t in ToolSurface(FakeSubstrate()).schemas()]

    assert "gtn_search" in names
    assert "gtn_fetch" in names


def test_the_surface_dispatches_to_the_gtn_handlers(net):
    surface = ToolSurface(FakeSubstrate())
    out = json.loads(asyncio.run(surface.dispatch("gtn_search", {})).text)

    assert out["count"] == 2
