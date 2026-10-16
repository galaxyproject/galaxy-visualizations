import { describe, expect, it } from "vitest";

import {
  browserRecognizer,
  IDLE_TITLE,
  isDictationShortcut,
  joinDictation,
  mountDictation,
  type Recognizer,
  type RecognitionResultEvent,
} from "./dictation";

/** A recognizer the test drives: `say` delivers results, `end` ends listening. */
class FakeRecognizer implements Recognizer {
  static last: FakeRecognizer;
  lang = "";
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((event: RecognitionResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  results: { isFinal: boolean; 0: { transcript: string } }[] = [];
  stopped = false;

  constructor() {
    FakeRecognizer.last = this;
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.stopped = true;
    this.end();
  }
  aborted = false;
  /** Unlike stop, ends later, as a browser does: what is pending must not reach the composer. */
  abort() {
    this.aborted = true;
  }
  /** As Chrome does: an interim result is replaced at its index; `resultIndex` is what changed. */
  say(transcript: string, isFinal: boolean) {
    if (this.results.length && !this.results[this.results.length - 1].isFinal) {
      this.results.pop();
    }
    this.results.push({ isFinal, 0: { transcript } });
    this.onresult?.({ resultIndex: this.results.length - 1, results: this.results });
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
  end() {
    this.onend?.();
  }
}

function composer(text = "") {
  const button = document.createElement("button");
  button.classList.add("hidden");
  const input = document.createElement("textarea");
  input.value = text;
  let resized = 0;
  input.addEventListener("input", () => resized++);
  return { button, input, resized: () => resized };
}

describe("dictation", () => {
  it("offers no button without the Web Speech API", () => {
    const { button, input } = composer();
    expect(mountDictation(button, input, undefined)).toBeUndefined();
    expect(button.classList.contains("hidden")).toBe(true);
  });

  it("finds the prefixed recognizer Chrome ships", () => {
    const scope = { webkitSpeechRecognition: FakeRecognizer };
    expect(browserRecognizer(scope)).toBe(FakeRecognizer);
    expect(browserRecognizer({})).toBeUndefined();
  });

  it("shows the button and says where the audio goes", () => {
    const { button, input } = composer();
    mountDictation(button, input, FakeRecognizer, "en-GB");
    expect(button.classList.contains("hidden")).toBe(false);
    expect(button.title).toBe(IDLE_TITLE);
  });

  it("writes interim and final words after what was typed", () => {
    const { button, input, resized } = composer("Run FastQC on");
    mountDictation(button, input, FakeRecognizer, "en-GB");
    button.click();
    const r = FakeRecognizer.last;
    expect(r.lang).toBe("en-GB");
    expect(r.continuous && r.interimResults).toBe(true);
    expect(button.classList.contains("listening")).toBe(true);

    r.say("the reads", false);
    expect(input.value).toBe("Run FastQC on the reads");
    r.say("the paired reads", true);
    r.say("please", false);
    expect(input.value).toBe("Run FastQC on the paired reads please");
    expect(resized()).toBe(3);
  });

  it("keeps final words and drops interim ones when listening ends", () => {
    const { button, input } = composer();
    const dictation = mountDictation(button, input, FakeRecognizer)!;
    dictation.toggle();
    const r = FakeRecognizer.last;
    r.say("hello", true);
    r.say("wor", false);
    dictation.stop();
    expect(r.stopped).toBe(true);
    expect(input.value).toBe("hello");
    expect(dictation.listening).toBe(false);
    expect(button.classList.contains("listening")).toBe(false);
  });

  it("lets nothing late refill a composer cleared by sending", () => {
    const { button, input } = composer();
    const dictation = mountDictation(button, input, FakeRecognizer)!;
    dictation.toggle();
    const r = FakeRecognizer.last;
    r.say("run it", true);
    dictation.cancel();
    input.value = "";
    r.say("and more", false);
    r.end();
    expect(r.aborted).toBe(true);
    expect(input.value).toBe("");
    expect(dictation.listening).toBe(false);
    expect(button.classList.contains("listening")).toBe(false);
  });

  it("disables itself when the microphone is blocked", () => {
    const { button, input } = composer();
    mountDictation(button, input, FakeRecognizer);
    button.click();
    FakeRecognizer.last.fail("not-allowed");
    FakeRecognizer.last.end();
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/blocked/);
  });

  it("stays quiet when nothing was said", () => {
    const { button, input } = composer();
    mountDictation(button, input, FakeRecognizer);
    button.click();
    FakeRecognizer.last.fail("no-speech");
    FakeRecognizer.last.end();
    expect(button.disabled).toBe(false);
    expect(button.title).toBe(IDLE_TITLE);
  });

  it("toggles on Ctrl or Cmd with Shift+M", () => {
    const key = (init: KeyboardEventInit) =>
      isDictationShortcut(new KeyboardEvent("keydown", init));
    expect(key({ key: "M", metaKey: true, shiftKey: true })).toBe(true);
    expect(key({ key: "m", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(key({ key: "m", ctrlKey: true })).toBe(false);
  });

  it("joins typed and spoken text with one space", () => {
    expect(joinDictation("", " hi ")).toBe("hi");
    expect(joinDictation("a", "b")).toBe("a b");
    expect(joinDictation("a ", "b")).toBe("a b");
    expect(joinDictation("a", "  ")).toBe("a");
  });
});
