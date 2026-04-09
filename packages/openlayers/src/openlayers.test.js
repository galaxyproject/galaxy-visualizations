import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const Map = vi.fn(function (options) {
        this.options = options;
        this.addInteraction = vi.fn();
        this.addControl = vi.fn();
    });
    const View = vi.fn(function (options) {
        this.options = options;
    });
    const Graticule = vi.fn(function (options) {
        this.options = options;
        this.setMap = vi.fn();
    });
    const OSM = vi.fn(function () {});
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
    const Modify = vi.fn(function (options) {
        this.options = options;
    });
    const DragRotateAndZoom = vi.fn(function () {});
    const interactionDefaultsExtend = vi.fn((items) => items);
    const interactionDefaults = vi.fn(() => ({
        extend: interactionDefaultsExtend,
    }));
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
    const TileLayer = vi.fn(function (options) {
        this.options = options;
    });
    const VectorLayer = vi.fn(function (options) {
        this.options = options;
    });
    const FullScreen = vi.fn(function () {});
    const ScaleLine = vi.fn(function () {});
    const ZoomSlider = vi.fn(function () {});
    const controlDefaultsExtend = vi.fn((items) => items);
    const controlDefaults = vi.fn(() => ({
        extend: controlDefaultsExtend,
    }));
    const saveAs = vi.fn();
    const axiosGet = vi.fn();
    const shp = vi.fn();

    return {
        Map,
        View,
        Graticule,
        OSM,
        VectorSource,
        GeoJSON,
        Draw,
        Modify,
        DragRotateAndZoom,
        interactionDefaults,
        interactionDefaultsExtend,
        Style,
        Stroke,
        Fill,
        Circle,
        TileLayer,
        VectorLayer,
        FullScreen,
        ScaleLine,
        ZoomSlider,
        controlDefaults,
        controlDefaultsExtend,
        saveAs,
        axiosGet,
        shp,
    };
});

vi.mock("ol", () => ({
    Map: mocks.Map,
    View: mocks.View,
    Graticule: mocks.Graticule,
}));

vi.mock("ol/source", () => ({
    OSM: mocks.OSM,
    Vector: mocks.VectorSource,
}));

vi.mock("ol/format", () => ({
    GeoJSON: mocks.GeoJSON,
}));

vi.mock("ol/interaction", () => ({
    Draw: mocks.Draw,
    Modify: mocks.Modify,
    DragRotateAndZoom: mocks.DragRotateAndZoom,
    defaults: mocks.interactionDefaults,
}));

vi.mock("ol/style", () => ({
    Style: mocks.Style,
    Stroke: mocks.Stroke,
    Fill: mocks.Fill,
    Circle: mocks.Circle,
}));

vi.mock("ol/layer", () => ({
    Tile: mocks.TileLayer,
    Vector: mocks.VectorLayer,
}));

vi.mock("ol/control", () => ({
    FullScreen: mocks.FullScreen,
    ScaleLine: mocks.ScaleLine,
    ZoomSlider: mocks.ZoomSlider,
    defaults: mocks.controlDefaults,
}));

vi.mock("file-saver", () => ({
    saveAs: mocks.saveAs,
}));

vi.mock("axios", () => ({
    default: {
        get: mocks.axiosGet,
    },
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
        vi.stubGlobal("window", {
            URL: {
                createObjectURL: vi.fn(() => "blob:url"),
            },
        });
        vi.stubGlobal("navigator", {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("adds a draw interaction and applies the selected color on drawstart", () => {
        const viewer = MapViewer({});
        viewer.gMap = {
            addInteraction: vi.fn(),
        };

        viewer.setInteractions({}, "#12ab34", "Polygon");

        expect(mocks.Draw).toHaveBeenCalledWith({
            source: {},
            type: "Polygon",
            freehand: true,
        });
        expect(viewer.gMap.addInteraction).toHaveBeenCalledWith(mocks.Draw.mock.instances[0]);

        const feature = {
            setStyle: vi.fn(),
        };
        mocks.Draw.mock.instances[0].handlers.drawstart({ feature });

        const appliedStyle = feature.setStyle.mock.calls[0][0];
        expect(appliedStyle.options.stroke.options.color).toBe("#12ab34");
    });

    it("does not create a draw interaction when drawing is disabled", () => {
        const viewer = MapViewer({});
        viewer.gMap = {
            addInteraction: vi.fn(),
        };

        viewer.setInteractions({}, "#12ab34", "None");

        expect(mocks.Draw).not.toHaveBeenCalled();
        expect(viewer.gMap.addInteraction).not.toHaveBeenCalled();
    });

    it("loads geojson data into a vector source and forwards the style function", () => {
        const viewer = MapViewer({});
        viewer.createMap = vi.fn();
        const target = { id: "viewport" };

        viewer.loadFile("/dataset.geojson", "geojson", "#0055ff", "LineString", target);

        expect(mocks.GeoJSON).toHaveBeenCalledTimes(1);
        expect(mocks.VectorSource).toHaveBeenCalledWith({
            format: mocks.GeoJSON.mock.instances[0],
            url: "/dataset.geojson",
            wrapX: false,
        });
        expect(viewer.createMap).toHaveBeenCalledTimes(1);

        const [source, color, geometryType, styleFunction, forwardedTarget] = viewer.createMap.mock.calls[0];
        expect(source).toBe(mocks.VectorSource.mock.instances[0]);
        expect(color).toBe("#0055ff");
        expect(geometryType).toBe("LineString");
        expect(forwardedTarget).toBe(target);

        const styleForLine = styleFunction({
            getGeometry: () => ({
                getType: () => "LineString",
            }),
        });
        expect(styleForLine.options.stroke.options.color).toBe("#0055ff");
    });

    it("converts shapefiles to geojson before creating the map", async () => {
        mocks.axiosGet.mockResolvedValue({ data: "shp-binary" });
        mocks.shp.mockResolvedValue({ type: "FeatureCollection" });

        const viewer = MapViewer({});
        viewer.createMap = vi.fn();

        viewer.loadFile("/dataset.shp", "shp", "#ffaa00", "Polygon", "target");
        await flushPromises();
        await flushPromises();

        expect(mocks.axiosGet).toHaveBeenCalledWith("/dataset.shp", { responseType: "arraybuffer" });
        expect(mocks.shp).toHaveBeenCalledWith("shp-binary");
        expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(mocks.VectorSource).toHaveBeenLastCalledWith({
            format: mocks.GeoJSON.mock.instances[0],
            url: "blob:url",
            wrapX: false,
        });
        expect(viewer.createMap).toHaveBeenCalledTimes(1);
    });

    it("exports the map canvas with saveAs when msSaveBlob is unavailable", () => {
        const viewer = MapViewer({});
        const canvas = {
            toBlob: vi.fn((callback) => callback("png-blob")),
        };

        viewer.exportMap(canvas);

        expect(canvas.toBlob).toHaveBeenCalledTimes(1);
        expect(mocks.saveAs).toHaveBeenCalledWith("png-blob", expect.stringMatching(/\.png$/));
    });

    it("exports the map canvas with msSaveBlob when available", () => {
        const msSaveBlob = vi.fn();
        vi.stubGlobal("navigator", {
            msSaveBlob,
        });

        const viewer = MapViewer({});
        const canvas = {
            msToBlob: vi.fn(() => "ms-blob"),
        };

        viewer.exportMap(canvas);

        expect(canvas.msToBlob).toHaveBeenCalledTimes(1);
        expect(msSaveBlob).toHaveBeenCalledWith("ms-blob", expect.stringMatching(/\.png$/));
        expect(mocks.saveAs).not.toHaveBeenCalled();
    });
});
