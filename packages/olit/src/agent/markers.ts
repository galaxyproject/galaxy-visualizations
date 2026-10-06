/** How an automatic follow-up announces itself, to the model and to the chat. */
export const FOLLOW_UP_MARK = "[Olit automatic Galaxy follow-up]";

/** What an answer with nothing in it is followed by: one more chance before the run ends. */
export const EMPTY_REPLY = "Your last reply was empty. Answer my previous message.";

/** What to call each kind of watched work in the record and the chat. */
export const WHAT = {
  job: "Galaxy job",
  invocation: "Workflow invocation",
  dataset: "Galaxy dataset",
} as const;
