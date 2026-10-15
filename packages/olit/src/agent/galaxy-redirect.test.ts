// @vitest-environment node
/**
 * Redirects as Node's own fetch meets them, against real servers: it keeps `x-api-key` across
 * origins, so the transport must not let a credentialed request leave Galaxy's.
 */

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { galaxyFetch } from "./galaxy";

interface Seen {
  method: string;
  path: string;
  key?: string;
  body: string;
}

let galaxy: Server;
let other: Server;
let galaxyUrl: string;
let otherUrl: string;
let atGalaxy: Seen[];
let atOther: Seen[];

async function seen(req: IncomingMessage): Promise<Seen> {
  let body = "";
  for await (const chunk of req) body += chunk;
  const key = req.headers["x-api-key"] as string | undefined;
  return { method: req.method!, path: req.url!, ...(key ? { key } : {}), body };
}

/** A server answering each path with a redirect to where `routes` sends it, or with its path. */
function serve(log: () => Seen[], routes: () => Record<string, [number, string]>): Server {
  return createServer(async (req, res) => {
    log().push(await seen(req));
    const route = routes()[req.url!];
    if (route) {
      res.writeHead(route[0], { location: route[1] });
      res.end();
    } else {
      res.end(`at ${req.url}`);
    }
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  galaxy = serve(
    () => atGalaxy,
    () => ({
      "/api/moved": [302, "/api/here"],
      "/api/away": [302, `${otherUrl}/steal`],
      "/api/hop": [301, "/api/away"],
      "/api/see-other": [303, "/api/here"],
      "/api/temporary": [307, "/api/here"],
      "/api/loop": [302, "/api/loop"],
    }),
  );
  other = serve(
    () => atOther,
    () => ({}),
  );
  galaxyUrl = await listen(galaxy);
  otherUrl = await listen(other);
});

afterAll(() => {
  galaxy.close();
  other.close();
});

beforeEach(() => {
  atGalaxy = [];
  atOther = [];
});

const keyed = () => galaxyFetch({ root: `${galaxyUrl}/`, key: "galaxy-key" });

describe("an authenticated request redirected", () => {
  it("follows a redirect within Galaxy, the key with it", async () => {
    const response = await keyed()(`${galaxyUrl}/api/moved`);
    expect(await response.text()).toBe("at /api/here");
    expect(atGalaxy.map((s) => [s.path, s.key])).toEqual([
      ["/api/moved", "galaxy-key"],
      ["/api/here", "galaxy-key"],
    ]);
  });

  it("refuses a redirect to another origin, which then receives no request", async () => {
    await expect(keyed()(`${galaxyUrl}/api/away`)).rejects.toThrow(
      `refused a redirect to ${otherUrl}`,
    );
    await expect(keyed()(`${galaxyUrl}/api/hop`)).rejects.toThrow("refused a redirect");
    expect(atOther).toEqual([]);
  });

  it("refuses for any credential a caller sends, not only the key", async () => {
    const send = galaxyFetch({ root: `${galaxyUrl}/`, credentials: "omit" });
    await expect(
      send(`${galaxyUrl}/api/away`, { headers: { Authorization: "Bearer token" } }),
    ).rejects.toThrow("refused a redirect");
    expect(atOther).toEqual([]);
  });

  it("follows a 303 as a GET without the body, and a 307 with method and body kept", async () => {
    const post = {
      method: "POST",
      body: '{"a":1}',
      headers: { "Content-Type": "application/json" },
    };
    await keyed()(`${galaxyUrl}/api/see-other`, post);
    await keyed()(`${galaxyUrl}/api/temporary`, post);
    expect(atGalaxy.map((s) => [s.method, s.path, s.body, s.key])).toEqual([
      ["POST", "/api/see-other", '{"a":1}', "galaxy-key"],
      ["GET", "/api/here", "", "galaxy-key"],
      ["POST", "/api/temporary", '{"a":1}', "galaxy-key"],
      ["POST", "/api/here", '{"a":1}', "galaxy-key"],
    ]);
  });

  it("gives up on a redirect chain that does not end", async () => {
    await expect(keyed()(`${galaxyUrl}/api/loop`)).rejects.toThrow("more than 20 redirects");
    expect(atGalaxy).toHaveLength(21);
  });
});

describe("an unauthenticated request redirected", () => {
  it("is followed as fetch follows it, wherever it leads", async () => {
    const send = galaxyFetch({ root: `${galaxyUrl}/`, credentials: "omit" });
    const response = await send(`${galaxyUrl}/api/away`);
    expect(await response.text()).toBe("at /steal");
    expect(atOther).toEqual([{ method: "GET", path: "/steal", body: "" }]);
  });
});
