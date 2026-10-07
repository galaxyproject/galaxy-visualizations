import { describe, expect, it } from "vitest";

import type { Artifact } from "../artifacts/kinds";
import { resolveArtifacts } from "./artifacts";

const VEGA: Artifact = { kind: "vega-lite", title: "Glucose by BMI", spec: { mark: "point" } };
const READS: Artifact = {
  kind: "visualization",
  title: "Reads",
  visualization: "igv",
  dataset_id: "d1",
};
const LINEAGE: Artifact = {
  kind: "mermaid",
  title: "Dataset lineage",
  diagram: "graph TD;\nA-->B;",
};

describe("resolving tokens", () => {
  it("keeps the prose around the token", () => {
    const { text, refusal } = resolveArtifacts("Before.\n\n{{artifact}}\n\nAfter.", [VEGA]);
    expect(refusal).toBeNull();
    expect((text as string).startsWith("Before.\n\n```vega")).toBe(true);
    expect((text as string).endsWith("```\n\nAfter.")).toBe(true);
  });

  it("takes the most recent artifact for a bare token", () => {
    const { text } = resolveArtifacts("{{artifact}}", [VEGA, READS]);
    expect((text as string).startsWith("```visualization")).toBe(true);
  });

  it("takes the one a titled token names", () => {
    const { text } = resolveArtifacts("{{artifact: Glucose by BMI}}", [VEGA, READS]);
    expect((text as string).startsWith("```vega")).toBe(true);
  });

  it("resolves several tokens in one write", () => {
    const { text, refusal } = resolveArtifacts(
      "{{artifact: Reads}}\n{{artifact: Glucose by BMI}}",
      [VEGA, READS],
    );
    expect(refusal).toBeNull();
    expect((text as string).indexOf("```visualization")).toBeLessThan(
      (text as string).indexOf("```vega"),
    );
  });

  it("refuses a diagram Galaxy pages cannot render, leaving the token", () => {
    const { text, refusal } = resolveArtifacts("{{artifact: Dataset lineage}}", [VEGA, LINEAGE]);
    expect(text).toBe("{{artifact: Dataset lineage}}");
    expect(refusal).toContain("cannot render");
  });

  it("refuses an unknown title and names what there is", () => {
    const { text, refusal } = resolveArtifacts("{{artifact: Nothing}}", [VEGA]);
    expect(text).toBe("{{artifact: Nothing}}");
    expect(refusal).toContain('"Nothing"');
    expect(refusal).toContain("Glucose by BMI");
  });

  it("refuses a token when nothing has been produced yet", () => {
    expect(resolveArtifacts("{{artifact}}", []).refusal).toContain("No artifact has been produced");
  });

  it("leaves text without a token exactly as written", () => {
    expect(resolveArtifacts("plain content", [VEGA])).toEqual({
      text: "plain content",
      refusal: null,
    });
  });

  it("passes non-string arguments through", () => {
    expect(resolveArtifacts(7, [VEGA])).toEqual({ text: 7, refusal: null });
    expect(resolveArtifacts({ a: 1 }, [VEGA])).toEqual({ text: { a: 1 }, refusal: null });
  });

  it("refuses a token inside a fence rather than nesting it", () => {
    const content = "### Chart\n\n```galaxy\n{{artifact}}\n```\n";
    const { text, refusal } = resolveArtifacts(content, [VEGA]);
    expect(text).toBe(content);
    expect(refusal).toContain("on its own");
    expect(refusal).toContain("fence");
  });

  it("resolves a token after a closed fence", () => {
    const { text, refusal } = resolveArtifacts("```python\nprint(1)\n```\n\n{{artifact}}", [VEGA]);
    expect(refusal).toBeNull();
    expect((text as string).endsWith('```vega\n{\n  "mark": "point"\n}\n```')).toBe(true);
  });

  it.each([
    "````galaxy\n{{artifact}}\n````\n",
    "``````galaxy\n{{artifact}}\n``````\n",
    "~~~galaxy\n{{artifact}}\n~~~\n",
    "   ```galaxy\n{{artifact}}\n   ```\n",
    "````galaxy\n```\n{{artifact}}\n````\n",
    "```galaxy\r\n{{artifact}}\r\n```\r\n",
  ])("holds the token back inside every fence the renderer accepts: %j", (content) => {
    const { text, refusal } = resolveArtifacts(content, [VEGA]);
    expect(text).toBe(content);
    expect(refusal).toContain("on its own");
  });

  it.each([
    "Use a ```vega fence.\n\n{{artifact}}\n",
    "Write `` ``` `` first.\n\n{{artifact}}\n",
    "```galaxy\na ```vega\n```\n\n{{artifact}}",
    "    ```x\n\n{{artifact}}\n",
    "```py\r\nx\r\n```\r\n\r\n{{artifact}}",
  ])("lets backticks outside a fence leave the token resolvable: %j", (content) => {
    const { text, refusal } = resolveArtifacts(content, [VEGA]);
    expect(refusal).toBeNull();
    expect(text).toContain("```vega");
  });
});
