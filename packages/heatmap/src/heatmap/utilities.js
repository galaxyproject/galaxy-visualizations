import * as d3 from "d3";

/** Add box-select zoom handler */
export function addZoom(options) {
    const yAxis = options.yAxis;
    const xAxis = options.xAxis;
    const xDomain = xAxis.scale().domain;
    const yDomain = yAxis.scale().domain;
    const redraw = options.redraw;
    const svg = options.svg;
    const margin = options.margin;
    const xScale = xAxis.scale();
    const yScale = yAxis.scale();
    const xBoundary = xScale.domain().slice();
    const yBoundary = yScale.domain().slice();

    let startCoords = null;
    let selectionBox = null;
    let overlay = null;

    function fixDomain(domain, boundary) {
        domain[0] = Math.max(domain[0], boundary[0]);
        domain[1] = Math.min(domain[1], boundary[1]);
        return domain;
    }

    function zoomed() {
        if (overlay) {
            overlay.remove();
        }
        if (selectionBox) {
            const [x0, x1] = [selectionBox.x0, selectionBox.x1].map((d) => xScale.invert(d - margin.left));
            const [y0, y1] = [selectionBox.y0, selectionBox.y1].map((d) => yScale.invert(d - margin.top));
            startCoords = null;
            selectionBox = null;
            xDomain(fixDomain([Math.min(x0, x1), Math.max(x0, x1)], xBoundary));
            yDomain(fixDomain([Math.min(y0, y1), Math.max(y0, y1)], yBoundary));
            redraw();
        }
    }

    function dragStarted(event) {
        const [x, y] = d3.pointer(event);
        startCoords = { x, y };
        overlay = svg
            .append("rect")
            .attr("class", "zoom-overlay")
            .attr("fill", "rgba(0,0,0,0.1)")
            .attr("stroke", "rgba(0,0,0,0.5)")
            .attr("stroke-dasharray", "4,4")
            .attr("x", x)
            .attr("y", y)
            .attr("width", 0)
            .attr("height", 0)
            .attr("visibility", "visible");
    }

    function dragged(event) {
        if (startCoords) {
            const [x, y] = d3.pointer(event);
            const x0 = Math.min(startCoords.x, x);
            const x1 = Math.max(startCoords.x, x);
            const y0 = Math.min(startCoords.y, y);
            const y1 = Math.max(startCoords.y, y);
            selectionBox = { x0, x1, y0, y1 };
            overlay
                .attr("x", x0)
                .attr("y", y0)
                .attr("width", x1 - x0)
                .attr("height", y1 - y0);
        }
    }

    function dragEnded(event) {
        zoomed(event);
    }

    function zoomReset() {
        xDomain(xBoundary);
        yDomain(yBoundary);
        redraw();
    }

    const drag = d3.drag().on("start", dragStarted).on("drag", dragged).on("end", dragEnded);

    svg.call(drag).on("dblclick", zoomReset);
}

/** Make axis */
export function makeTickFormat(options) {
    const type = options.type;
    const precision = options.precision;
    const categories = options.categories;
    const formatter = options.formatter;
    if (type == "hide") {
        formatter(() => "");
    } else if (type == "auto") {
        if (categories) {
            formatter((value) => categories[value] || "");
        }
    } else {
        const d3format = (d) => {
            switch (type) {
                case "s":
                    const prefix = d3.formatPrefix(d);
                    return prefix.scale(d).toFixed() + prefix.symbol;
                default:
                    return d3.format(`.${precision}${type}`)(d);
            }
        };
        if (categories) {
            formatter((value) => {
                const label = categories[value];
                if (label) {
                    if (isNaN(label)) {
                        return label;
                    } else {
                        try {
                            return d3format(label);
                        } catch (err) {
                            return label;
                        }
                    }
                } else {
                    return "";
                }
            });
        } else {
            formatter((value) => d3format(value));
        }
    }
}

/** Category make for unique category labels */
export function makeUniqueCategories(keys, groups, with_index = false) {
    const array = {};
    const categories = {};
    const counter = {};

    // prepare
    keys.forEach((key) => {
        array[key] = [];
        categories[key] = {};
        counter[key] = 0;
    });

    // index all values contained in label columns (for all groups)
    for (var i in groups) {
        var group = groups[i];
        for (var j in group) {
            var value_dict = group[j];
            for (var key of keys) {
                var value = String(value_dict[key]);
                if (categories[key][value] === undefined) {
                    array[key].push(with_index ? [counter[key], value] : value);
                    categories[key][value] = counter[key];
                    counter[key]++;
                }
            }
        }
    }

    // convert group values into category indeces
    for (const i in groups) {
        const group = groups[i];
        for (const j in group) {
            const value_dict = group[j];
            for (const key of keys) {
                const value = String(value_dict[key]);
                value_dict[key] = categories[key][value];
            }
        }
    }

    return array;
}
