import { query, segment } from "../galaxy";
import { generateMermaid } from "./lineage-mermaid";
import type { Process } from "./process";

const DEFAULT_DEPTH = 4;
const DEFAULT_LIMIT = 200;

export const lineageReport: Process = {
  name: "lineage_report",
  description: "Reconstruct a dataset's upstream provenance and render it as a flowchart.",
  whenToUse:
    "when the user asks how a dataset was made, its lineage, provenance, or the steps that produced it",
  capabilities: ["read"],
  inputs: {
    history_id: { type: "string", required: true },
    dataset_id: {
      type: "string",
      required: true,
      help: "Encoded id of the dataset whose provenance is wanted; the graph is walked backward from it.",
    },
    depth: { type: "integer", default: DEFAULT_DEPTH },
    limit: { type: "integer", default: DEFAULT_LIMIT },
    src: {
      type: "string",
      default: "hda",
      help: "Node type of dataset_id: 'hda' for a dataset, 'hdca' for a collection.",
    },
  },
  async run(galaxy, { history_id, dataset_id, depth, limit, src }) {
    const graph = await galaxy.get(
      `api/histories/${segment(history_id)}/graph${query({
        seed_src: src,
        seed_id: dataset_id,
        direction: "backward",
        depth,
        limit,
      })}`,
    );
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    return {
      nodes,
      edges,
      truncated: graph.truncated || {},
      artifact: {
        kind: "mermaid",
        title: "Dataset lineage",
        diagram: generateMermaid(nodes, edges, dataset_id),
      },
    };
  },
};
