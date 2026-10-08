import { afterEach, describe, expect, it, vi } from "vitest";

import { FETCH_MAX_CHARS, GTN_API, GTN_BASE, GTN_HOST, gtnTools, stripHtml } from "./gtn";
import { connectWeb, ERROR_MAX } from "./galaxy";
import type { Context, Outcome } from "./tool";

const TOPICS = {
  transcriptomics: { name: "transcriptomics", title: "Transcriptomics", summary: "RNA-seq" },
  admin: { name: "admin", title: "Server administration", summary: "admin things" },
};

const TOPIC = {
  name: "transcriptomics",
  title: "Transcriptomics",
  materials: [
    {
      title: "Reference-based RNA-Seq",
      url: "/topics/transcriptomics/tutorials/ref-based/tutorial.html",
      tutorial_name: "ref-based",
      level: "Intermediate",
      objectives: ["Analyse RNA-Seq data", "Call differential expression"],
    },
    {
      title: "Introduction slides",
      url: "/topics/transcriptomics/tutorials/introduction/slides.html",
      tutorial_name: "introduction",
    },
  ],
};

const PAGE = `<html><head><style>.x{color:red}</style><script>alert(1)</script></head>
<body><nav>Skip to content</nav><header>GTN</header>
<main><h1>Reference-based RNA-Seq</h1><p>Run <code>fastp</code> &amp; then HISAT2.</p></main>
<footer>Contact us</footer></body></html>`;

type Answer = unknown | ((url: string) => Response);

/** Routes GTN requests by url prefix; anything else fails the test. */
function net(routes: Record<string, Answer>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    for (const [prefix, value] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        if (typeof value === "function") {
          return value(url);
        }
        return new Response(typeof value === "string" ? value : JSON.stringify(value));
      }
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return calls;
}

const standard = () =>
  net({
    [`${GTN_API}/topics.json`]: TOPICS,
    [`${GTN_API}/topics/transcriptomics.json`]: TOPIC,
    [`${GTN_API}/topics/nope.json`]: "404 page",
    [`${GTN_BASE}/topics/`]: PAGE,
  });

const status = (code: number, body: string) => () => new Response(body, { status: code });

const ctx = { web: connectWeb() } as Context;
const [search, fetchTool] = gtnTools();

async function call(tool: typeof search, args: Record<string, unknown>) {
  const outcome = (await tool.run(args, ctx)) as Outcome;
  return { outcome, out: JSON.parse(outcome.text) };
}

async function refused(tool: typeof search, args: Record<string, unknown>) {
  const { outcome, out } = await call(tool, args);
  expect(outcome.isError).toBe(true);
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gtn_search", () => {
  it("lists topics with no arguments and points at the next step", async () => {
    standard();
    const { out } = await call(search, {});
    expect(out.count).toBe(2);
    expect(new Set(out.topics.map((t: { name: string }) => t.name))).toEqual(
      new Set(["transcriptomics", "admin"]),
    );
    expect(out.hint).toContain("gtn_search with a topic name");
  });

  it("lists a topic's tutorials with absolute urls", async () => {
    standard();
    const { out } = await call(search, { topic: "transcriptomics" });
    expect(out.topic).toBe("Transcriptomics");
    expect(out.count).toBe(2);
    expect(out.tutorials[0].url).toBe(
      `${GTN_BASE}/topics/transcriptomics/tutorials/ref-based/tutorial.html`,
    );
    expect(out.hint).toContain("gtn_fetch");
  });

  it("tolerates missing optional fields", async () => {
    standard();
    const slides = (await call(search, { topic: "transcriptomics" })).out.tutorials[1];
    expect(slides.level).toBeNull();
    expect(slides.objectives).toEqual([]);
    expect(slides.id).toBe("introduction");
  });

  it("filters on title and objectives", async () => {
    standard();
    const byTitle = (await call(search, { topic: "transcriptomics", query: "slides" })).out;
    expect(byTitle.tutorials.map((t: { title: string }) => t.title)).toEqual([
      "Introduction slides",
    ]);
    const byObjective = (await call(search, { topic: "transcriptomics", query: "differential" }))
      .out;
    expect(byObjective.tutorials.map((t: { title: string }) => t.title)).toEqual([
      "Reference-based RNA-Seq",
    ]);
    expect(byObjective.query).toBe("differential");
  });

  it("says how to find a real topic when one is unknown", async () => {
    standard();
    const out = await refused(search, { topic: "nope" });
    expect(out.error).toContain("not found");
    expect(out.error).toContain("list available topics");
  });

  it("keeps a 404 error page out of the transcript", async () => {
    net({
      [`${GTN_API}/topics.json`]: TOPICS,
      [`${GTN_API}/topics/`]: status(404, "<!DOCTYPE html><html>...404 Page Not Found...</html>"),
    });
    const out = await refused(search, { topic: "nope" });
    expect(out.error).toContain("not found");
    expect(out.error).not.toContain("DOCTYPE");
  });
});

describe("gtn_fetch allowlist", () => {
  it.each([
    "https://evil.com/steal",
    "https://training.galaxyproject.org.evil.com/x",
    "https://evil.com/?u=training.galaxyproject.org",
    "https://evil.com@training.galaxyproject.org.attacker.net/x",
    "http://localhost:8080/api/histories",
    "file:///etc/passwd",
    "//training.galaxyproject.org/x",
    "",
  ])("refuses %s without reaching the network", async (url) => {
    const calls = standard();
    const out = await refused(fetchTool, { url });
    expect(out.error).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("does not let the userinfo trick smuggle a host", async () => {
    const calls = standard();
    const out = await refused(fetchTool, { url: "https://training.galaxyproject.org@evil.com/x" });
    expect(out.error).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("fetches a real GTN url and reduces it to text", async () => {
    standard();
    const url = `${GTN_BASE}/topics/transcriptomics/tutorials/ref-based/tutorial.html`;
    const { out } = await call(fetchTool, { url });
    expect(out.url).toBe(url);
    expect(out.content).toContain("Reference-based RNA-Seq");
    expect(out.content).toContain("fastp & then HISAT2");
    for (const gone of ["alert(1)", "color:red", "Skip to content", "Contact us"]) {
      expect(out.content).not.toContain(gone);
    }
  });
});

describe("gtn_fetch bounds", () => {
  const fetchBody = (answer: Answer) => {
    net({ [GTN_BASE]: answer });
    return call(fetchTool, { url: `https://${GTN_HOST}/t/tutorial.html` });
  };

  it("returns a short page whole", async () => {
    const { out } = await fetchBody("<p>Objectives: learn things</p>");
    expect(out.content).toContain("Objectives");
    expect(out.truncated).toBeUndefined();
  });

  it("truncates an oversized page and says so", async () => {
    const { out } = await fetchBody(`<p>${"word ".repeat(40000)}</p>`);
    expect(out.truncated).toBe(true);
    expect(out.content.length).toBe(FETCH_MAX_CHARS);
    expect(out.chars_total).toBeGreaterThan(FETCH_MAX_CHARS);
    expect(out.note).toContain(String(FETCH_MAX_CHARS));
  });

  it("stays under the dispatcher budget", async () => {
    const { outcome } = await fetchBody(`<p>${"word ".repeat(60000)}</p>`);
    expect(new TextEncoder().encode(outcome.text).length).toBeLessThan(64 * 1024);
  });

  it("trims an error body and carries a hint", async () => {
    const { outcome, out } = await fetchBody(status(404, "<html>".repeat(5000)));
    expect(outcome.isError).toBe(true);
    expect(out.error.length).toBeLessThanOrEqual(ERROR_MAX + 60);
    expect(out.error).toContain("404");
    expect(out.hint).toContain("gtn_search");
  });

  it("still refuses a non-GTN host", async () => {
    const out = await refused(fetchTool, { url: "https://raw.githubusercontent.com/x/y" });
    expect(out.error).toContain("Only URLs on");
  });
});

describe("html reduction", () => {
  it("prefers the most specific region", () => {
    expect(stripHtml("<body><article>outer</article><main>the tutorial</main></body>")).toBe(
      "the tutorial",
    );
  });

  it("recognises a tutorial-content class", () => {
    expect(
      stripHtml('<body><div class="tutorial-content">lesson body</div><p>chrome</p></body>'),
    ).toBe("lesson body");
  });

  it("falls back to everything without a content region", () => {
    expect(stripHtml("<body><p>hello</p></body>")).toContain("hello");
  });

  it("collapses blank runs", () => {
    const out = stripHtml("<main><p>a</p>\n\n\n\n<p>b</p></main>");
    expect(out).not.toContain("\n\n\n");
    expect(out).toContain("a");
    expect(out).toContain("b");
  });

  it("degrades on malformed html instead of raising", () => {
    expect(stripHtml("<main><p>text</main></div></p>")).toContain("text");
  });
});

describe("wiring", () => {
  it("declares both tools without a capability", () => {
    expect(gtnTools().map((t) => t.name)).toEqual(["gtn_search", "gtn_fetch"]);
    expect(gtnTools().every((t) => t.capability === undefined)).toBe(true);
  });
});
