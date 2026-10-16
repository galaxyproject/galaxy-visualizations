/**
 * Dictation into the composer through the browser's Web Speech API.
 *
 * Chrome and Edge recognize speech on their vendor's service, so the audio leaves the machine;
 * the button says so. A browser without the API (Firefox) gets no button.
 */

/** The slice of the Web Speech API dictation uses, so tests can stand in for it. */
export interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

export type RecognizerClass = new () => Recognizer;

export interface Dictation {
  /** Ends listening; what was heard so far stays in the composer. */
  stop(): void;
  /**
   * Ends listening now and drops what is still to come. Sending calls it: the recognizer ends
   * asynchronously, and its late results would otherwise refill the composer just cleared.
   */
  cancel(): void;
  toggle(): void;
  readonly listening: boolean;
}

export const IDLE_TITLE =
  "Dictate (Ctrl/Cmd+Shift+M). Your browser sends the audio to its speech service.";
const LISTENING_TITLE = "Listening. Click to stop.";
const BLOCKED_TITLE = "Microphone access is blocked for this site in the browser's settings.";

/** The browser's recognizer, if it has one. */
export function browserRecognizer(scope: any = globalThis): RecognizerClass | undefined {
  return scope.SpeechRecognition || scope.webkitSpeechRecognition;
}

/** What was typed, then what was said, with one space between them. */
export function joinDictation(typed: string, spoken: string): string {
  const said = spoken.trim();
  if (!said) {
    return typed;
  }
  return typed && !/\s$/.test(typed) ? `${typed} ${said}` : typed + said;
}

/**
 * Show the mic button and wire it to `input`. Returns undefined, leaving the button hidden,
 * when the browser cannot recognize speech.
 */
export function mountDictation(
  button: HTMLButtonElement,
  input: HTMLTextAreaElement,
  Recognition: RecognizerClass | undefined = browserRecognizer(),
  lang: string = (globalThis.navigator?.language as string) || "en-US",
): Dictation | undefined {
  if (!Recognition) {
    return undefined;
  }
  button.classList.remove("hidden");
  button.title = IDLE_TITLE;

  let recognizer: Recognizer | undefined;
  let typed = "";
  let heard = "";

  // Setting .value raises no `input`, which the composer needs to resize.
  const write = (interim: string) => {
    input.value = joinDictation(typed, heard + interim);
    input.dispatchEvent(new Event("input"));
  };

  const listening = (on: boolean) => {
    button.classList.toggle("listening", on);
    button.setAttribute("aria-pressed", String(on));
    if (!button.disabled) {
      button.title = on ? LISTENING_TITLE : IDLE_TITLE;
    }
  };

  const start = () => {
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    typed = input.value;
    heard = "";
    r.onstart = () => listening(true);
    r.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          heard += `${result[0].transcript} `;
        } else {
          interim += result[0].transcript;
        }
      }
      write(interim);
    };
    r.onerror = ({ error }) => {
      if (error === "not-allowed" || error === "service-not-allowed") {
        button.disabled = true;
        button.title = BLOCKED_TITLE;
      } else if (error !== "no-speech" && error !== "aborted") {
        button.title = `Dictation stopped: ${error}.`;
      }
    };
    r.onend = () => {
      // Words still interim when listening ended are dropped; the final ones are kept.
      write("");
      recognizer = undefined;
      listening(false);
      input.focus();
    };
    recognizer = r;
    r.start();
  };

  const stop = () => recognizer?.stop();
  const toggle = () => (recognizer ? stop() : start());
  const cancel = () => {
    const r = recognizer;
    if (!r) {
      return;
    }
    r.onresult = r.onerror = r.onend = null;
    recognizer = undefined;
    listening(false);
    r.abort();
  };

  button.addEventListener("click", toggle);
  return {
    stop,
    cancel,
    toggle,
    get listening() {
      return recognizer !== undefined;
    },
  };
}

/** Ctrl/Cmd+Shift+M, the shortcut that toggles dictation. */
export function isDictationShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m";
}
