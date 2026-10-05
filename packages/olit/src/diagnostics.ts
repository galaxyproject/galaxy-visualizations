/** What a turn's diagnostics say, and what the shell decides from them. */
import { GALAXY_UNREACHABLE, type GalaxyStatus } from "./agent/prompt";

export interface Diagnostics {
  galaxy?: GalaxyStatus;
  capabilities?: string[];
}

/** Whether a plan can start; unreported means the agent has not answered yet. */
export function galaxyCanRun(galaxy: GalaxyStatus | null | undefined): boolean {
  return galaxy !== GALAXY_UNREACHABLE;
}

export function galaxyRefusalMessage(): string {
  return (
    "Galaxy did not answer, so nothing in this plan can run. Check that the server is up and " +
    "reload the page — the plan is kept."
  );
}
