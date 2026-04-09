import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Focused unit tests for branches the Playwright smoke test cannot reach:
//   - setInteractions: Draw wiring + the "None" short-circuit
//   - loadFile("shp"): the axios + shpjs conversion path
//   - exportMap: the canvas → file-saver download path
//
// The geojson happy path is covered end-to-end by test.spec.js, so it is
// intentionally not duplicated here.

const mocks = vi.hoisted(() => {
    const VectorSource = vi.fn(function (options) {
        this.options = options;
    });
    const GeoJSON = vi.fn(function () {});
    const Draw = vi.fn(function (options) {
        this.options = options;
        this.handlers = {};
        this.on = vi.fn((event, callback) => {
            this.handlers[event] = callback;
        });
    });
    const Style = vi.fn(function (options) {
        this.options = options;
    });
    const Stroke = vi.fn(function (options) {
        this.options = options;
    });
    const Fill = vi.fn(function (options) {
        this.options = options;
    });
    const Circle = vi.fn(function (options) {
        this.options = options;
    });
    const saveAs = vi.fn();
    const axiosGet = vi.fn();
    const shp = vi.fn();

    return { VectorSource, GeoJSON, Draw, Style, Stroke, Fill, Circle, saveAs, axiosGet, shp };
});

// The "ol" / "ol/layer" / "ol/control" modules are only touched by setMap,
// which the remaining tests don't exercise. We still need stub exports so
// import resolution succeeds without loading the real OpenLayers package.
vi.mock("ol", () => ({
    Map: vi.fn(),
    View: vi.fn(),
    Graticule: vi.fn(function () {
        this.setMap = vi.fn();
    }),
}));

vi.mock("ol/source", () => ({
    OSM: vi.fn(),
    Vector: mocks.VectorSource,
}));

vi.mock("ol/format", () => ({
    GeoJSON: mocks.GeoJSON,
}));

vi.mock("ol/interaction", () => ({
    Draw: mocks.Draw,
    Modify: vi.fn(),
    DragRotateAndZoom: vi.fn(),
    defaults: vi.fn(() => ({ extend: (items) => items })),
}));

vi.mock("ol/style", () => ({
    Style: mocks.Style,
    Stroke: mocks.Stroke,
    Fill: mocks.Fill,
    Circle: mocks.Circle,
}));

vi.mock("ol/layer", () => ({
    Tile: vi.fn(),
    Vector: vi.fn(),
}));

vi.mock("ol/control", () => ({
    FullScreen: vi.fn(),
    ScaleLine: vi.fn(),
    ZoomSlider: vi.fn(),
    defaults: vi.fn(() => ({ extend: (items) => items })),
}));

vi.mock("file-saver", () => ({
    saveAs: mocks.saveAs,
}));

vi.mock("axios", () => ({
    default: { get: mocks.axiosGet },
}));

vi.mock("shpjs", () => ({
    default: mocks.shp,
}));

import { MapViewer } from "./openlayers";

function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("MapViewer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "debug").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("setInteractions wires drawstart to apply the selected color", () => {
        const viewer = MapViewer({});
        viewer.gMap = { addInteraction: vi.fn() };

        viewer.setInteractions({}, "#12ab34", "Polygon");

        expect(mocks.Draw).toHaveBeenCalledWith({
            source: {},
            type: "Polygon",
            freehand: true,
        });
        expect(viewer.gMap.addInteraction).toHaveBeenCalledWith(mocks.Draw.mock.instances[0]);

        const feature = { setStyle: vi.fn() };
        mocks.Draw.mock.instances[0].handlers.drawstart({ feature });

        const appliedStyle = feature.setStyle.mock.calls[0][0];
        expect(appliedStyle.options.stroke.options.color).toBe("#12ab34");
    });

    it("setInteractions skips Draw when geometryType is None", () => {
        const viewer = MapViewer({});
        viewer.gMap = { addInteraction: vi.fn() };

        viewer.setInteractions({}, "#12ab34", "None");

        expect(mocks.Draw).not.toHaveBeenCalled();
        expect(viewer.gMap.addInteraction).not.toHaveBeenCalled();
    });

    it("loadFile shp converts shapefile binaries to geojson before creating the map", async () => {
        mocks.axiosGet.mockResolvedValue({ data: "shp-binary" });
        mocks.shp.mockResolvedValue({ type: "FeatureCollection" });

        const viewer = MapViewer({});
        viewer.createMap = vi.fn();

        viewer.loadFile("/dataset.shp", "shp", "#ffaa00", "Polygon", "target");
        await flushPromises();
        await flushPromises();

        expect(mocks.axiosGet).toHaveBeenCalledWith("/dataset.shp", { responseType: "arraybuffer" });
        expect(mocks.shp).toHaveBeenCalledWith("shp-binary");
        expect(mocks.VectorSource).toHaveBeenLastCalledWith(
            expect.objectContaining({
                format: mocks.GeoJSON.mock.instances[0],
                url: expect.stringMatching(/^blob:/),
                wrapX: false,
            }),
        );
        expect(viewer.createMap).toHaveBeenCalledTimes(1);
    });

    it("exportMap saves the canvas as a PNG via file-saver", () => {
        const viewer = MapViewer({});
        const canvas = {
            toBlob: vi.fn((callback) => callback("png-blob")),
        };

        viewer.exportMap(canvas);

        expect(canvas.toBlob).toHaveBeenCalledTimes(1);
        expect(mocks.saveAs).toHaveBeenCalledWith("png-blob", expect.stringMatching(/\.png$/));
    });
});
