/**
 * A plan draft is answerable until the user's next message, live or restored: whatever they
 * wrote next answered it, so its buttons would otherwise act on whichever plan the model holds
 * by then ("the plan above"). Olit's rule over loom's chat panel, which leaves restored drafts open.
 */
export function settlePlanDrafts(container: ParentNode): void {
  container
    .querySelectorAll<HTMLElement>(".plan-draft-card:not(.approved):not(.rejected)")
    .forEach((card) => {
      card.classList.add("answered");
      const header = card.querySelector(".plan-draft-card-header");
      if (header) header.textContent = "Plan draft — answered below";
      card.querySelectorAll<HTMLButtonElement>(".plan-btn").forEach((b) => (b.disabled = true));
    });
}
