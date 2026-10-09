import { marked } from "marked";
import { describe, expect, it, vi } from "vitest";

import { useChatMarkdown } from "./chat-markdown";
import { renderMarkdown } from "./orbit/app/src/renderer/chat/markdown";

// happy-dom has no `self.origin`; a browser gives the frame Galaxy's.
vi.stubGlobal("origin", new URL(document.baseURI).origin);
useChatMarkdown();

/** The rendered chat, as the browser would hold it. */
const rendered = (text: string) => {
  const el = document.createElement("div");
  el.innerHTML = renderMarkdown(text);
  return el;
};

/** Every URL the rendered chat would fetch on its own, without a click. */
const fetched = (el: HTMLElement) =>
  Array.from(el.querySelectorAll("*")).flatMap((node) =>
    node.nodeName === "A"
      ? []
      : ["src", "srcset", "poster", "background", "href", "style"]
          .map((name) => node.getAttribute(name))
          .filter((value): value is string => !!value),
  );

describe("the chat's markdown", () => {
  it.each([
    "![x](https://evil.example/md)",
    "![x](//evil.example/protocol-relative)",
    "![x](HTTPS://EVIL.EXAMPLE/upper)",
    '<img src="https://evil.example/img">',
    '<img src="  https://evil.example/spaced">',
    '<picture><source srcset="https://evil.example/picture"><img src="/ok.png"></picture>',
    '<video poster="https://evil.example/poster"></video>',
    '<video src="https://evil.example/video"></video>',
    '<audio src="https://evil.example/audio"></audio>',
    '<input type="image" src="https://evil.example/input">',
    '<table background="https://evil.example/table"><tr><td>x</td></tr></table>',
    '<div style="background-image:url(https://evil.example/style)">x</div>',
  ])("fetches nothing from elsewhere for %j", (text) => {
    const el = rendered(text);
    expect(fetched(el).filter((url) => /evil/i.test(url))).toEqual([]);
  });

  it("shows the model's raw HTML as text", () => {
    expect(rendered('<img src="https://evil.example/img">').textContent).toContain("<img");
  });

  it("keeps a remote image as a link the user may follow", () => {
    const link = rendered("![plot](https://example.org/p.png)").querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.org/p.png");
    expect(link?.textContent).toBe("plot");
  });

  it("still shows images from Galaxy itself and inline data", () => {
    const same = new URL("/api/datasets/d1/display", document.baseURI).href;
    for (const href of [
      "/api/datasets/d1/display?preview=true",
      same,
      "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    ]) {
      expect(rendered(`![x](${href})`).querySelector("img")?.getAttribute("src")).toBe(href);
    }
  });

  it("registers on marked once, however often the chat is set up", () => {
    const use = vi.spyOn(marked, "use");
    useChatMarkdown();
    useChatMarkdown();
    expect(use).not.toHaveBeenCalled();
    use.mockRestore();
  });

  it("leaves links alone", () => {
    expect(rendered("[docs](https://example.org/)").querySelector("a")?.href).toBe(
      "https://example.org/",
    );
  });
});
