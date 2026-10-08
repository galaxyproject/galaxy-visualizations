/** Tick a provider's stated wait down, so a slow turn is distinguishable from a hung one. */

export interface RetryNotice {
  /** Count down to `at`, when the request is sent again. */
  start(errorMessage: string, at: number, attempt: number): void;
  stop(): void;
}

export interface NoticeSink {
  addInfoMessage(text: string): HTMLElement;
}

export function createRetryNotice(chat: NoticeSink): RetryNotice {
  let timer: ReturnType<typeof setInterval> | undefined;
  let line: HTMLElement | undefined;

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    line = undefined;
  };

  return {
    stop,
    start(errorMessage, at, attempt) {
      stop();
      let left = Math.max(1, Math.ceil((at - Date.now()) / 1000));
      // The first number the message names, when it is an HTTP error status rather than a wait.
      const status = /^\D*\b([45]\d\d)\b/.exec(errorMessage)?.[1];
      const label =
        status === "429"
          ? "Rate limited by the model provider"
          : status
            ? `Provider error ${status}`
            : "The model provider failed";
      const render = () => `${label} — retrying in ${left}s (attempt ${attempt + 1}).`;
      line = chat.addInfoMessage(render());
      timer = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          stop();
          return;
        }
        if (line) {
          line.textContent = render();
        }
      }, 1000);
    },
  };
}
