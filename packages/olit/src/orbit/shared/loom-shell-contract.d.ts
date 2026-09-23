export const LoomWidgetKey: {
  readonly Plan: "plan";
  readonly Steps: "steps";
  readonly Results: "results";
  readonly Parameters: "parameters";
  readonly Notebook: "notebook";
  readonly PlanView: "plan-view";
  readonly Activity: "activity";
};

export interface ShellActivityEvent {
  timestamp: string;
  kind: string;
  source: string;
  payload: Record<string, unknown>;
}

export interface ShellStep {
  id: string;
  name: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  dependsOn: string[];
  result?: string;
  command?: string;
}

export interface ResultBlock {
  stepName?: string;
  type: "markdown" | "table" | "image" | "file";
  content?: string;
  headers?: string[];
  rows?: string[][];
  path?: string;
  caption?: string;
}

export interface ParameterOption {
  label: string;
  value: string;
}

export interface ParameterSpec {
  name: string;
  type: "text" | "integer" | "float" | "boolean" | "select" | "file";
  label: string;
  help: string;
  value: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: ParameterOption[];
  fileFilter?: string;
  usedBy?: string[];
}

export interface ParameterGroup {
  title: string;
  description: string;
  params: ParameterSpec[];
}

export interface ParameterFormPayload {
  planId: string;
  title: string;
  description: string;
  groups: ParameterGroup[];
}

export function encodeMarkdownWidget(markdown: string): string[];
export function decodeMarkdownWidget(lines: string[] | undefined): string;
export function encodeJsonWidget<T>(value: T): string[];
export function decodeJsonWidget<T>(lines: string[] | undefined): T;
