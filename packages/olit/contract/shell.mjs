// The follow-up contract the shell holds, answered by the shell itself.
//
// A harness standing in for the browser has to send what the browser would send, so it asks
// `src/auto-resume.ts` rather than reading it: the settled runs go in as JSON on stdin, and
// the message that comes back is the one the shell would deliver.
//
//   node --experimental-strip-types contract/shell.mjs < runs.json
import { readFileSync } from "node:fs";

import { DEFAULT_MAX_AUTO_FOLLOW_UPS, buildResumePrompt } from "../src/auto-resume.ts";

const stdin = process.stdin.isTTY ? "" : readFileSync(0, "utf8").trim();
const runs = stdin ? JSON.parse(stdin) : null;

process.stdout.write(
  JSON.stringify({
    max_auto_follow_ups: DEFAULT_MAX_AUTO_FOLLOW_UPS,
    resume_prompt: runs ? buildResumePrompt(runs) : null,
  }),
);
