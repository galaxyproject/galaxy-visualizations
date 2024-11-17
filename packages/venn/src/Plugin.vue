<script setup>
import { onMounted, ref, watch } from "vue";
import { useColumnsStore } from "galaxy-charts";
import * as d3 from "d3";
import * as Venn from "venn.js";

const store = useColumnsStore();

const props = defineProps({
    datasetId: String,
    datasetUrl: String,
    root: String,
    settings: Object,
    specs: Object,
    tracks: Array,
});

const viewport = ref(null);

async function render() {
    const columnsList = await store.fetchColumns(props.datasetId, props.tracks, ["observation"]);
    if (columnsList.length > 0 && Object.keys(columnsList[0]).length > 0) {
        const group_keys = [];
        const group_values = [];
        const all_values = {};
        const group_ids = [];

        columnsList.forEach((group, i) => {
            const group_index = {};
            group.observation.forEach((d) => {
                all_values[d] = group_index[d] = true;
            });
            group_keys.push(props.tracks[i].key);
            group_values.push(group_index);
            group_ids.push(i);
        });

        const combos = [];
        _combinations([], group_ids, combos);

        let sets = [];
        combos.forEach((c) => {
            let size = 0;
            for (const value in all_values) {
                let found = 0;
                c.forEach((group_id) => {
                    if (group_values[group_id][value]) {
                        found++;
                    }
                });
                if (found == c.length) {
                    size++;
                }
            }
            if (size > 0) {
                const set_labels = [];
                c.forEach((id) => {
                    set_labels.push(group_keys[id]);
                });
                sets.push({ sets: set_labels, size: size });
            }
        });

        d3.select(viewport.value).datum(sets).call(Venn.VennDiagram());
    }
}

function _combinations(current, remaining, results) {
    remaining.forEach((value, index) => {
        var new_current = current.slice();
        var new_remaining = remaining.slice();
        new_remaining.splice(0, index + 1);
        new_current.push(value);
        results.push(new_current);
        _combinations(new_current, new_remaining, results);
    });
}

onMounted(() => {
    render();
});

watch(
    () => props,
    () => render(),
    { deep: true },
);
</script>

<template>
    <svg class="h-screen w-screen" ref="viewport" />
</template>
