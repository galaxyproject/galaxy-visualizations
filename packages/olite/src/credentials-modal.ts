/** Provider/model/key picker. Mirrors Orbit's BYO-key overlay behaviour. */

import {
    credentialProblem,
    loadCredentials,
    providerById,
    providers,
    saveCredentials,
    type Credentials,
} from "./credentials";

const MARKUP = `
<div id="cred-overlay" class="modal-overlay hidden">
  <div class="modal">
    <div class="modal-header"><h2>Connect a model</h2></div>
    <div class="modal-body">
      <div class="cred-field">
        <label for="cred-provider">Provider</label>
        <select id="cred-provider"></select>
      </div>
      <div class="cred-field" id="cred-model-field">
        <label for="cred-model">Model</label>
        <select id="cred-model"></select>
        <input id="cred-model-text" type="text" placeholder="Model name" class="hidden" />
      </div>
      <div class="cred-field" id="cred-key-field">
        <label for="cred-key">API key</label>
        <input id="cred-key" type="password" autocomplete="off" spellcheck="false"
               placeholder="Paste your key" />
        <p class="cred-note">Kept in this browser tab only. It is never sent to or stored by Galaxy.</p>
      </div>
      <div id="cred-error" class="cred-error"></div>
    </div>
    <div class="modal-footer">
      <div class="modal-actions"><button id="cred-save" class="plan-btn primary">Connect</button></div>
    </div>
  </div>
</div>`;

/**
 * Resolve with usable credentials, showing the overlay only when what we have
 * cannot work. Rejecting up front beats starting a brain that dies on its first
 * request, and the overlay stays up on a bad entry rather than stranding the
 * user in front of an agent that never connected.
 *
 * `cancellable` is only safe when a working selection already exists to fall back
 * on: dismissing the first-run picker would leave the brain with no key at all.
 * Resolves null when dismissed.
 */
function openPicker(container: HTMLElement, cancellable: boolean): Promise<Credentials | null> {
    const stored = loadCredentials();

    container.insertAdjacentHTML("beforeend", MARKUP);
    const overlay = container.querySelector<HTMLElement>("#cred-overlay")!;
    const providerSel = container.querySelector<HTMLSelectElement>("#cred-provider")!;
    const modelSel = container.querySelector<HTMLSelectElement>("#cred-model")!;
    const modelText = container.querySelector<HTMLInputElement>("#cred-model-text")!;
    const modelField = container.querySelector<HTMLElement>("#cred-model-field")!;
    const keyField = container.querySelector<HTMLElement>("#cred-key-field")!;
    const keyInput = container.querySelector<HTMLInputElement>("#cred-key")!;
    const errorEl = container.querySelector<HTMLElement>("#cred-error")!;
    const saveBtn = container.querySelector<HTMLButtonElement>("#cred-save")!;

    for (const p of providers) {
        providerSel.add(new Option(p.name, p.id));
    }
    if (stored?.provider) providerSel.value = stored.provider;

    // Only the fields the chosen provider actually uses: a key box for an
    // endpoint that takes no key invites a user to paste one nothing reads.
    function syncFields() {
        const p = providerById(providerSel.value);
        if (!p) return;
        keyField.classList.toggle("hidden", !p.needs_key);
        const freeform = p.free_model || p.models.length === 0;
        modelField.classList.toggle("hidden", p.models.length === 0 && !p.free_model);
        modelSel.classList.toggle("hidden", freeform);
        modelText.classList.toggle("hidden", !freeform);
        modelSel.innerHTML = "";
        for (const m of p.models) modelSel.add(new Option(m.id, m.id));
        if (stored?.model && p.models.some((m) => m.id === stored.model)) {
            modelSel.value = stored.model;
        }
    }
    providerSel.addEventListener("change", syncFields);
    syncFields();

    overlay.classList.remove("hidden");
    keyInput.focus();

    return new Promise<Credentials | null>((resolve) => {
        const close = (value: Credentials | null) => {
            document.removeEventListener("keydown", onKey, true);
            overlay.classList.add("hidden");
            overlay.remove();
            resolve(value);
        };
        // Escape and a backdrop click mean "leave things as they were", matching the
        // confirm modal. Captured so Escape answers this and not the Stop handler.
        const onKey = (e: KeyboardEvent) => {
            if (cancellable && e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close(null);
            }
        };
        if (cancellable) {
            document.addEventListener("keydown", onKey, true);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) close(null);
            });
        }
        const submit = () => {
            const p = providerById(providerSel.value);
            const freeform = !!p && (p.free_model || p.models.length === 0);
            const creds: Credentials = {
                provider: providerSel.value,
                model: (freeform ? modelText.value : modelSel.value).trim() || undefined,
                apiKey: keyInput.value.trim() || undefined,
            };
            const problem = credentialProblem(creds);
            if (problem) {
                errorEl.textContent = problem;
                return;
            }
            saveCredentials(creds);
            close(creds);
        };
        saveBtn.addEventListener("click", submit);
        overlay.addEventListener("keydown", (e) => {
            if ((e as KeyboardEvent).key === "Enter") {
                e.preventDefault();
                submit();
            }
        });
    });
}

/**
 * Reopen the picker so the provider can be changed after boot. The worker takes
 * its config at initialize, so the new choice is applied by reloading rather than
 * re-initializing a live brain. Conversation history lives in IndexedDB and is
 * restored on the way back up, so switching models does not discard it.
 */
export async function switchProvider(container: HTMLElement): Promise<void> {
    const before = JSON.stringify(loadCredentials());
    const picked = await openPicker(container, true);
    // Dismissed, or re-picked the same thing: nothing to apply, so do not reload.
    if (!picked || JSON.stringify(picked) === before) return;
    window.location.reload();
}

/** First-run entry point. Not dismissible: there is nothing to fall back to. */
export async function ensureCredentials(container: HTMLElement): Promise<Credentials> {
    const stored = loadCredentials();
    if (stored && !credentialProblem(stored)) return stored;
    // Dev override, as in config.ts: the vite proxy attaches the key, so there is nothing
    // to ask for. A deployed build has no LLM_PROVIDER and always shows the picker.
    const provider = process.env.llm_provider as string | undefined;
    if (provider) return { provider, model: process.env.llm_model as string | undefined };
    return (await openPicker(container, false)) as Credentials;
}
