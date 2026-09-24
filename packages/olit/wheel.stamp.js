/**
 * Give the brain wheel a filename that changes when its contents do.
 *
 * The wheel's version is `0.0.0` and never moves, so every build produced the same
 * URL. A browser that had fetched one kept serving it, and the shell then ran a brain
 * it was not built with: an e2e run failed on a capability the wheel on disk granted.
 * The same hazard applies to a redeployed plugin, where the URL is identical too.
 *
 * The content hash goes in the wheel's build-tag position, which is part of the
 * filename and absent from the metadata, so nothing inside the wheel has to change.
 * PEP 427 requires a build tag to start with a digit, hence the leading zero.
 * The build pins SOURCE_DATE_EPOCH so identical sources hash identically, which is what
 * makes the tag mean content rather than build time.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "brain", "dist");
const STAMPED = /^olit-.*-0[0-9a-f]{12}-py3-none-any\.whl$/;

function main() {
  const wheels = readdirSync(DIST).filter((f) => f.startsWith("olit-") && f.endsWith(".whl"));
  if (wheels.length !== 1) {
    throw new Error(`Expected one brain wheel under brain/dist, found ${wheels.length}.`);
  }
  const [wheel] = wheels;
  if (STAMPED.test(wheel)) {
    console.log(`brain wheel already stamped: ${wheel}`);
    return;
  }
  const digest = createHash("sha256")
    .update(readFileSync(join(DIST, wheel)))
    .digest("hex");
  const tag = `0${digest.slice(0, 12)}`;
  // olit-<version>-<tag>-py3-none-any.whl
  const stamped = wheel.replace(/^(olit-[^-]+)-/, `$1-${tag}-`);
  renameSync(join(DIST, wheel), join(DIST, stamped));
  console.log(`brain wheel stamped: ${stamped}`);
}

main();
