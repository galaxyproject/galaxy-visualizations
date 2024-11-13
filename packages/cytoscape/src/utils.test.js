import { afterEach, beforeEach, vi } from "vitest";
import { parseSIF, runSearchAlgorithm, runTraversalType, styleGenerator } from "./utils";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.restoreAllMocks();
});

test("parseSIF", () => {
    const text = "A\tppi\tB\nB\tppi\tC\nC\tppi\tD\n";
    const parsed = parseSIF(text);
    const expected = {
        content: [
            { data: { id: "A" } },
            { data: { id: "B" } },
            { data: { id: "C" } },
            { data: { id: "D" } },
            { data: { target: "B", source: "A", id: "AB", relation: "ppi" } },
            { data: { target: "C", source: "B", id: "BC", relation: "ppi" } },
            { data: { target: "D", source: "C", id: "CD", relation: "ppi" } },
        ],
    };

    expect(parsed).toEqual(expected);
});

test("runSearchAlgorithm", () => {
    const cytoscape = {
        elements: vi.fn().mockReturnValue({
            bfs: vi.fn().mockReturnValue({
                path: [{ addClass: vi.fn() }, { addClass: vi.fn() }, { addClass: vi.fn() }],
            }),
            dfs: vi.fn().mockReturnValue({
                path: [{ addClass: vi.fn() }, { addClass: vi.fn() }, { addClass: vi.fn() }],
            }),
            aStar: vi.fn().mockReturnValue({
                path: [{ addClass: vi.fn() }, { addClass: vi.fn() }, { addClass: vi.fn() }],
            }),
        }),
    };
    const rootId = "A";
    const type = "bfs";
    const self = { cytoscape: cytoscape };
    runSearchAlgorithm(cytoscape, rootId, type, self);

    vi.runAllTimers();

    const path = cytoscape.elements().bfs().path;
    path.forEach((element) => {
        expect(element.addClass).toHaveBeenCalledWith("searchpath");
    });
});

test("runTraversalType", () => {
    const cytoscape = {
        elements: () => {
            return {
                nodes: () => {
                    return [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
                },
                edges: () => {
                    return [
                        { source: "A", target: "B", id: "AB", relation: "ppi" },
                        { source: "B", target: "C", id: "BC", relation: "ppi" },
                        { source: "C", target: "D", id: "CD", relation: "ppi" },
                    ];
                },
            };
        },
        layout: () => {
            return {
                start: () => {},
            };
        },
    };
    const rootId = "A";
    const type = "bfs";

    runTraversalType(cytoscape, rootId, type);

    const nodes = cytoscape.elements().nodes();
    const edges = cytoscape.elements().edges();

    nodes.forEach((node) => {
        expect(node.id).toBeDefined();
    });

    edges.forEach((edge) => {
        expect(edge.source).toBeDefined();
        expect(edge.target).toBeDefined();
        expect(edge.id).toBeDefined();
        expect(edge.relation).toBeDefined();
    });
});

test("styleGenerator", () => {
    const style = styleGenerator({
        color_picker_nodes: "#666",
        curve_style: "haystack",
        color_picker_edges: "#ccc",
        directed: "triangle",
        color_picker_highlighted: "red",
    });

    const expected = [
        {
            selector: "node",
            style: {
                "background-color": "#666",
                opacity: 1,
                content: "data(id)",
                "text-valign": "center",
            },
        },
        {
            selector: "core",
            style: {
                "selection-box-color": "#AAD8FF",
                "selection-box-border-color": "#8BB0D0",
                "selection-box-opacity": 0.5,
            },
        },
        {
            selector: "edge",
            style: {
                "curve-style": "haystack",
                "haystack-radius": 0,
                width: 3,
                opacity: 1,
                "line-color": "#ccc",
                "target-arrow-shape": "triangle",
                "overlay-padding": "3px",
            },
        },
        {
            selector: "node:selected",
            style: {
                "border-width": "6px",
                "border-color": "#AAD8FF",
                "border-opacity": 0.5,
                "background-color": "#77828C",
                "text-outline-color": "#77828C",
            },
        },
        {
            selector: ".searchpath",
            style: {
                "background-color": "red",
                "line-color": "red",
                "target-arrow-color": "red",
                "transition-property": "background-color, line-color, target-arrow-color",
                "transition-duration": "0.5s",
            },
        },
    ];

    expect(style).toEqual(expected);
});
