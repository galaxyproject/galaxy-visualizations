import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** pi's named prompt sections Olit refreshes every turn. */
export const CONTEXT_SECTION = "context";
export const RECORD_SECTION = "record";

type Sectioned = { role: "system"; sections?: Record<string, string | null> };
export const sectionsOf = (m: AgentMessage) =>
  m.role === "system" ? ((m as unknown as Sectioned).sections ?? {}) : {};

/** A system message that only updates the record section: the excerpt of an earlier turn. */
export const isRecordUpdate = (m: AgentMessage) => RECORD_SECTION in sectionsOf(m);
