import { describe, expect, it } from "vitest";

import { groupDatasets } from "./dataset-grouping";

const ds = (name: string, i?: number) => ({ id: `id_${i ?? name}`, name });
const names = (files: string[]) => files.map((f, i) => ds(f, i));
const elementNames = (out: ReturnType<typeof groupDatasets>) => out.elements.map((e) => e.name);

const SRA = [1, 2, 3].flatMap((n) => [1, 2].map((m) => `SRR100${n}_${m}.fastq.gz`));
const ILLUMINA = [1, 2].flatMap((n) => [1, 2].map((m) => `sample${n}_R${m}_001.fastq.gz`));
const ZIP_FLAT = [1, 2, 3, 4].map((n) => `reads/run_${n}.fastq.gz`);

describe("pairing", () => {
  it("pairs SRA names into list:paired", () => {
    const out = groupDatasets({ datasets: names(SRA) });
    expect(out.structure).toBe("list:paired");
    expect(elementNames(out)).toEqual(["SRR1001", "SRR1002", "SRR1003"]);
    expect(out.unmatched).toEqual([]);
  });

  it("pairs Illumina R1/R2", () => {
    const out = groupDatasets({ datasets: names(ILLUMINA) });
    expect(out.structure).toBe("list:paired");
    expect(elementNames(out)).toEqual(["sample1_001", "sample2_001"]);
  });

  it("builds a pair as a nested collection the API accepts", () => {
    const element = groupDatasets({ datasets: [ds("s_R1.fastq.gz", 0), ds("s_R2.fastq.gz", 1)] })
      .elements[0];
    expect(element.src).toBe("new_collection");
    expect(element.collection_type).toBe("paired");
    expect(element.element_identifiers).toEqual([
      { name: "forward", src: "hda", id: "id_0" },
      { name: "reverse", src: "hda", id: "id_1" },
    ]);
  });

  it("points a flat element straight at the dataset", () => {
    const out = groupDatasets({ datasets: names(["s0.fastq.gz", "s1.fastq.gz"]) });
    expect(out.elements[0]).toEqual({ name: "s0.fastq.gz", src: "hda", id: "id_0" });
  });

  it("does not mistake run numbers for mates", () => {
    const out = groupDatasets({ datasets: names(ZIP_FLAT) });
    expect(out.structure).toBe("list");
    expect(out.elements).toHaveLength(4);
    expect(out.unmatched).toEqual([]);
  });

  it("names a half pair as a leftover", () => {
    const out = groupDatasets({ datasets: names(["s1_R1.fq.gz", "s1_R2.fq.gz", "s2_R1.fq.gz"]) });
    expect(out.structure).toBe("list:paired");
    expect(elementNames(out)).toEqual(["s1"]);
    expect(out.unmatched).toEqual(["s2_R1.fq.gz"]);
    expect(out.has_leftovers).toBe(true);
  });

  it("makes a non-read file a leftover", () => {
    const out = groupDatasets({ datasets: names(["a_R1.fastq.gz", "a_R2.fastq.gz", "notes.txt"]) });
    expect(out.structure).toBe("list:paired");
    expect(out.unmatched).toEqual(["notes.txt"]);
  });

  it("pairs only when more than half the files sit in complete pairs", () => {
    const files = (extra: number) =>
      names([...ILLUMINA, ...Array.from({ length: extra }, (_, i) => `other${i}.fastq.gz`)]);
    expect(groupDatasets({ datasets: files(3) }).structure).toBe("list:paired");
    expect(groupDatasets({ datasets: files(4) }).structure).toBe("list");
  });

  it("forces pairing past the majority rule with structure paired", () => {
    const out = groupDatasets({
      datasets: names(["a.fq", "b.fq", "c.fq", "s_1.fq", "s_2.fq"]),
      structure: "paired",
    });
    expect(out.structure).toBe("list:paired");
    expect(elementNames(out)).toEqual(["s"]);
    expect(out.unmatched).toEqual(["a.fq", "b.fq", "c.fq"]);
  });

  it("prefers R1 over a trailing 1 on the same name", () => {
    expect(
      elementNames(groupDatasets({ datasets: names(["lane1_R1.fastq.gz", "lane1_R2.fastq.gz"]) })),
    ).toEqual(["lane1"]);
  });

  it("reports empty input as empty", () => {
    const out = groupDatasets({ datasets: [] });
    expect(out.empty).toBe(true);
    expect(out.elements).toEqual([]);
  });
});

describe("archive members", () => {
  it("pairs a zip of paired reads", () => {
    const out = groupDatasets({ datasets: names(SRA.map((n) => `run/${n}`)) });
    expect(out.structure).toBe("list:paired");
    expect(elementNames(out)).toEqual(["SRR1001", "SRR1002", "SRR1003"]);
  });

  it("lists a zip of single-end reads", () => {
    const out = groupDatasets({ datasets: names([0, 1, 2].map((n) => `reads/s${n}.fastq.gz`)) });
    expect(out.structure).toBe("list");
    expect(elementNames(out)).toEqual(["s0.fastq.gz", "s1.fastq.gz", "s2.fastq.gz"]);
  });

  it("keeps nested directories out of the identifiers", () => {
    const out = groupDatasets({
      datasets: names(["a/b/c/SRR1_R1.fastq.gz", "a/b/c/SRR1_R2.fastq.gz"]),
    });
    expect(elementNames(out)).toEqual(["SRR1"]);
  });

  it("keeps the odd member of an archive holding both shapes", () => {
    const out = groupDatasets({ datasets: names(["p_R1.fastq.gz", "p_R2.fastq.gz", "notes.txt"]) });
    expect(out.structure).toBe("list:paired");
    expect(out.unmatched).toEqual(["notes.txt"]);
  });
});

describe("scope", () => {
  it("puts a non-read file beyond reach with include", () => {
    const out = groupDatasets({
      datasets: names(["a_R1.fastq.gz", "a_R2.fastq.gz", "notes.txt"]),
      include: "*.fastq.gz",
    });
    expect(out.out_of_scope).toEqual(["notes.txt"]);
    expect(out.unmatched).toEqual([]);
    expect(out.has_leftovers).toBe(false);
    expect(out.items).toHaveLength(2);
  });

  it("covers leftovers in items so a datatype write reaches them", () => {
    expect(
      groupDatasets({ datasets: names(["s1_R1.fq.gz", "s1_R2.fq.gz", "s2_R1.fq.gz"]) }).items,
    ).toHaveLength(3);
  });
});

describe("evidence for pairing", () => {
  it("does not marry two unrelated samples into a pair", () => {
    const out = groupDatasets({ datasets: names(["patient_1.fastq.gz", "patient_2.fastq.gz"]) });
    expect(out.structure).toBe("list");
    expect(elementNames(out)).toEqual(["patient_1.fastq.gz", "patient_2.fastq.gz"]);
  });

  it("pairs a single sample on an explicit marker", () => {
    const out = groupDatasets({ datasets: names(["patient_R1.fastq.gz", "patient_R2.fastq.gz"]) });
    expect(out.structure).toBe("list:paired");
    expect(elementNames(out)).toEqual(["patient"]);
  });

  it("pairs a bare marker once a second sample shows the convention", () => {
    const out = groupDatasets({ datasets: names(["a_1.fq", "a_2.fq", "b_1.fq", "b_2.fq"]) });
    expect(out.structure).toBe("list:paired");
    expect(elementNames(out)).toEqual(["a", "b"]);
  });

  it("lets structure paired override the evidence rule", () => {
    expect(
      groupDatasets({ datasets: names(["patient_1.fq", "patient_2.fq"]), structure: "paired" })
        .structure,
    ).toBe("list:paired");
  });

  it("recognises word markers", () => {
    for (const [forward, reverse] of [
      ["forward", "reverse"],
      ["fwd", "rev"],
      ["read1", "read2"],
    ]) {
      const out = groupDatasets({ datasets: names([`s_${forward}.fq`, `s_${reverse}.fq`]) });
      expect(out.structure).toBe("list:paired");
      expect(elementNames(out)).toEqual(["s"]);
    }
  });
});

describe("identifier collisions", () => {
  it("pairs per-sample directories without colliding", () => {
    const members = [1, 2, 3].flatMap((k) => [1, 2].map((m) => `Sample${k}/reads_R${m}.fq.gz`));
    const out = groupDatasets({ datasets: names(members) });
    expect(out.structure).toBe("list:paired");
    expect(elementNames(out)).toEqual(["Sample1_reads", "Sample2_reads", "Sample3_reads"]);
  });

  it("qualifies a flat list of colliding names by directory", () => {
    expect(
      elementNames(groupDatasets({ datasets: names(["A/notes.txt", "B/notes.txt"]) })),
    ).toEqual(["A_notes.txt", "B_notes.txt"]);
  });

  it("keeps identifiers unique across every layout", () => {
    const layouts = [
      [1, 2, 3].flatMap((n) => [1, 2].map((m) => `SRR100${n}_${m}.fastq.gz`)),
      [1, 2, 3].flatMap((n) => [1, 2].map((m) => `S${n}_S1_L001_R${m}_001.fastq.gz`)),
      [1, 2].flatMap((k) => [1, 2].map((m) => `Sample${k}/reads_R${m}.fq.gz`)),
      [1, 2].flatMap((k) => [1, 2].flatMap((n) => [1, 2].map((m) => `lane${k}/S${n}_R${m}.fq`))),
      ["A/notes.txt", "B/notes.txt", "C/notes.txt"],
    ];
    for (const layout of layouts) {
      const identifiers = elementNames(groupDatasets({ datasets: names(layout) }));
      expect(new Set(identifiers).size).toBe(identifiers.length);
    }
  });
});

describe("the caller-supplied pattern", () => {
  it("pairs a convention the rules cannot infer", () => {
    const out = groupDatasets({
      datasets: names([
        "A01_fwd_seq.fq.gz",
        "A01_rev_seq.fq.gz",
        "A02_fwd_seq.fq.gz",
        "A02_rev_seq.fq.gz",
      ]),
      sampleRegex: "(?P<sample>[A-Z]\\d+)_(?P<mate>fwd|rev)_seq",
    });
    expect(out.structure).toBe("list:paired");
    expect(elementNames(out)).toEqual(["A01", "A02"]);
  });

  it("can take the sample from the directory", () => {
    const out = groupDatasets({
      datasets: names([
        "donorA/part1.fq.gz",
        "donorA/part2.fq.gz",
        "donorB/part1.fq.gz",
        "donorB/part2.fq.gz",
      ]),
      sampleRegex: "(?P<sample>[^/]+)/part(?P<mate>[12])",
    });
    expect(elementNames(out)).toEqual(["donorA", "donorB"]);
  });

  it("forces nothing when the pattern's mates are not mates", () => {
    const out = groupDatasets({
      datasets: names(["only_a.fq", "only_b.fq"]),
      sampleRegex: "(?P<sample>only)_(?P<mate>[ab])",
    });
    expect(out.structure).toBe("list");
  });

  it("makes a file the pattern misses a leftover, not a guess", () => {
    const out = groupDatasets({
      datasets: names(["good_R1.fq", "good_R2.fq", "stray.txt"]),
      sampleRegex: "(?P<sample>\\w+)_(?P<mate>R[12])",
    });
    expect(out.unmatched).toEqual(["stray.txt"]);
  });

  it("says so when the pattern is broken", () => {
    expect(() => groupDatasets({ datasets: names(["a.fq"]), sampleRegex: "(?P<sample>" })).toThrow(
      /not a valid regular expression/,
    );
  });
});

describe("structure names", () => {
  it("accepts Galaxy's own name for a paired list", () => {
    const datasets = [1, 2].flatMap((s) =>
      [1, 2].map((m) => ({
        name: `S${s}_${m}.fasta.gz`,
        id: `${s}${m}`,
        extension: "fasta.gz",
        history_content_type: "dataset",
      })),
    );
    expect(groupDatasets({ datasets, structure: "list:paired" }).structure).toBe("list:paired");
  });

  it("refuses an unknown structure rather than quietly flattening", () => {
    expect(() => groupDatasets({ datasets: [], structure: "nonsense" })).toThrow(
      'structure must be "auto", "paired" or "list", not "nonsense"',
    );
  });
});
