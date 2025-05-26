<script setup>
import { onMounted, watch, ref } from "vue";
import "locuszoom/dist/locuszoom.css";
import LocusZoom from "locuszoom/esm";
import LzTabixSource from "locuszoom/esm/ext/lz-tabix-source";
import { makeGWASParser } from "locuszoom/esm/ext/lz-parsers";

LocusZoom.use(LzTabixSource);

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

function render() {
    const id = props.settings.tabix?.id;
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
    if (!id) {
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
            url_data: `${props.root}api/datasets/${props.datasetId}/display`,
            url_tbi: `${props.root}api/datasets/${id}/display`,
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
    <div id="lz-plot" class="h-100"></div>
</template>

<style>
.lz-panel-toolbar {
    display: none;
}
</style>
