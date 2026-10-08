import { describe, expect, it } from "vitest";

import { createRetryNotice } from "./retry-notice";

function shown(errorMessage: string) {
  const lines: string[] = [];
  const notice = createRetryNotice({
    addInfoMessage: (text) => {
      lines.push(text);
      return document.createElement("div");
    },
  });
  notice.start(errorMessage, Date.now() + 5000, 0);
  notice.stop();
  return lines[0];
}

describe("the retry notice", () => {
  it("names a rate limit", () => {
    expect(shown("429 Too Many Requests")).toMatch(/^Rate limited by the model provider/);
  });

  it("names the provider's error status", () => {
    expect(shown('503 {"error":"overloaded"}')).toMatch(/^Provider error 503/);
  });

  it("does not read a stated wait as a status", () => {
    expect(shown("Rate limit reached, retry after 120 seconds")).toMatch(
      /^The model provider failed/,
    );
  });
});
