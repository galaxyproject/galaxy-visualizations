const JOB_SRC = "job";

interface Ref {
  src?: string;
  id?: string;
}

export interface GraphNode extends Ref {
  name?: string;
  tool_name?: string;
  tool_id?: string;
}

export interface GraphEdge {
  source?: Ref;
  target?: Ref;
}

/** Render a history graph's nodes and edges as a Mermaid flowchart. */
export function generateMermaid(
  nodes: GraphNode[] = [],
  edges: GraphEdge[] = [],
  seedId?: string,
): string {
  const lines = ["flowchart TD"];
  for (const n of nodes) {
    const label = n.name || n.tool_name || n.tool_id || n.id;
    const text = mermaidLabel(`${n.id === seedId ? "*" : ""}${label}`);
    lines.push(`    ${nodeId(n.src, n.id)}${n.src === JOB_SRC ? `(["${text}"])` : `["${text}"]`}`);
  }
  for (const e of edges) {
    const source = e.source || {};
    const target = e.target || {};
    if (!source.id || !target.id) {
      continue;
    }
    lines.push(`    ${nodeId(source.src, source.id)} --> ${nodeId(target.src, target.id)}`);
  }
  return lines.join("\n");
}

/** A quote in its entity form, so it stays label text. */
function mermaidLabel(text: string): string {
  return text.replace(/[\s`]+/g, " ").replaceAll('"', "#quot;");
}

/** A Mermaid-safe identifier; src keeps hda and hdca ids from colliding. */
function nodeId(src: string | undefined, raw: unknown): string {
  return `${src || "n"}_${String(raw).replace(/[^\p{L}\p{N}]/gu, "_")}`;
}
