/** Orbit's layout chain, so the vendored styles.css applies as-is. */

export const LAYOUT = `
      <div id="app-main">
        <div id="chat-pane" class="pane">
          <div id="messages"></div>
          <div id="input-area">
            <div class="composer-row">
              <textarea id="input" rows="1" aria-label="Chat input"
                placeholder="Ask Olit to run something..."></textarea>
              <button id="send-btn" title="Send" aria-label="Send message">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
              <!-- Orbit's abort button; the vendored styles.css already has #abort-btn. -->
              <button id="abort-btn" title="Stop (Esc)" class="hidden" aria-label="Stop the current response">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                <span>Stop</span>
              </button>
            </div>
          </div>
          <div id="input-hint">
            <span>Enter to send</span>
            <button id="reset-btn" class="hidden" title="Start a fresh conversation">New conversation</button>
          </div>
        </div>
        <div id="divider"></div>
        <div id="artifact-pane" class="pane">
          <div id="artifact-content"></div>
        </div>
      </div>
      <div id="app-footer">
        <button id="save-btn" class="footer-control is-interactive" title="Save this conversation as a Galaxy visualization">Save</button>
        <button id="model-btn" class="footer-control is-interactive" title="Change the model provider">Model</button>
        <button id="artifact-btn" class="footer-control is-interactive" title="Show or hide the artifact pane (Ctrl/Cmd+\\)">Artifact</button>
        <div id="usage-bar" class="footer-control hidden" title="Session token usage">
          <span id="usage-tokens">0 tok</span>
          <span id="usage-cost"></span>
        </div>
        <span id="build-stamp" class="footer-control hidden"></span>
      </div>
      <!-- Orbit's request modal, reduced to the confirm variant. -->
      <div id="ext-overlay" class="modal-overlay hidden">
        <div class="modal">
          <div class="modal-header"><h2 id="ext-title">Request</h2></div>
          <div class="modal-body"><div id="ext-message" class="ext-message"></div></div>
          <div class="modal-footer">
            <div class="modal-actions">
              <button id="ext-deny" class="plan-btn">No</button>
              <button id="ext-accept" class="plan-btn primary">Yes</button>
            </div>
          </div>
        </div>
      </div>`;

export interface Elements {
  chat: HTMLElement;
  messages: HTMLElement;
  input: HTMLTextAreaElement;
  send: HTMLButtonElement;
  abort: HTMLButtonElement;
  reset: HTMLButtonElement;
  save: HTMLButtonElement;
  model: HTMLButtonElement;
  artifactContent: HTMLElement;
}

/** Write the layout into `container` and hand back the parts the shell drives. */
export function mountLayout(container: HTMLElement): Elements {
  container.innerHTML = LAYOUT;
  const find = <T extends HTMLElement>(id: string) => container.querySelector<T>(id)!;
  return {
    chat: find("#chat-pane"),
    messages: find("#messages"),
    input: find<HTMLTextAreaElement>("#input"),
    send: find<HTMLButtonElement>("#send-btn"),
    abort: find<HTMLButtonElement>("#abort-btn"),
    reset: find<HTMLButtonElement>("#reset-btn"),
    save: find<HTMLButtonElement>("#save-btn"),
    model: find<HTMLButtonElement>("#model-btn"),
    artifactContent: find("#artifact-content"),
  };
}
