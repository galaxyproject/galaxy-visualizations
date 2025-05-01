import * as vis from "vis";
import borderIcon from "./assets/border.png?inline";
import loopIcon from "./assets/loop.png?inline";
import fireIcon from "./assets/fire.png?inline";

export async function renderVisualization(container, url) {
    const MAX_SIZE = 100000;

    function toCounter(state, ordering) {
        if (state === "(inf,)") return Infinity;

        const parsed = state
            .replace(/[()]/g, "") // Remove parentheses
            .split(",") // Split by comma
            .map((x) => parseFloat(x)); // Convert to numbers

        if (parsed[0] === Infinity) return Infinity;

        const counter = {};
        for (let i = 0; i < ordering.length; i++) {
            const value = parsed[i];
            if (value !== 0) {
                counter[ordering[i]] = value;
            }
        }
        return counter;
    }

    function nodeToString(node) {
        if (node === Infinity) return "inf";
        return Object.entries(node)
            .map(([k, v]) => `${parseInt(v)} ${k}`)
            .join("<br>");
    }

    function sideToString(side) {
        if (side === Infinity) return "inf";
        return Object.entries(side)
            .map(([k, v]) => `${parseInt(v)} ${k}`)
            .join(" + ");
    }

    function createSides(lhs, rhs) {
        if (lhs === Infinity) return [Infinity, Infinity];
        if (rhs === Infinity) return [{}, Infinity];
        const left = {},
            right = {};
        for (const k in lhs) {
            const diff = (lhs[k] || 0) - (rhs[k] || 0);
            if (diff > 0) left[k] = diff;
        }
        for (const k in rhs) {
            const diff = (rhs[k] || 0) - (lhs[k] || 0);
            if (diff > 0) right[k] = diff;
        }
        return [left, right];
    }

    function writeNode(id, label, nodeClass) {
        if (label === "inf") nodeClass = "hell";
        return { id, label: String(id), class: nodeClass, shape: "ellipse", title: String(id), text: label };
    }

    function writeReaction(edgeId, from, to, substrates, products, rate, label) {
        rate = rate ? ` @ ${rate}` : "";
        label = label ? `${label} ~ ` : "";
        return {
            id: edgeId,
            from,
            to,
            arrows: "to",
            text: `${label}${sideToString(substrates)} => ${sideToString(products)}${rate}`,
        };
    }

    function createMarkup(container) {
        container.innerHTML = `
            <div id="viewer">
                <div id="network"></div>
                <div id="controls">
                    <div class="control">
                        <img src="${borderIcon}" class="ts_img">
                        <label class="switch">
                            <input type="checkbox" id="border_nodes">
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div class="control">
                        <img src="${loopIcon}" class="ts_img">
                        <label class="switch">
                            <input type="checkbox" id="loop_edges">
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div class="control">
                        <img src="${fireIcon}" class="ts_img">
                        <label class="switch">
                            <input type="checkbox" id="hell_node">
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>
            </div>
            <div id="rectangle"></div>
            <div id="loading">
                <div id="bar"></div>
                <div id="text">0%</div>
            </div>
        `;
    }

    createMarkup(container);

    const response = await fetch(url);
    const text = await response.text();
    if (text.length > MAX_SIZE) throw new Error("Dataset too large");
    const data = JSON.parse(text);

    const ordering = data.ordering;
    const nodes = {};
    for (const key in data.nodes) {
        nodes[key] = toCounter(data.nodes[key], ordering);
    }

    const borderNodes = new Set();
    const edges = [],
        selfLoops = [];

    data.edges.forEach((edge, i) => {
        const id = i + 1;
        const [subs, prods] = createSides(nodes[edge.s], nodes[edge.t]);
        const e = [id, edge.s, edge.t, subs, prods, edge.p, edge.label];
        edges.push(e);
        if (edge.s === edge.t) selfLoops.push(e);
        if (prods === Infinity && subs !== Infinity) borderNodes.add(String(edge.s));
    });

    const nodesArr = [],
        borderNodesArr = [];
    for (const id in nodes) {
        const state = nodes[id];
        const label = nodeToString(state);
        const nodeClass = borderNodes.has(id) ? "border" : "default";
        const node = writeNode(id, label, nodeClass);
        nodesArr.push(node);
        if (nodeClass === "border") borderNodesArr.push(node);
    }

    const edgesArr = edges.map((e) => writeReaction(...e));
    const selfLoopsArr = selfLoops.map((e) => writeReaction(...e));

    const iterations = (Object.keys(nodes).length / 100 + 1) * 100;
    const step = iterations / 100;
    const visNodes = new vis.DataSet(nodesArr);
    const visEdges = new vis.DataSet(edgesArr);

    const options = {
        layout: { improvedLayout: true },
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -25000,
                centralGravity: 0.5,
                springConstant: 0.5,
                springLength: 200,
                damping: 0.15,
            },
            maxVelocity: 50,
            minVelocity: 7.5,
            solver: "barnesHut",
            timestep: 0.5,
            stabilization: {
                enabled: true,
                iterations,
                updateInterval: step,
            },
        },
        nodes: {
            size: 15,
            font: { size: 20 },
            borderWidth: 2,
            borderWidthSelected: 4,
            color: { highlight: { border: "#B20F0F", background: "red" } },
        },
        edges: {
            width: 4,
            selectionWidth: (width) => width * 2.5,
            color: { color: "#2B7CE9", hover: "#2B7CE9", highlight: "red" },
        },
        interaction: {
            navigationButtons: true,
            keyboard: true,
            hover: true,
            tooltipDelay: 500,
            multiselect: true,
        },
    };

    const networkContainer = document.getElementById("network");

    let noHell = false;
    const nodesFilter = (node) => (noHell ? node.class !== "hell" : true);
    const nodesView = new vis.DataView(visNodes, { filter: nodesFilter });

    document.getElementById("hell_node").addEventListener("change", (e) => {
        noHell = !e.target.checked;
        nodesView.refresh();
    });

    document.getElementById("loop_edges").addEventListener("change", (e) => {
        if (e.target.checked) {
            selfLoopsArr.forEach((loop) => visEdges.add(loop));
        } else {
            selfLoopsArr.forEach((loop) => visEdges.remove({ id: loop.id }));
        }
    });

    document.getElementById("border_nodes").addEventListener("change", (e) => {
        borderNodesArr.forEach((node) => {
            visNodes.update({ id: node.id, shape: e.target.checked ? "box" : "ellipse" });
        });
    });

    const dataVis = { nodes: nodesView, edges: visEdges };
    const network = new vis.Network(networkContainer, dataVis, options);

    const fromNode = String(data.initial);
    const clickedNode = visNodes.get(fromNode);
    if (clickedNode) {
        clickedNode.color = {
            border: "orange",
            background: "orange",
            highlight: { border: "orange", background: "orange" },
        };
        visNodes.update(clickedNode);
    }

    let stabil = true;

    network.on("click", (params) => {
        let content = "";
        if (params.nodes.length > 0) {
            content = nodesView.get(params.nodes[0]).text;
        } else if (params.edges.length > 0) {
            content = visEdges.get(params.edges[0]).text;
        }
        document.getElementById("rectangle").innerHTML = content;
    });

    network.on("stabilized", () => {
        if (stabil) {
            network.fit();
            stabil = false;
        }
    });

    network.once("stabilizationIterationsDone", () => {
        document.getElementById("text").innerHTML = "100%";
        document.getElementById("bar").style.width = "100%";
        document.getElementById("loading").style.opacity = 0;
        setTimeout(() => {
            document.getElementById("loading").style.display = "none";
        }, 0);
    });

    network.on("doubleClick", (params) => {
        network.focus(params.nodes);
    });

    network.on("stabilizationProgress", (params) => {
        const widthFactor = params.iterations / iterations;
        const progress = Math.round(widthFactor * 100) + "%";
        document.getElementById("bar").style.width = progress;
        document.getElementById("text").innerHTML = progress;
    });

    window.addEventListener("resize", () => {
        network.fit();
    });
}
