import { fail, Outcome, type Context, type OlitTool } from "./tool";

export const GTN_HOST = "training.galaxyproject.org";
export const GTN_BASE = `https://${GTN_HOST}`;
export const GTN_API = `${GTN_BASE}/training-material/api`;
export const FETCH_MAX_CHARS = 40000;

/** Chrome that carries no tutorial content, dropped whole. */
const DROP_TAGS = new Set(["script", "style", "nav", "header", "footer", "aside", "noscript"]);
/** Elements with no end tag. */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
/** Most specific first: the first one present wins. */
const CONTENT_REGIONS = ["main", "article", "tutorial-content"];
const RAW_TEXT = new Set(["script", "style"]);
const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  copy: "©",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rarr: "→",
  rdquo: "”",
  reg: "®",
  rsquo: "’",
  times: "×",
};
const TAG =
  /<!--[\s\S]*?-->|<[!?][^>]*>|<\/([a-zA-Z][^\s/>]*)[^>]*>|<([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const CLASS_ATTR = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

function unescape(text: string): string {
  return text.replace(
    /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g,
    (match, ref: string) => {
      if (ref.startsWith("#")) {
        const code =
          ref[1] === "x" || ref[1] === "X"
            ? parseInt(ref.slice(2), 16)
            : parseInt(ref.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[ref] ?? match;
    },
  );
}

function classOf(attrs: string): string {
  const matches = [...attrs.matchAll(CLASS_ATTR)];
  const last = matches[matches.length - 1];
  return last ? unescape(last[1] ?? last[2] ?? last[3] ?? "") : "";
}

/** The page's text, and the text inside each content region. */
function extract(html: string) {
  const chunks: string[] = [];
  const regions: Record<string, string[]> = {};
  const open: [string, number][] = [];
  let depth = 0;
  let skipUntil: number | undefined;

  const start = (tag: string, attrs: string) => {
    if (VOID_TAGS.has(tag)) {
      return;
    }
    depth += 1;
    if (skipUntil !== undefined) {
      return;
    }
    if (DROP_TAGS.has(tag)) {
      skipUntil = depth;
      return;
    }
    let name = CONTENT_REGIONS.includes(tag) ? tag : undefined;
    if (!name && classOf(attrs).split(/\s+/).includes("tutorial-content")) {
      name = "tutorial-content";
    }
    // Only the outermost occurrence of a region is captured.
    if (name && !(name in regions)) {
      regions[name] = [];
      open.push([name, depth]);
    }
  };
  const end = (tag: string) => {
    if (VOID_TAGS.has(tag)) {
      return;
    }
    if (skipUntil !== undefined && depth <= skipUntil) {
      skipUntil = undefined;
    }
    while (open.length && open[open.length - 1][1] >= depth) {
      open.pop();
    }
    depth = Math.max(0, depth - 1);
  };
  const data = (text: string) => {
    if (!text || skipUntil !== undefined) {
      return;
    }
    chunks.push(text);
    for (const [name] of open) {
      regions[name].push(text);
    }
  };

  let at = 0;
  TAG.lastIndex = 0;
  for (let match = TAG.exec(html); match; match = TAG.exec(html)) {
    data(unescape(html.slice(at, match.index)));
    at = TAG.lastIndex;
    const [, closing, opening, attrs = ""] = match;
    if (closing) {
      end(closing.toLowerCase());
    } else if (opening) {
      const tag = opening.toLowerCase();
      start(tag, attrs);
      if (attrs.trimEnd().endsWith("/")) {
        end(tag);
      } else if (RAW_TEXT.has(tag)) {
        const close = html.slice(at).search(new RegExp(`</${tag}[\\s>/]`, "i"));
        const stop = close < 0 ? html.length : at + close;
        data(html.slice(at, stop));
        TAG.lastIndex = at = stop;
      }
    }
  }
  data(unescape(html.slice(at)));
  return { chunks, regions };
}

function normalize(text: string): string {
  const out: string[] = [];
  let blanks = 0;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const collapsed = line.split(/\s+/).filter(Boolean).join(" ");
    if (collapsed) {
      out.push(collapsed);
      blanks = 0;
    } else {
      blanks += 1;
      if (blanks < 2) {
        out.push("");
      }
    }
  }
  return out.join("\n").trim();
}

/** Reduce a GTN page to readable text, preferring its most specific region. */
export function stripHtml(html: string): string {
  const { chunks, regions } = extract(html);
  for (const name of CONTENT_REGIONS) {
    const chunk = regions[name];
    if (chunk && chunk.join("").trim()) {
      return normalize(chunk.join(""));
    }
  }
  return normalize(chunks.join(""));
}

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function gtnSearch(args: { topic?: string; query?: string }, ctx: Context): Promise<Outcome> {
  const { topic, query } = args ?? {};
  const gtn = ctx.web.connect(`${GTN_BASE}/`);

  if (!topic) {
    const data = await gtn.get("training-material/api/topics.json");
    if (!isRecord(data)) {
      return fail(JSON.stringify({ error: "GTN returned an unexpected topics payload" }));
    }
    const topics = Object.values(data)
      .filter(isRecord)
      .map((t) => ({ name: t.name ?? null, title: t.title ?? null, summary: t.summary ?? null }));
    return new Outcome(
      JSON.stringify({
        count: topics.length,
        topics,
        hint: "Use gtn_search with a topic name to list its tutorials.",
      }),
    );
  }

  let data: unknown;
  try {
    data = await gtn.get(`training-material/api/topics/${topic}.json`);
  } catch {
    data = undefined;
  }
  if (!isRecord(data)) {
    return fail(
      JSON.stringify({
        error: `Topic "${topic}" not found. Use gtn_search with no arguments to list available topics.`,
      }),
    );
  }

  let tutorials = (Array.isArray(data.materials) ? data.materials : [])
    .filter(isRecord)
    .map((m) => {
      const url: string = m.url || "";
      return {
        title: m.title ?? null,
        url: url.startsWith("/") ? `${GTN_BASE}${url}` : url,
        id: m.id || m.tutorial_name || null,
        level: m.level ?? null,
        time_estimation: m.time_estimation ?? null,
        objectives: (m.objectives || []) as (string | null)[],
      };
    });

  if (query) {
    const needle = query.toLowerCase();
    tutorials = tutorials.filter(
      (t) =>
        (t.title || "").toLowerCase().includes(needle) ||
        t.objectives.some((o) => (o || "").toLowerCase().includes(needle)),
    );
  }

  return new Outcome(
    JSON.stringify({
      topic: data.title ?? null,
      count: tutorials.length,
      ...(query ? { query } : {}),
      tutorials,
      hint: "Use gtn_fetch with a tutorial URL to read its full content.",
    }),
  );
}

async function gtnFetch(args: { url?: string }, ctx: Context): Promise<Outcome> {
  const url = (args?.url || "").trim();
  if (!url) {
    return fail(JSON.stringify({ error: "A tutorial url is required." }));
  }

  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    parsed = undefined;
  }
  const host = parsed?.hostname ?? "";
  if (!parsed || !["http:", "https:"].includes(parsed.protocol) || host !== GTN_HOST) {
    return fail(
      JSON.stringify({ error: `Only URLs on ${GTN_HOST} are allowed. Got: ${host || url}` }),
    );
  }

  let page: unknown;
  try {
    const site = ctx.web.connect(`${parsed.origin}/`);
    page = await site.get(`${parsed.pathname}${parsed.search}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(
      JSON.stringify({
        url,
        error: detail,
        hint:
          "Check the url with gtn_search; tutorial paths include the topic, " +
          "and a topic listed in one place may live under another.",
      }),
    );
  }
  const text = stripHtml(typeof page === "string" ? page : JSON.stringify(page));
  if (text.length > FETCH_MAX_CHARS) {
    return new Outcome(
      JSON.stringify({
        url,
        content: text.slice(0, FETCH_MAX_CHARS),
        truncated: true,
        chars_total: text.length,
        note:
          `Showing the first ${FETCH_MAX_CHARS} of ${text.length} characters. ` +
          "Objectives and the first hands-on sections are here; open the url " +
          "for the rest.",
      }),
    );
  }
  return new Outcome(JSON.stringify({ url, content: text }));
}

/** Galaxy Training Network discovery: `gtn_search` and `gtn_fetch`. */
export function gtnTools(): OlitTool[] {
  return [
    {
      name: "gtn_search",
      description:
        "Browse GTN topics and discover tutorials. Call with no arguments to list all " +
        "topics. Provide a topic ID to list its tutorials. Use query to filter tutorials " +
        "by keyword in their title or objectives. Use this to find tutorial URLs before " +
        "fetching with gtn_fetch.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "Topic ID to list tutorials for (e.g., 'transcriptomics', 'introduction')",
          },
          query: {
            type: "string",
            description: "Keyword to filter tutorials by title or objectives (case-insensitive)",
          },
        },
      },
      run: gtnSearch,
    },
    {
      name: "gtn_fetch",
      description:
        "Fetch a Galaxy Training Network (GTN) tutorial page and return its content as " +
        `readable text. Only URLs on ${GTN_HOST} are allowed. Use gtn_search first to ` +
        "discover valid tutorial URLs - do not guess or construct URLs. Use this to read " +
        "tutorial instructions, tool names, parameters, and workflow steps so you can " +
        "follow along and reproduce analyses in Galaxy.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: `URL of the GTN tutorial page (must be on ${GTN_HOST})`,
          },
        },
        required: ["url"],
      },
      run: gtnFetch,
    },
  ];
}
