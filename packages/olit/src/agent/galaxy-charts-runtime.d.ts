declare module "galaxy-charts/runtime" {
  /** The options a declared visualization input offers, as `{label, value}` entries. */
  export function getOptions(
    input: Record<string, unknown>,
    context: {
      datasetId?: string;
      client: { api(path: string): Promise<unknown>; url(target: string): Promise<unknown> };
    },
  ): Promise<{ label: string; value: unknown }[]>;
}
