import { describe, expect, it, vi } from "vitest";

let refusal: Error = new Error();
vi.mock("@sqlite.org/sqlite-wasm", () => ({
  default: async () => ({
    installOpfsSAHPoolVfs: async () => {
      throw refusal;
    },
  }),
}));

const { openStorage } = await import("./storage");

describe("storage the browser will not keep", () => {
  it("says the browser refuses site storage when that is why", async () => {
    refusal = new DOMException("The operation is insecure.", "SecurityError");
    const { unkept } = await openStorage("olit-u1");
    expect(unkept).toMatch(/^the browser refuses this site storage/);
  });

  it("passes any other failure on as it was raised", async () => {
    refusal = new DOMException("A requested file was not found.", "NotFoundError");
    const { unkept } = await openStorage("olit-u1");
    expect(unkept).toBe("NotFoundError: A requested file was not found.");
  });
});
