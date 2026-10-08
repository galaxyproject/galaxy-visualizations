import { describe, expect, it, vi } from "vitest";

import { createConfirm } from "./confirm-modal";

function modal() {
  const container = document.createElement("div");
  container.innerHTML =
    '<div id="ext-overlay" class="hidden"><div id="ext-title"></div><div id="ext-message"></div>' +
    '<button id="ext-accept"></button><button id="ext-deny"></button></div>';
  const respond = vi.fn();
  const note = vi.fn();
  const confirm = createConfirm({ container, respond, note });
  const $ = (id: string) => container.querySelector<HTMLElement>(id)!;
  const open = () => !$("#ext-overlay").classList.contains("hidden");
  return { confirm, respond, note, open, accept: () => $("#ext-accept").click(), $ };
}

describe("the confirmation modal", () => {
  it("takes down a confirmation the agent withdrew, without answering it", () => {
    const { confirm, respond, note, open, accept } = modal();
    confirm.show("1", { title: "Confirm", message: "Delete history h1" });
    confirm.dismiss("1");
    expect(open()).toBe(false);
    accept();
    expect(respond).not.toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();
  });

  it("keeps a newer confirmation when an older one is withdrawn late", () => {
    const { confirm, respond, open, accept, $ } = modal();
    confirm.show("1", { message: "Delete history h1" });
    accept();
    confirm.show("2", { message: "Delete history h2" });
    confirm.dismiss("1");
    expect(open()).toBe(true);
    expect($("#ext-message").textContent).toBe("Delete history h2");
    accept();
    expect(respond.mock.calls).toEqual([
      ["1", true],
      ["2", true],
    ]);
  });
});
