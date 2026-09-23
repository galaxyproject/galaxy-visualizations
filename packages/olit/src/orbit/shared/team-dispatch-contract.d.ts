/**
 * Cross-boundary contract for team_dispatch tool-card payloads.
 * The brain (extensions/loom/teams) emits these as the `details` field on
 * tool execution updates; the shell renderer (app/src/renderer/chat) consumes
 * them. Keeping the shape here prevents the two sides from drifting.
 */

export const TEAM_DISPATCH_KIND: "team_dispatch";

export interface TeamDispatchSpecSummary {
  description?: string;
  roles?: Array<{ name: string; model?: string }>;
}

export interface TeamDispatchTurn {
  round: number;
  role: string;
  content?: string;
  approved?: boolean;
}

export interface TeamDispatchDetails {
  kind: typeof TEAM_DISPATCH_KIND;
  spec?: TeamDispatchSpecSummary;
  turns?: TeamDispatchTurn[];
  summary?: string;
  error?: string;
}
