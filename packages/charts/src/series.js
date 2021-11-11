import _ from "underscore";
import * as d3 from "d3";

/** Category make for unique category labels */
function makeUniqueCategories(groups, with_index) {
    var categories = {};
    var array = {};
    var counter = {};
    var data_columns = groups[0].__data_columns;
    _.each(data_columns, function (column_def, key) {
        if (column_def.is_label) {
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
        categories: categories,
        array: array,
        counter: counter,
    };
}

/** Make axis */
function makeTickFormat(options) {
    var type = options.type;
    var precision = options.precision;
    var categories = options.categories;
    var formatter = options.formatter;
    if (type == "hide") {
        formatter(function () {
            return "";
        });
    } else if (type == "auto") {
        if (categories) {
            formatter(function (value) {
                return categories[value] || "";
            });
        }
    } else {
        var d3format = function (d) {
            switch (type) {
                case "s":
                    var prefix = d3.formatPrefix(d);
                    return prefix.scale(d).toFixed() + prefix.symbol;
                default:
                    return d3.format("." + precision + type)(d);
            }
        };
        if (categories) {
            formatter(function (value) {
                var label = categories[value];
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
            formatter(function (value) {
                return d3format(value);
            });
        }
    }
}

/** Add zoom handler */
function addZoom(options) {
    var scaleExtent = 100;
    var yAxis = options.yAxis;
    var xAxis = options.xAxis;
    var xDomain = options.xDomain || xAxis.scale().domain;
    var yDomain = options.yDomain || yAxis.scale().domain;
    var redraw = options.redraw;
    var svg = options.svg;
    var xScale = xAxis.scale();
    var yScale = yAxis.scale();
    var x_boundary = xScale.domain().slice();
    var y_boundary = yScale.domain().slice();
    var d3zoom = d3.behavior.zoom();
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

export default {
    makeUniqueCategories: makeUniqueCategories,
    makeTickFormat: makeTickFormat,
    addZoom: addZoom,
};