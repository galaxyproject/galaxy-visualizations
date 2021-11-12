/** This class handles, formats and caches datasets. */
import _ from "underscore";
import { getAjax, merge } from "./utils";

/** Assists in assigning the viewport panels */
export function requestPanels(options) {
    const process = options.process;
    const chart = options.chart;
    const root = options.root;
    const render = options.render;
    const targets = options.targets;
    const dataset_id = options.dataset_id || options.chart.get("dataset_id");
    const dataset_groups = options.dataset_groups || options.chart.groups;
    request({
        root,
        chart,
        dataset_id,
        dataset_groups,
        success(result) {
            try {
                if (targets.length == result.length) {
                    let valid = true;
                    for (const group_index in result) {
                        const group = result[group_index];
                        if (!render(targets[group_index], [group])) {
                            valid = false;
                            break;
                        }
                    }
                    if (valid) {
                        chart.state("ok", "Multi-panel chart drawn.");
                    }
                } else if (targets.length == 1) {
                    if (render(targets[0], result)) {
                        chart.state("ok", "Chart drawn.");
                    }
                } else {
                    chart.state("failed", "Invalid panel count.");
                }
                process.resolve();
            } catch (err) {
                console.debug(`FAILED: tabular-utilities::panelHelper() - ${err}`);
                chart.state("failed", err);
                process.reject();
            }
        },
    });
}

/** Fills request dictionary with data from cache/response */
const _cache = {};
export function request(options) {
    const groups = options.dataset_groups;
    const dataset_id = options.dataset_id;
    const root = options.root;
    // identify columns needed to fulfill request
    const column_list = [];
    groups.each((group) => {
        _.each(group.get("__data_columns"), (column_def, column_name) => {
            const column = group.get(column_name);
            const block_id = _block_id(dataset_id, column);
            if (
                !column_list.includes(column) &&
                !_cache[block_id] &&
                column != "auto" &&
                column != "zero" &&
                column !== undefined
            ) {
                column_list.push(column);
            }
        });
    });
    if (column_list.length === 0) {
        _fillFromCache(options);
        return;
    }
    // Fetch data columns into dataset object
    getAjax({
        url: `${root}api/datasets/${dataset_id}`,
        data: {
            data_type: "raw_data",
            provider: "dataset-column",
            indeces: column_list.toString(),
        },
        success({ data }) {
            const column_length = column_list.length;
            const results = new Array(column_length);
            for (let i = 0; i < results.length; i++) {
                results[i] = [];
            }
            for (const i in data) {
                const row = data[i];
                for (const j in row) {
                    const v = row[j];
                    if (v !== undefined && v != 2147483647 && j < column_length) {
                        results[j].push(v);
                    }
                }
            }
            console.debug("tabular-datasets::_fetch() - Fetching complete.");
            for (const i in results) {
                const column = column_list[i];
                const block_id = _block_id(dataset_id, column);
                _cache[block_id] = results[i];
            }
            _fillFromCache(options);
        },
    });
}

/** Fill data from cache */
function _fillFromCache(options) {
    const groups = options.dataset_groups;
    const dataset_id = options.dataset_id;
    console.debug("tabular-datasets::_fillFromCache() - Filling request from cache.");
    let limit = 0;
    groups.each((group) => {
        _.each(group.get("__data_columns"), (column_def, column_name) => {
            const column = group.get(column_name);
            const block_id = _block_id(dataset_id, column);
            const column_data = _cache[block_id];
            if (column_data) {
                limit = Math.max(limit, column_data.length);
            }
        });
    });
    if (limit === 0) {
        console.debug("tabular-datasets::_fillFromCache() - No data available.");
        if (options.chart) {
            options.chart.state("failed", "No data available.");
        }
    }
    const results = [];
    groups.each((group, group_index) => {
        const dict = merge({ key: `${group_index}:${group.get("key")}`, values: [] }, group.attributes);
        for (let j = 0; j < limit; j++) {
            dict.values[j] = { x: parseInt(j) };
        }
        results.push(dict);
    });
    groups.each((group, group_index) => {
        const values = results[group_index].values;
        _.each(group.get("__data_columns"), ({ is_label }, column_name) => {
            const column = group.get(column_name);
            switch (column) {
                case "auto":
                    for (let j = 0; j < limit; j++) {
                        values[j][column_name] = parseInt(j);
                    }
                    break;
                case "zero":
                    for (let j = 0; j < limit; j++) {
                        values[j][column_name] = 0;
                    }
                    break;
                default:
                    const block_id = _block_id(dataset_id, column);
                    const column_data = _cache[block_id];
                    for (let j = 0; j < limit; j++) {
                        const value = values[j];
                        let v = column_data[j];
                        if (isNaN(v) && !is_label) {
                            v = 0;
                        }
                        value[column_name] = v;
                    }
            }
        });
    });
    options.success(results);
}

/** Get block id */
function _block_id(dataset_id, column) {
    return `${dataset_id}__${column}`;
}
