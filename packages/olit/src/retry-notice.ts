/** Tick a provider's stated wait down, so a slow turn is distinguishable from a hung one. */

export interface RetryNotice {
  start(status: number, wait: number, attempt: number, of: number): void;
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
    start(status, wait, attempt, of) {
      stop();
      let left = Math.ceil(wait);
      const label =
        status === 429 ? "Rate limited by the model provider" : `Provider error ${status}`;
      const render = () => `${label} — retrying in ${left}s (attempt ${attempt}/${of}).`;
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
