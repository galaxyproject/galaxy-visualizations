<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
    defineProps<{
        content: string;
        maxRows?: number;
    }>(),
    {
        maxRows: 10000,
    },
);

const body = computed(() => (rows.value.length > 1 ? rows.value.slice(1) : []));
const header = computed(() => (rows.value.length > 0 ? rows.value[0] : []));
const isTruncated = computed(() => props.maxRows > 0 && totalRows.value > props.maxRows);
const rows = computed(() => (isTruncated.value ? parsedData.value.slice(0, props.maxRows + 1) : parsedData.value));
const totalRows = computed(() => parsedData.value.length);

function skipCommentLines(text: string): string {
    const lines = text.split("\n");
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i].trim();
        if (stripped.startsWith("#") || stripped.startsWith("//")) {
            startIndex = i + 1;
        } else {
            break;
        }
    }
    return lines.slice(startIndex).join("\n");
}

function detectDelimiter(text: string): string {
    const cleanText = skipCommentLines(text);
    const firstLine = cleanText.split("\n")[0] || "";
    // If tabs present, treat as tab-delimited
    if (firstLine.includes("\t")) {
        return "\t";
    }
    return ",";
}

function parseTabular(text: string) {
    const cleanText = skipCommentLines(text);
    const delimiter = detectDelimiter(cleanText);
    const rawRows = parseDelimited(cleanText, delimiter);

    // For tab-delimited files, generate column headers
    if (delimiter === "\t" && rawRows.length > 0) {
        const numCols = rawRows[0].length;
        const header = Array.from({ length: numCols }, (_, i) => `col:${i + 1}`);
        return [header, ...rawRows];
    }

    return rawRows;
}

function parseDelimited(text: string, delimiter: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];
        if (char === '"' && inQuotes && next === '"') {
            field += '"';
            i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
            row.push(field);
            field = "";
        } else if ((char === "\n" || char === "\r") && !inQuotes) {
            if (field.length || row.length) {
                row.push(field);
                rows.push(row);
                row = [];
                field = "";
            }
        } else {
            field += char;
        }
    }
    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

const parsedData = computed(() => {
    if (props.content) {
        return parseTabular(props.content);
    }
    return [];
});
</script>

<template>
    <div class="h-full flex flex-col">
        <div v-if="isTruncated" class="bg-sky-50 text-sky-700 text-xs px-2 py-1 shrink-0">
            Showing {{ maxRows.toLocaleString() }} of {{ totalRows.toLocaleString() }} rows
        </div>
        <div class="flex-1 overflow-auto">
            <table class="min-w-full border-collapse text-sm">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="tabular-header">#</th>
                        <th v-for="(cell, i) in header" :key="i" class="tabular-header">
                            {{ cell }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(row, r) in body" :key="r" class="odd:bg-white even:bg-gray-50">
                        <td class="tabular-row">
                            {{ r + 1 }}
                        </td>
                        <td v-for="(cell, c) in row" :key="c" class="tabular-row">
                            {{ cell }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
