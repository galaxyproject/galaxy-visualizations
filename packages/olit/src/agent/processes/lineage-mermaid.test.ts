import { expect, it } from "vitest";

import { generateMermaid } from "./lineage-mermaid";

it("keeps a quote in a name from ending the label", () => {
  const diagram = generateMermaid(
    [{ src: "hda", id: "d1", name: 'reads "run 2".fastq' }],
    [],
    "d1",
  );
  expect(diagram).toContain('hda_d1["*reads #quot;run 2#quot;.fastq"]');
  expect(diagram.split('"').length - 1).toBe(2);
});

it("keeps a name on one line and out of reach of the fence", () => {
  const diagram = generateMermaid([{ src: "hda", id: "d1", name: "a\n```\n# b" }], [], "d1");
  expect(diagram).toContain('hda_d1["*a # b"]');
  expect(diagram).not.toContain("`");
});

it("gives jobs and datasets their shapes and edges", () => {
  const nodes = [
    { src: "hda", id: "a", name: "in" },
    { src: "job", id: "j", tool_name: "cat" },
    { src: "hda", id: "b", name: "out" },
  ];
  const edges = [
    { source: { src: "hda", id: "a" }, target: { src: "job", id: "j" } },
    { source: { src: "job", id: "j" }, target: { src: "hda", id: "b" } },
  ];
  const diagram = generateMermaid(nodes, edges, "b");
  expect(diagram).toContain('job_j(["cat"])');
  expect(diagram).toContain("hda_a --> job_j");
  expect(diagram).toContain("job_j --> hda_b");
  expect(diagram).toContain('hda_b["*out"]');
});
