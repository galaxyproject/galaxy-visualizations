// The delegated operations, end to end: the model asks, olit's own tool contract takes the
// call, the bridge hands it to galaxy-ops in the worker, and a real Galaxy answers.
//
// Not in run-all.sh: that points GALAXY_ROOT at the stub, and the point of this one is that a
// real server answers. Run it against a dev server pointed at Galaxy:
//
//   node e2e/stub.cjs &
//   GALAXY_ROOT=http://127.0.0.1:8080 GALAXY_KEY=<key> LLM_PROVIDER=ollama \
//     LLM_ROOT=http://127.0.0.1:8099 LLM_PATH=/v1 LLM_KEY=stub LLM_MODEL=stub-model \
//     LLM_CONTEXT_WINDOW=64000 npx vite &
//   GALAXY_ROOT=http://127.0.0.1:8080 GALAXY_KEY=<key> node e2e/ops-bridge-drive.cjs
//
// The history create_history makes is purged afterwards by the id that call returned, and by
// nothing else: other histories may share its name.
const { chromium } = require("playwright");
const OUT = process.env.OUT || "/tmp";
const APP = process.env.APP_URL || "http://localhost:5173/";
const STUB = "http://127.0.0.1:8099";
const GALAXY = (process.env.GALAXY_ROOT || "").replace(/\/$/, "");
const KEY = process.env.GALAXY_KEY;

/** The id of the history this run's create_history made, read off that call's own result. */
const createdHistory = (results) => {
  for (const one of results) {
    try {
      const data = JSON.parse(String(one).split("\n\n")[0]).data;
      if (data && !Array.isArray(data) && data.name === "olit e2e ops" && data.id) return data.id;
    } catch {
      // not an envelope
    }
  }
  return undefined;
};

/** Purge exactly that history, or say which one is left when there is no key to do it. */
const purge = async (id) => {
  if (!id) return;
  if (!GALAXY || !KEY) {
    console.log(`left history ${id} in place: set GALAXY_ROOT and GALAXY_KEY to purge it`);
    return;
  }
  const res = await fetch(`${GALAXY}/api/histories/${id}`, {
    method: "DELETE",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ purge: true }),
  });
  console.log(`purged the history this run created (${id}): HTTP ${res.status}`);
};

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const waitFor = async (page, fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(500);
  }
  return false;
};

(async () => {
  await fetch(`${STUB}/__script?name=ops-bridge`);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const logs = [];
  p.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));

  await p.goto(APP, { waitUntil: "domcontentloaded" });
  const ready = await waitFor(p, () => /olit ready/i.test(document.body.innerText), 300000);
  check("the agent boots with the galaxy-ops module loaded", ready);
  if (!ready) {
    console.log(logs.slice(-25).join("\n"));
    await b.close();
    process.exit(1);
  }

  await p.fill("textarea", "run the delegated operations");
  await p.keyboard.press("Enter");
  const answered = await waitFor(
    p,
    () => /operations answered/i.test(document.body.innerText),
    180000,
  );
  check("the turn completes through the real loop", answered);

  // Only this turn: the stub keeps what it saw across runs, so earlier results would count.
  const seen = await (await fetch(`${STUB}/__seen`)).json();
  const prompts = seen.prompts || [];
  const tools = (prompts[prompts.length - 1] || {}).toolResults || [];
  const body = tools.map((t) => (typeof t === "string" ? t : JSON.stringify(t))).join("\n");
  check(
    "every delegated operation answered with data",
    tools.length === 5 && !/"data": *null/.test(body),
    `${tools.length} result(s)`,
  );
  check("the answers came from Galaxy, not a stub", /model_class.*History/.test(body));
  check(
    "the richer one carries what its semantics produce",
    /inputs_template/.test(body) && /repeat_key_hint/.test(body),
  );
  check("a paged operation reports the total, not just the page", /"total_items"/.test(body));
  check("the tool panel arrives as entries rather than the whole tree", /"entries"/.test(body) && !/"elems"/.test(body));
  check("a write reached Galaxy through the same bridge", /olit e2e ops/.test(body));
  // Matched against the envelope rather than the payload: a tool's own test cases carry
  // fields named expect_failure, which is data rather than a failure of this call.
  const broke = tools
    .map((t) => (typeof t === "string" ? t : JSON.stringify(t)))
    .filter((one) => /^Refused|needs galaxy-ops|has no operation named|"errorKind"/.test(one));
  check("no operation reported a failure", broke.length === 0, broke.join(" | ").slice(0, 200));
  check(
    "every result is an envelope with data",
    tools.every((t) => {
      try {
        return JSON.parse(String(t).split("\n\n")[0]).data != null;
      } catch {
        return false;
      }
    }),
  );
  await purge(createdHistory(tools));
  await p.screenshot({ path: `${OUT}/ops-bridge.png` });
  console.log(
    logs
      .filter((l) => /galaxy-ops|olitRunOperation|operation/i.test(l))
      .slice(0, 5)
      .join("\n"),
  );
  await b.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
