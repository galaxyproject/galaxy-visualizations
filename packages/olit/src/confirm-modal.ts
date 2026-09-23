/** Orbit's confirmation modal, reduced to the yes/no the destructive gate needs. */

export interface ConfirmDeps {
    container: HTMLElement;
    /** Answer the brain, resuming the parked turn. */
    respond: (confirmId: string, approved: boolean) => void;
    /** Say in chat what was decided. */
    note: (text: string) => void;
}

/** Bind the modal and return the handler to hand the Pyodide manager. */
export function createConfirm(deps: ConfirmDeps) {
    const { container } = deps;
    const overlay = container.querySelector<HTMLElement>("#ext-overlay")!;
    const title = container.querySelector<HTMLElement>("#ext-title")!;
    const message = container.querySelector<HTMLElement>("#ext-message")!;
    const accept = container.querySelector<HTMLButtonElement>("#ext-accept")!;
    const deny = container.querySelector<HTMLButtonElement>("#ext-deny")!;

    // One at a time, listeners torn down on answer, Escape reads as no.
    return function show(confirmId: string, request: any) {
        title.textContent = request?.title || "Confirm";
        message.textContent = request?.message || "";
        overlay.classList.remove("hidden");

        const respond = (approved: boolean) => {
            overlay.classList.add("hidden");
            accept.removeEventListener("click", onYes);
            deny.removeEventListener("click", onNo);
            container.removeEventListener("keydown", onKey, true);
            deps.respond(confirmId, approved);
            deps.note(approved ? `Approved: ${request?.message || ""}` : "Declined.");
        };
        const onYes = () => respond(true);
        const onNo = () => respond(false);
        const onKey = (e: Event) => {
            if ((e as KeyboardEvent).key === "Escape") {
                // Stopped here so Escape answers the modal and not the Stop handler.
                e.preventDefault();
                e.stopPropagation();
                respond(false);
            }
        };
        accept.addEventListener("click", onYes);
        deny.addEventListener("click", onNo);
        container.addEventListener("keydown", onKey, true);
        accept.focus();
    };
}
