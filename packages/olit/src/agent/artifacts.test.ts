import { describe, expect, it } from "vitest";

import { render, RENDERERS, resolveArtifacts } from "./artifacts";

const VEGA = { kind: "vega-lite", title: "Glucose by BMI", spec: { mark: "point" } };
const LINEAGE = { kind: "mermaid", title: "Dataset lineage", diagram: "graph TD;\nA-->B;" };

describe("rendering an artifact", () => {
  it("makes a vega artifact a vega cell holding its spec", () => {
    const out = render(VEGA)!;
    expect(out.startsWith("```vega\n") && out.endsWith("\n```")).toBe(true);
    expect(JSON.parse(out.slice("```vega\n".length, -"\n```".length))).toEqual({ mark: "point" });
  });

  it("makes a mermaid artifact a mermaid cell", () => {
    expect(render(LINEAGE)).toBe("```mermaid\ngraph TD;\nA-->B;\n```");
  });

  it("makes a visualization a galaxy directive naming the plugin and dataset", () => {
    const viz = { kind: "visualization", title: "t", visualization: "atlas", dataset_id: "d1" };
    expect(render(viz)).toBe(
      "```galaxy\nvisualization(visualization_id=atlas, history_dataset_id=d1)\n```",
    );
  });

  it("has a renderer for every artifact olit produces", () => {
    expect(Object.keys(RENDERERS)).toEqual(
      expect.arrayContaining(["vega-lite", "visualization", "mermaid"]),
    );
  });
});

describe("resolving tokens", () => {
  it("refuses a kind with no renderer rather than writing it broken", () => {
    const { text, refusal } = resolveArtifacts("{{artifact}}", [{ kind: "hologram", title: "x" }]);
    expect(text).toBe("{{artifact}}");
    expect(refusal).toContain('"hologram"');
    expect(refusal).toContain("mermaid");
  });

  it("keeps the prose around the token", () => {
    const { text, refusal } = resolveArtifacts("Before.\n\n{{artifact}}\n\nAfter.", [VEGA]);
    expect(refusal).toBeNull();
    expect((text as string).startsWith("Before.\n\n```vega")).toBe(true);
    expect((text as string).endsWith("```\n\nAfter.")).toBe(true);
  });

  it("takes the most recent artifact for a bare token", () => {
    const { text } = resolveArtifacts("{{artifact}}", [VEGA, LINEAGE]);
    expect((text as string).startsWith("```mermaid")).toBe(true);
  });

  it("takes the one a titled token names", () => {
    const { text } = resolveArtifacts("{{artifact: Glucose by BMI}}", [VEGA, LINEAGE]);
    expect((text as string).startsWith("```vega")).toBe(true);
  });

  it("resolves several tokens in one write", () => {
    const { text, refusal } = resolveArtifacts(
      "{{artifact: Dataset lineage}}\n{{artifact: Glucose by BMI}}",
      [VEGA, LINEAGE],
    );
    expect(refusal).toBeNull();
    expect((text as string).indexOf("```mermaid")).toBeLessThan(
      (text as string).indexOf("```vega"),
    );
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
