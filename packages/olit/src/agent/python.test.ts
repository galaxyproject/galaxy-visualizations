/** The trusted side of run_python: what the realm sends back is data, and only Pyodide is served. */

import { afterEach, describe, expect, it, vi } from "vitest";

import { realmPython, serveAsset, type Channel } from "./python";

/** A realm the test speaks for: what the client sent, and a way to answer as the realm. */
function fakeRealm() {
  const sent: any[] = [];
  let receive: (message: unknown) => void = () => undefined;
  let exit: (reason: string) => void = () => undefined;
  let opened = 0;
  const open = (): Channel => {
    opened++;
    return {
      send: (message) => sent.push(message),
      listen: (onMessage, onExit) => {
        receive = onMessage;
        exit = onExit;
      },
      close: () => exit("was stopped"),
    };
  };
  return {
    open,
    sent,
    opened: () => opened,
    reply: (message: unknown) => receive(message),
    exit: (reason: string) => exit(reason),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("realmPython", () => {
  it("answers a call with the realm's reply to it", async () => {
    const realm = fakeRealm();
    const python = realmPython(realm.open);
    const out = python.run("1 + 1");
    realm.reply({ id: realm.sent[0].id, ok: true, value: "2" });
    expect(await out).toBe("2");
    expect(realm.sent[0]).toMatchObject({ op: "run", code: "1 + 1" });
  });

  it("ignores a reply to a request it never made", async () => {
    const realm = fakeRealm();
    const python = realmPython(realm.open);
    const out = python.run("x");
    realm.reply({ id: 999, ok: true, value: "forged" });
    realm.reply({ id: realm.sent[0].id, ok: true, value: "real" });
    expect(await out).toBe("real");
  });

  it("refuses a reply of the wrong shape", async () => {
    const realm = fakeRealm();
    const python = realmPython(realm.open);
    const run = python.run("x");
    realm.reply({ id: realm.sent[0].id, ok: true, value: { not: "text" } });
    await expect(run).rejects.toThrow(/not its output/);
    const read = python.read("/a");
    realm.reply({ id: realm.sent[1].id, ok: true, value: "text, not bytes" });
    await expect(read).rejects.toThrow(/not the bytes/);
  });

  it("fails what was in flight when the realm goes, and starts a fresh one next", async () => {
    const realm = fakeRealm();
    const python = realmPython(realm.open);
    const out = python.run("while True: pass");
    realm.exit("exited (1)");
    await expect(out).rejects.toThrow(/Python exited \(1\); its state was reset/);
    void python.run("1");
    expect(realm.opened()).toBe(2);
  });

  it("ends the realm when the run is aborted, and starts a fresh one next", async () => {
    const realm = fakeRealm();
    const python = realmPython(realm.open);
    const controller = new AbortController();
    const out = python.run("while True: pass", controller.signal);
    controller.abort();
    await expect(out).rejects.toThrow(/Python was stopped; its state was reset/);
    void python.run("1");
    expect(realm.opened()).toBe(2);
    await expect(python.run("1", controller.signal)).rejects.toThrow();
    expect(realm.opened()).toBe(2);
  });

  it("hands an asset request to the host and nothing else", async () => {
    const realm = fakeRealm();
    const onAsset = vi.fn();
    const python = realmPython(realm.open, onAsset);
    void python.run("x");
    realm.reply({ op: "asset", id: 0, url: "https://g/static/pyodide/pyodide.asm.wasm" });
    realm.reply({ op: "confirm", id: 0 });
    await tick();
    expect(onAsset).toHaveBeenCalledTimes(1);
  });
});

describe("serveAsset", () => {
  const INDEX = "https://galaxy.example/static/pyodide/";
  afterEach(() => vi.unstubAllGlobals());

  async function serve(url: unknown) {
    const fetched: [string, RequestInit][] = [];
    vi.stubGlobal("fetch", async (href: string, init: RequestInit) => {
      fetched.push([href, init]);
      return new Response("bytes", { headers: { "content-type": "application/wasm" } });
    });
    const sent: any[] = [];
    await serveAsset(INDEX, { id: 7, url }, { send: (message) => sent.push(message) });
    return { fetched, reply: sent[0] };
  }

  it("fetches a file under Pyodide's directory without credentials", async () => {
    const { fetched, reply } = await serve(`${INDEX}pyodide.asm.wasm`);
    expect(fetched).toEqual([[`${INDEX}pyodide.asm.wasm`, { credentials: "omit" }]]);
    expect(reply).toMatchObject({ op: "asset", id: 7, ok: true, status: 200 });
    expect(reply.type).toBe("application/wasm");
  });

  it("refuses anything else, however the path is spelled", async () => {
    for (const url of [
      "https://galaxy.example/api/users/current",
      `${INDEX}../../api/histories`,
      `${INDEX}%2e%2e/%2e%2e/api/histories`,
      "https://galaxy.example/static/pyodide-evil/x",
      "not a url",
      42,
    ]) {
      const { fetched, reply } = await serve(url);
      expect(fetched, String(url)).toEqual([]);
      expect(reply).toMatchObject({ op: "asset", id: 7, ok: false });
    }
  });
});
