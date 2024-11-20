import * as d3 from "d3";
import Colors from "./colorsets";
import { addZoom, makeTickFormat, makeUniqueCategories } from "./utilities";

export default class Heatmap {
    constructor(container, settings, track, trackData) {
        this.optionsDefault = {
            margin: {
                top: 40,
                right: 70,
                bottom: 70,
                left: 70,
            },
            style: {
                "font-weight": "normal",
                "font-family": "Verdana",
                "font-size": 12,
            },
            legend: {
                width: 15,
                size: 0.9,
                style: {
                    "font-weight": "normal",
                    "font-family": "Verdana",
                    "font-size": 11,
                },
                limit: 7,
            },
            background_color: "#FFFFFF",
            debug_color: "#FFFFFF",
        };

        this.settings = settings;
        this.container = container;
        this.track = track;

        this.data = [];
        const nData = Math.min(trackData.x.length, trackData.y.length, trackData.z.length);
        for (let i = 0; i < nData; i++) {
            this.data.push({
                x: trackData.x[i],
                y: trackData.y[i],
                z: trackData.z[i],
            });
        }

        this.options = { ...this.optionsDefault };

        this.color_set = Colors[this.settings.color_set ?? "seism"];

        this.categories = makeUniqueCategories(["x", "y"], [this.data]);

        this.xScale = d3.scaleLinear().domain([0, this.categories.x.length]);
        this.yScale = d3.scaleLinear().domain([0, this.categories.y.length]);

        this.zMin = d3.min(this.data, (d) => d.z);
        this.zMax = d3.max(this.data, (d) => d.z);
        this.zScale = d3.scaleQuantize().domain([this.zMin, this.zMax]).range(this.color_set);

        this.xAxis = d3.axisBottom(this.xScale);
        this.yAxis = d3.axisLeft(this.yScale);

        this._makeTickFormat("x");
        this._makeTickFormat("y");

        this.render();

        // Create the tooltip div
        this.tooltip = document.createElement("div");
        this.tooltip.style.position = "absolute";
        this.tooltip.style.backgroundColor = "#000000";
        this.tooltip.style.color = "#FFFFFF";
        this.tooltip.style.padding = "5px 10px";
        this.tooltip.style.borderRadius = "4px";
        this.tooltip.style.fontWeight = this.options.style["font-weight"];
        this.tooltip.style.fontFamily = this.options.style["font-family"];
        this.tooltip.style.fontSize = this.options.style["font-size"];
        this.tooltip.style.whiteSpace = "nowrap";
        this.tooltip.style.opacity = 0;
        this.tooltip.style.pointerEvents = "none";

        // Append to the container
        this.container.parentElement?.appendChild(this.tooltip);

        // Function to update tooltip text and position dynamically
        this.updateTooltip = function (d, x, y) {
            if (d) {
                this.tooltip.innerHTML = this._templateTooltip(d);
                this.tooltip.style.left = `${x}px`;
                this.tooltip.style.top = `${y}px`;
                this.tooltip.style.opacity = 0.8;
            } else {
                this.tooltip.style.opacity = 0;
            }
        };

        window.addEventListener("resize", () => this.render());

        addZoom({
            xAxis: this.xAxis,
            yAxis: this.yAxis,
            redraw: () => this.render(),
            svg: d3.select(this.container),
            margin: this.options.margin,
        });
    }

    render() {
        this.container.innerHTML = "";

        const xDomain = this.xScale.domain();
        const yDomain = this.yScale.domain();

        const xTickStart = Math.ceil(xDomain[0]);
        const xTickEnd = Math.floor(xDomain[1]);
        const yTickStart = Math.ceil(yDomain[0]);
        const yTickEnd = Math.floor(yDomain[1]);

        this.xAxis.tickValues(d3.range(xTickStart, xTickEnd, 1));
        this.yAxis.tickValues(d3.range(yTickStart, yTickEnd, 1));

        const { margin } = this.options;

        this.height = Math.min(
            Math.max(0, this.container.clientHeight - margin.top - margin.bottom),
            this.container.clientHeight,
        );
        this.width = Math.min(
            Math.max(0, this.container.clientWidth - margin.left - margin.right),
            this.container.clientWidth,
        );

        this.xScale.range([0, this.width]);
        this.yScale.range([this.height, 0]);

        this.rowCount = yDomain[1] - yDomain[0];
        this.colCount = xDomain[1] - xDomain[0];
        this.boxWidth = Math.min(Math.max(0, Math.floor(this.width / this.colCount)), this.width);
        this.boxHeight = Math.min(Math.max(0, Math.floor(this.height / this.rowCount)), this.height);

        this.svg = d3
            .select(this.container)
            .append("g")
            .attr("class", "heatmap")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        this._buildBoxes();
        this._buildX();
        this._buildY();

        if (String(this.settings.show_legend).toLowerCase() === "true") {
            this._buildLegend();
        }
    }

    _buildBoxes() {
        const _locator = (d) => `translate(${this.xScale(d.x)},${this.yScale(d.y + 1)})`;
        const _color = (d) => this.zScale(d.z);

        this.svg
            .append("rect")
            .attr("width", this.width)
            .attr("height", this.height)
            .attr("fill", this.options.background_color)
            .on("mouseleave", function () {
                self.updateTooltip();
            });

        const chartBody = this.svg.append("g").attr("clip-path", "url(#clip)");

        const self = this;
        chartBody
            .selectAll(".heatmap-box-group")
            .data(this.data, (d) => `${d.x}\0${d.y}`)
            .enter()
            .append("g")
            .attr("class", "heatmap-box-group")
            .append("rect")
            .attr("class", "heatmap-box-item")
            .attr("rx", 1)
            .attr("ry", 1)
            .attr("fill", _color)
            .attr("width", this.boxWidth)
            .attr("height", this.boxHeight)
            .attr("transform", _locator)
            .on("dblclick", function (evt, d) {
                var url = self.settings.url_template?.trim();
                if (url) {
                    evt.stopPropagation();
                    var xLabel = self.categories.x[d.x];
                    var yLabel = self.categories.y[d.y];
                    window.open(url.replace("__LABEL__", xLabel));
                    window.open(url.replace("__LABEL__", yLabel));
                }
            })
            .on("mouseover", function (event, d) {
                self.updateTooltip(d, event.x, event.y);
            })
            .exit();
    }

    _buildX() {
        var height = this.height;
        var width = this.width;
        var margin = this.options.margin;
        var svg = this.svg;
        var font_size = this.options.style["font-size"];
        var boxWidth = this.boxWidth;

        // draw x axis
        this.gxAxis = svg
            .append("g")
            .attr("class", "x axis")
            .style("stroke-width", 1)
            .attr("transform", "translate(0," + height + ")")
            .call(this.xAxis);

        // fix text
        var xFontSize = Math.min(boxWidth, font_size);
        this.gxAxis
            .selectAll("text")
            .style("font-size", xFontSize + "px")
            .attr("transform", function () {
                const bbox = this.getBBox();
                const y = -bbox.height - 15;
                const x = -xFontSize + boxWidth / 2;
                return `rotate(-90)translate(${y},${x})`;
            });

        // set background color
        svg.append("rect")
            .attr("width", width)
            .attr("height", font_size + 3)
            .attr("y", height + margin.bottom - font_size - 3)
            .attr("fill", this.options.debug_color)
            .attr("opacity", 0.7);

        // axis label
        this.gxAxisLabel = svg
            .append("text")
            .attr("class", "x label")
            .text(this.settings.x_axis_label)
            .style("font-weight", this.options.style["font-weight"])
            .style("font-family", this.options.style["font-family"])
            .style("font-size", font_size)
            .attr("transform", function (d) {
                var y = height + margin.bottom - font_size / 3;
                var x = (width - this.getBBox().width) / 2;
                return "translate(" + x + "," + y + ")";
            });

        // chart title
        this.gxTickLabel = svg
            .append("text")
            .attr("class", "title")
            .style("font-weight", "normal")
            .style("font-family", "Verdana")
            .style("font-size", 1.1 * font_size)
            .text(this.track.key)
            .attr("transform", function (d) {
                var y = -margin.top / 2;
                var x = (width - this.getBBox().width) / 2;
                return "translate(" + x + "," + y + ")";
            });
    }

    _buildY() {
        var height = this.height;
        var margin = this.options.margin;
        var svg = this.svg;
        var font_size = this.options.style["font-size"];
        var boxHeight = this.boxHeight;

        // draw y axis
        this.gyAxis = svg.append("g").attr("class", "y axis").style("stroke-width", 1).call(this.yAxis);

        // fix text
        var yFontSize = Math.min(boxHeight, font_size);
        this.gyAxis
            .selectAll("text")
            .style("font-size", yFontSize + "px")
            .attr("y", -boxHeight / 2);

        // set background color
        svg.append("rect")
            .attr("width", font_size)
            .attr("height", height)
            .attr("x", -margin.left)
            .attr("fill", this.options.debug_color)
            .attr("opacity", 0.7);

        // axis label
        this.gyAxisLabel = svg
            .append("text")
            .attr("class", "y label")
            .style("font-weight", this.options.style["font-weight"])
            .style("font-family", this.options.style["font-family"])
            .style("font-size", font_size)
            .text(this.settings.y_axis_label)
            .attr("transform", function (d) {
                var x = -margin.left + font_size - 2;
                var y = -(height + this.getBBox().width) / 2;
                return "rotate(-90)translate(" + y + "," + x + ")";
            });
    }

    _buildLegend() {
        var self = this;
        var height = this.height;
        var width = this.width;
        var margin = this.options.margin;
        var font_size = this.options.legend.style["font-size"];
        var limit = this.options.legend.limit;
        var legendSize = this.options.legend.size;
        var legendWidth = this.options.legend.width;
        var legendElements = this.zScale.range().length;
        var legendElementHeight = Math.max((legendSize * height) / legendElements, font_size);
        var legendHeight = (legendElements * legendElementHeight) / 2;
        var data = d3.range(this.zMin, this.zMax, (2 * (this.zMax - this.zMin)) / legendElements).reverse();
        if (data.length < 2) {
            return;
        }
        var legend = this.svg
            .selectAll(".legend")
            .data(data)
            .enter()
            .append("g")
            .attr("class", "legend")
            .attr("transform", function (d, i) {
                var x = width + 10;
                var y = (height - legendHeight) / 2 + i * legendElementHeight;
                return "translate(" + x + "," + y + ")";
            });
        legend
            .append("rect")
            .attr("width", legendWidth)
            .attr("height", legendElementHeight)
            .style("fill", function (z) {
                return self.zScale(z);
            });
        legend
            .append("text")
            .attr("x", legendWidth + 4)
            .attr("y", function () {
                return (legendElementHeight + this.getBBox().height) / 2;
            })
            .style("font-weight", "normal")
            .style("font-family", "Verdana")
            .style("font-size", 11)
            .text(function (d) {
                return String(d).length > limit ? String(d).substring(0, limit - 2) + ".." : String(d);
            });
        this.svg
            .append("text")
            .style("font-size", 9)
            .style("font-weight", "bold")
            .text("Legend")
            .attr("transform", function (d, i) {
                var x = width + (margin.right - this.getBBox().width) / 2;
                var y = (height - legendHeight) / 2 - 10;
                return "translate(" + x + "," + y + ")";
            });
    }

    _makeTickFormat(id) {
        makeTickFormat({
            categories: this.categories[id],
            type: this.settings[`${id}_axis_type`].type,
            precision: this.settings[`${id}_axis_type`].precision,
            formatter: (formatter) => {
                if (formatter) {
                    this[`${id}Axis`].tickFormat((value) => formatter(value));
                }
            },
        });
    }

    // Handle error
    _handleError(err) {
        console.error(err);
    }

    // Main template
    _templateTooltip(d) {
        var x = this.categories.x[d.x];
        var y = this.categories.y[d.y];
        var z = d.z;
        return `<table>
                    <tr>
                        <td class="charts-tooltip-first">Row:</td>
                        <td>${y}</td>
                    </tr>
                    <tr>
                        <td class="charts-tooltip-first">Column:</td>
                        <td>${x}</td>
                    </tr>
                    <tr>
                        <td class="charts-tooltip-first">Value:</td>
                        <td>${z}</td>
                    </tr>
                </table>`;
    }
}
