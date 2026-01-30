<script setup>
import { onMounted, watch, ref } from "vue";

import "locuszoom/dist/locuszoom.css";
import LocusZoom from "locuszoom/esm";
import LzTabixSource from "locuszoom/esm/ext/lz-tabix-source";
import { makeGWASParser } from "locuszoom/esm/ext/lz-parsers";

LocusZoom.use(LzTabixSource);

const TabixUrlSource = LocusZoom.Adapters.get("TabixUrlSource");

// Patch URLFetchable prototype by accessing it through a reader instance
let hasURLFetchablePrototypeBeenPatched = false;

TabixUrlSource.prototype._performRequest = function (options) {
    const region_start = options.start;
    const region_end = options.end;
    const extra_amount = this._overfetch * (region_end - region_start);
    const start = options.start - extra_amount;
    const end = options.end + extra_amount;

    return new Promise((resolve, reject) => {
        this._reader_promise
            .then((reader) => {
                // Patch the URLFetchable prototype once
                if (!hasURLFetchablePrototypeBeenPatched && reader.data) {
                    const URLFetchablePrototype = Object.getPrototypeOf(reader.data);
                    URLFetchablePrototype.fetch = function (callback, opts) {
                        var thisB = this;
                        opts = opts || {};
                        var attempt = opts.attempt || 1;
                        var truncatedLength = opts.truncatedLength;

                        if (attempt > 3) {
                            console.warn("Max fetch attempts reached");
                            return callback(null);
                        }

                        this.getURL()
                            .then(function (url) {
                                try {
                                    var timeout;
                                    if (opts.timeout && !thisB.opts.credentials) {
                                        timeout = setTimeout(function () {
                                            console.log("timing out " + url);
                                            req.abort();
                                            return callback(null, "Timeout");
                                        }, opts.timeout);
                                    }
                                    var req = new XMLHttpRequest();
                                    var length;
                                    req.open("GET", url, true);
                                    req.overrideMimeType("text/plain; charset=x-user-defined");
                                    if (thisB.end) {
                                        if (thisB.end - thisB.start > 1e8) {
                                            throw "Monster fetch!";
                                        }
                                        req.setRequestHeader("Range", "bytes=" + thisB.start + "-" + thisB.end);
                                        length = thisB.end - thisB.start + 1;
                                    }
                                    req.responseType = "arraybuffer";
                                    req.onreadystatechange = function () {
                                        if (req.readyState == 4) {
                                            if (timeout) clearTimeout(timeout);
                                            if (req.status == 200 || req.status == 206) {
                                                if (req.response) {
                                                    var bl = req.response.byteLength;
                                                    if (
                                                        length &&
                                                        length != bl &&
                                                        (!truncatedLength || bl != truncatedLength)
                                                    ) {
                                                        console.warn(
                                                            `Byte length mismatch (expected ${length}, got ${bl}), retrying...`,
                                                        );
                                                        return thisB.fetch(callback, {
                                                            attempt: attempt + 1,
                                                            truncatedLength: bl,
                                                        });
                                                    } else {
                                                        return callback(req.response);
                                                    }
                                                } else if (req.mozResponseArrayBuffer) {
                                                    return callback(req.mozResponseArrayBuffer);
                                                } else {
                                                    var r = req.responseText;
                                                    if (
                                                        length &&
                                                        length != r.length &&
                                                        (!truncatedLength || r.length != truncatedLength)
                                                    ) {
                                                        console.warn(`Text length mismatch, retrying...`);
                                                        return thisB.fetch(callback, {
                                                            attempt: attempt + 1,
                                                            truncatedLength: r.length,
                                                        });
                                                    } else {
                                                        return callback(bstringToBuffer(req.responseText));
                                                    }
                                                }
                                            } else {
                                                console.warn(`HTTP ${req.status} on attempt ${attempt}, retrying...`);
                                                if (req.status === 416) {
                                                    console.log("Range not satisfiable, resetting end");
                                                    thisB.end = "";
                                                }
                                                return thisB.fetch(callback, { attempt: attempt + 1 });
                                            }
                                        }
                                    };
                                    if (thisB.opts.credentials) {
                                        req.withCredentials = true;
                                    }
                                    req.send();
                                } catch (e) {
                                    console.error("Fetch error:", e);
                                    return callback(null);
                                }
                            })
                            .catch(function (err) {
                                console.error("getURL error:", err);
                                return callback(null, err);
                            });
                    };

                    hasURLFetchablePrototypeBeenPatched = true;
                }

                reader.fetch(options.chr, start, end, (data, err) => {
                    if (err) {
                        console.warn(`Tabix fetch failed:`, err);
                        return reject(new Error(err));
                    }
                    resolve(data);
                });
            })
            .catch((err) => reject(err));
    });
};

window.nowrap = false;
window.mode = false;

const COLOR = "#E30A17";
const MAX_RANGE = 10000000;
const SIZE = 40;

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const errorMessage = ref("");

function getDatasetUrl(root, id) {
    return `${root}api/datasets/${id}/display`;
}

function render() {
    const tabixDatasetId = props.settings.tabix?.id;
    const bgzipURL = getDatasetUrl(props.root, props.datasetId);
    const tabixURL = getDatasetUrl(props.root, tabixDatasetId);
    const chrIn = props.settings.chromosome;
    const startIn = props.settings.start;
    const endIn = props.settings.end;
    const chrom_col = props.settings.chrom_col;
    const pos_col = props.settings.pos_col;
    const ref_col = props.settings.ref_col;
    const alt_col = props.settings.alt_col;
    const pvalue_col = props.settings.pvalue_col;
    const is_neg_log_pvalue = props.settings.is_neg_log_pvalue;
    const beta_col = props.settings.beta_col;
    const stderr_beta_col = props.settings.stderr_beta_col;
    if (!tabixDatasetId) {
        errorMessage.value = "Please select a Tabix file.";
        return;
    }
    if (endIn - startIn > MAX_RANGE) {
        errorMessage.value = "We cannot output more than 10Mb at a time!";
        return;
    }
    if (endIn <= startIn) {
        errorMessage.value = "Invalid input: End position must be bigger than start position!";
        return;
    }
    errorMessage.value = "";
    const gwasParser = makeGWASParser({
        chrom_col,
        pos_col,
        ref_col,
        alt_col,
        pvalue_col,
        is_neg_log_pvalue,
        beta_col,
        stderr_beta_col,
    });
    let data_sources = new LocusZoom.DataSources().add("assoc", [
        "TabixUrlSource",
        {
            url_data: bgzipURL,
            url_tbi: tabixURL,
            parser_func: gwasParser,
            overfetch: 0,
        },
    ]);
    let association_data_layer_mods = {
        id: "associationpvalues_",
        name: "association",
        point_shape: "circle",
        point_size: SIZE,
        color: COLOR,
        legend: [{ shape: "circle", color: COLOR, size: SIZE, label: "phen", class: "lz-data_layer-scatter" }],
        tooltip: {
            closable: true,
            show: { or: ["highlighted", "selected"] },
            hide: { and: ["unhighlighted", "unselected"] },
            html: `<strong>phen</strong><br><strong>{{assoc:variant|htmlescape}}</strong><br>
                P Value: <strong>{{assoc:log_pvalue|logtoscinotation|htmlescape}}</strong><br>
                Ref. Allele: <strong>{{assoc:ref_allele|htmlescape}}</strong><br>`,
        },
    };
    const data_layer = {
        ...LocusZoom.Layouts.get("data_layer", "association_pvalues", association_data_layer_mods),
        namespace: { assoc: "assoc" },
        data_operations: [],
    };
    const panel = LocusZoom.Layouts.get("panel", "association", {
        data_layers: [data_layer],
    });
    LocusZoom.populate("#lz-plot", data_sources, {
        state: { chr: chrIn, start: startIn, end: endIn },
        responsive_resize: true,
        panels: [panel],
        toolbar: LocusZoom.Layouts.get("toolbar", "standard_plot"),
    });

    // manually set size of svg container
    document.querySelector("#lz-plot_svg").style.height = "calc(100vh - 50px)";
}

onMounted(() => {
    render();
});

watch(
    () => props,
    () => {
        render();
    },
    { deep: true },
);
</script>

<template>
    <div
        v-if="errorMessage"
        class="absolute mt-1 p-3 border bg-red-100 text-red-700 text-sm rounded opacity-95 w-[100%]">
        {{ errorMessage }}
    </div>
    <div id="lz-plot" class="h-full"></div>
</template>

<style>
.lz-panel-toolbar {
    display: none;
}
</style>
