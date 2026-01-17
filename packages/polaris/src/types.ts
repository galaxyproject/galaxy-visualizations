import { Component } from "vue";

export interface ConsoleMessageType {
    content: string;
    details?: any;
    icon?: Component;
    spin?: boolean;
    type?: string;
}

export interface VisualizationSpecsType {
    ai_api_base_url?: string;
    ai_api_key?: string;
    ai_max_tokens?: string;
    ai_model?: string;
    ai_prompt?: string;
    ai_temperature?: string;
    ai_top_p?: string;
    ai_contract?: any;
    depth?: string;
    max_per_level?: string;
}

export interface IncomingDataType {
    root: string;
    visualization_config: {
        dataset_id: string;
    };
    visualization_plugin: {
        specs?: VisualizationSpecsType;
    };
}

export interface DatasetDetailType {
    id: string;
    uuid: string;
    name: string;
    creating_job: string;
    file_ext: string;
    file_size: number;
    genome_build?: string;
}

export interface JobInputDatasetType {
    id: string;
    src: string;
    uuid?: string;
}

export interface JobDetailType {
    id: string;
    tool_id: string;
    tool_version?: string;
    state: string;
    create_time: string;
    inputs?: Record<string, JobInputDatasetType>;
}

export interface ReportDataType {
    reportTitle: string;
    datasetDetails: DatasetDetailType[];
    jobDetails: JobDetailType[];
    markdownContent: string;
    mermaidDiagram: string;
    sourceDatasetId?: string;
}

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export type OpResult =
    | { ok: true; result: Json }
    | { ok: false; error: { code: string; message: string; details?: Json } };

export type ExecContext = {
    inputs: Record<string, Json>;
    state: Record<string, Json>;
    nodeId: string;
    graphId: string;
};

export type ApiCallSpec = { target: string; input?: Json };

export interface Registry {
    plan: (ctx: ExecContext, spec: { tools: Json; outputSchema: Json }) => Promise<Json>;
    callApi: (ctx: ExecContext, spec: ApiCallSpec) => Promise<OpResult>;
}
