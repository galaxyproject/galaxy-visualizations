import type { Galaxy } from "../galaxy";
import type { Capability } from "../tool";

export type State = Record<string, any>;

export interface Input {
  type: "string" | "integer" | "number" | "boolean" | "array";
  required?: boolean;
  default?: string | number | boolean;
  help?: string;
}

/** A deterministic procedure the loop can invoke, advertised as a tool named after it. */
export interface Process {
  name: string;
  description: string;
  whenToUse: string;
  capabilities: Capability[];
  inputs: Record<string, Input>;
  run(galaxy: Galaxy, args: Record<string, any>): Promise<State>;
  /** How this process reduces its own state for the model. */
  summarize?(state: State): State | null;
}
