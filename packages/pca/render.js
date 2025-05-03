import Plotly from "plotly.js-dist";
import { PCA } from "ml-pca";

const MAX_SIZE = 1024 * 256;

export async function render(container, url) {
    let annotations = [];
    let colors = [];
    let colorColumn = 1;
    let data = [];
    let dataStart = 2;
    let header = [];
    let pcaResult = [];

    // add message
    const messageElement = document.createElement("div");
    messageElement.id = "message";
    container.appendChild(messageElement);

    // add vis container
    const visualizationElement = document.createElement("div");
    visualizationElement.id = "visualisation";

    try {
        showMessage("Please wait...", false);
        const response = await fetch(url);
        hideMessage();
        const text = await response.text();
        const parsed = parseCSV(text);
        header = parsed.header;
        data = parsed.data;

        injectControls();
        updateVisualization();
    } catch (err) {
        showMessage(err.message || "Failed to render PCA visualization.");
    }

    function parseCSV(text) {
        const size = new Blob([text]).size;
        if (size > MAX_SIZE) {
            throw new Error("Dataset too large to render (max 100 KB).");
        }

        const lines = text.trim().split("\n").filter(Boolean);
        const rows = lines.map((line) =>
            line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((v) => v.trim().replace(/^"|"$/g, "")),
        );

        if (rows.length < 2) {
            throw new Error("Not enough data rows.");
        }
        return {
            header: rows[0],
            data: rows.slice(1),
        };
    }

    function injectControls() {
        const wrapper = document.createElement("div");
        wrapper.id = "wrapper";

        const controls = document.createElement("div");
        controls.id = "controls";

        const label1 = document.createElement("label");
        label1.textContent = "Color by:";

        const selectColour = document.createElement("select");
        selectColour.id = "color_column";

        for (let i = 0; i < header.length; i++) {
            const option = document.createElement("option");
            option.value = i;
            option.textContent = header[i];
            if (i === colorColumn) {
                option.selected = true;
            }
            selectColour.appendChild(option);
        }
        selectColour.onchange = () => {
            colorColumn = parseInt(selectColour.value);
            updateVisualization();
        };

        const label2 = document.createElement("label");
        label2.textContent = "Start at:";

        const selectStart = document.createElement("select");
        selectStart.id = "data_start";

        for (let i = 0; i <= header.length - 3; i++) {
            let isValidBlock = true;

            for (let j = i; j < i + 3; j++) {
                if (
                    !data.every((row) => {
                        const val = row[j]?.trim();
                        return val !== "" && isFinite(Number(val));
                    })
                ) {
                    isValidBlock = false;
                    break;
                }
            }

            if (isValidBlock) {
                const option = document.createElement("option");
                option.value = i;
                option.textContent = `${i} (${header[i]})`;
                if (i === dataStart) {
                    option.selected = true;
                }
                selectStart.appendChild(option);
            }
        }

        selectStart.onchange = () => {
            dataStart = parseInt(selectStart.value);
            updateVisualization();
        };

        controls.appendChild(label1);
        controls.appendChild(selectColour);
        controls.appendChild(label2);
        controls.appendChild(selectStart);

        wrapper.appendChild(controls);
        wrapper.appendChild(visualizationElement);
        container.appendChild(wrapper);
    }

    function updateVisualization() {
        const numerical = [];
        const filteredAnnotations = [];
        const filteredColors = [];

        for (const row of data) {
            const nums = row.slice(dataStart).map((v) => Number(v.trim()));
            if (nums.every((n) => !isNaN(n))) {
                numerical.push(nums);
                filteredAnnotations.push(
                    header
                        .slice(0, dataStart)
                        .map((key, i) => `<b>${key}</b>: ${row[i]}`)
                        .join("<br>"),
                );
                filteredColors.push(row[colorColumn]);
            }
        }

        if (numerical.length > 0) {
            const cleaned = removeConstantColumns(numerical);
            if (cleaned[0].length >= 3) {
                try {
                    const pca = new PCA(cleaned, { center: true, scale: true });
                    const result = pca.predict(cleaned, { nComponents: 3 }).to2DArray();
                    pcaResult = result;
                    colors = filteredColors;
                    annotations = filteredAnnotations;
                    renderPlot();
                    hideMessage();
                } catch (e) {
                    showMessage("PCA failed: " + e.message);
                }
            } else {
                showMessage("Too few variable features remain for PCA.");
            }
        } else {
            showMessage("Column data not numerical.", false);
        }
    }

    function removeConstantColumns(matrix) {
        const numCols = matrix[0].length;
        const transposed = Array.from({ length: numCols }, (_, colIdx) => matrix.map((row) => row[colIdx]));
        const filteredCols = transposed.filter((col) => {
            const first = col[0];
            return col.some((v) => v !== first);
        });
        return matrix.map((_, rowIdx) => filteredCols.map((col) => col[rowIdx]));
    }

    function renderPlot() {
        const uniqueGroups = [...new Set(colors)];
        const layout = {
            hoverlabel: { bgcolor: "#FFF" },
            scene: {
                xaxis: { title: "PC 1", zerolinecolor: "#CCC" },
                yaxis: { title: "PC 2", zerolinecolor: "#CCC" },
                zaxis: { title: "PC 3", zerolinecolor: "#CCC" },
            },
            margin: { l: 0, r: 0, b: 0, t: 20 },
        };

        const traces = uniqueGroups.map((group, i) => {
            const indices = colors.map((val, idx) => (val === group ? idx : -1)).filter((idx) => idx !== -1);
            const points = indices.map((idx) => pcaResult[idx]);
            const texts = indices.map((idx) => annotations[idx]);
            return {
                x: points.map((p) => p[0]),
                y: points.map((p) => p[1]),
                z: points.map((p) => p[2]),
                text: texts,
                name: group,
                type: "scatter3d",
                mode: "markers",
                marker: {
                    size: 6,
                    color: i,
                    opacity: 0.8,
                    colorscale: "Jet",
                },
                hovertemplate: "%{text}<br>PC 1: %{x:.5f}<br>PC 2: %{y:.5f}<br>PC 3: %{z:.5f}<extra></extra>",
            };
        });

        // render plot
        Plotly.newPlot(visualizationElement, traces, layout);

        // handle resizing
        function resize() {
            Plotly.Plots.resize(visualizationElement);
        }
        window.removeEventListener("resize", resize);
        window.addEventListener("resize", resize);
    }

    function showMessage(msg, isError = true) {
        messageElement.innerHTML = msg;
        messageElement.style.display = "inline";
        if (isError) {
            console.error(msg);
        }
    }

    function hideMessage() {
        messageElement.style.display = "none";
    }
}
