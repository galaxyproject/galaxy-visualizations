import _ from "underscore";
import * as d3 from "d3";

/** Add zoom handler */
export function addZoom(options) {
    const scaleExtent = 100;
    const yAxis = options.yAxis;
    const xAxis = options.xAxis;
    const xDomain = options.xDomain || xAxis.scale().domain;
    const yDomain = options.yDomain || yAxis.scale().domain;
    const redraw = options.redraw;
    const svg = options.svg;
    const xScale = xAxis.scale();
    const yScale = yAxis.scale();
    const x_boundary = xScale.domain().slice();
    const y_boundary = yScale.domain().slice();
    const d3zoom = d3.behavior.zoom();
    xScale.nice();
    yScale.nice();
    function fixDomain(domain, boundary) {
        domain[0] = Math.min(Math.max(domain[0], boundary[0]), boundary[1] - boundary[1] / scaleExtent);
        domain[1] = Math.max(boundary[0] + boundary[1] / scaleExtent, Math.min(domain[1], boundary[1]));
        return domain;
    }
    function zoomed() {
        yDomain(fixDomain(yScale.domain(), y_boundary));
        xDomain(fixDomain(xScale.domain(), x_boundary));
        redraw();
    }
    function unzoomed() {
        xDomain(x_boundary);
        yDomain(y_boundary);
        redraw();
        d3zoom.scale(1);
        d3zoom.translate([0, 0]);
    }
    d3zoom.x(xScale).y(yScale).scaleExtent([1, scaleExtent]).on("zoom", zoomed);
    svg.call(d3zoom).on("dblclick.zoom", unzoomed);
    return d3zoom;
}

/** Get domain boundaries value */
export function getDomains(groups, keys) {
    function _apply(operator, key) {
        let value;
        for (const group_index in groups) {
            const value_sub = d3[operator](groups[group_index].values, (d) => d[key]);
            value = value === undefined ? value_sub : Math[operator](value, value_sub);
        }
        return value;
    }
    const result = {};
    for (const index in keys) {
        const key = keys[index];
        result[key] = {
            min: _apply("min", key),
            max: _apply("max", key),
        };
    }
    return result;
}

/** Default category maker */
export function makeCategories(groups, column_keys) {
    const array = {};
    const data_columns = groups[0].__data_columns;
    _.each(column_keys, (key) => {
        const data_entry = data_columns && data_columns[key];
        if (data_entry && data_entry.is_label) {
            array[key] = [];
        }
    });
    if (groups && groups[0]) {
        _.each(groups[0].values, (value_dict) => {
            for (const key in array) {
                array[key].push(String(value_dict[key]));
            }
        });
    }
    mapCategories(array, groups);
    return { array };
}

/** Default series maker */
export function makeSeries(groups, keys) {
    const plot_data = [];
    for (const group_index in groups) {
        const group = groups[group_index];
        const data = [];
        for (const value_index in group.values) {
            const point = [];
            if (keys) {
                for (const key_index in keys) {
                    const column_index = keys[key_index];
                    point.push(group.values[value_index][column_index]);
                }
            } else {
                for (const column_index in group.values[value_index]) {
                    point.push(group.values[value_index][column_index]);
                }
            }
            data.push(point);
        }
        plot_data.push(data);
    }
    return plot_data;
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
export function makeUniqueCategories(groups, with_index) {
    const categories = {};
    const array = {};
    const counter = {};
    const data_columns = groups[0].__data_columns;
    _.each(data_columns, ({ is_label }, key) => {
        if (is_label) {
            categories[key] = {};
            array[key] = [];
            counter[key] = 0;
        }
    });
    // index all values contained in label columns (for all groups)
    for (var i in groups) {
        var group = groups[i];
        for (var j in group.values) {
            var value_dict = group.values[j];
            for (var key in categories) {
                var value = String(value_dict[key]);
                if (categories[key][value] === undefined) {
                    categories[key][value] = counter[key];
                    array[key].push(with_index ? [counter[key], value] : value);
                    counter[key]++;
                }
            }
        }
    }
    // convert group values into category indeces
    for (const i in groups) {
        const group = groups[i];
        for (const j in group.values) {
            const value_dict = group.values[j];
            for (const key in categories) {
                const value = String(value_dict[key]);
                value_dict[key] = categories[key][value];
            }
        }
    }
    return {
        categories,
        array,
        counter,
    };
}

/** Apply default mapping index all values contained in label columns (for all groups) */
export function mapCategories(array, groups) {
    _.each(groups, ({ values }) => {
        _.each(values, (value_dict, i) => {
            for (const key in array) {
                value_dict[key] = parseInt(i);
            }
        });
    });
}
