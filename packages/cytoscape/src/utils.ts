import {
    type CollectionReturnValue,
    type NodeCollection,
    type Core,
    type Stylesheet,
    type ElementDefinition,
} from "cytoscape";

// Add a node
function getNode(id: string, nodes: NodeCollection | {}) {
    if (!nodes[id]) {
        nodes[id] = { id: id };
    }

    return nodes[id];
}

// Parse each line of the SIF file
function parse(line: string, nodes: NodeCollection | {}, links: NodeCollection | {}) {
    const lines = line.split("\t").length > 1 ? line.split("\t") : line.split(" ");

    const source = getNode(lines[0], nodes);
    const interaction = lines[1] ? lines[1] : "";

    if (lines.length && lines.length > 0 && lines[0] !== "") {
        if (interaction !== "") {
            // Get all the target nodes for a source
            for (let j = 2; j < lines.length; j++) {
                if (lines[j] !== "") {
                    // Create an object for each target for the source
                    const target = getNode(lines[j], nodes);

                    const relationObject = {
                        target: target.id,
                        source: source.id,
                        id: source.id + target.id,
                        // Replace quotes in relation
                        relation: interaction.replace(/[''""]+/g, ""),
                    };

                    if (source.id < target.id) {
                        links[source.id + target.id + interaction] = relationObject;
                    } else {
                        links[target.id + source.id + interaction] = relationObject;
                    }
                }
            }
        } else {
            // Handle the case of single node i.e. no relation with any other node
            links[source.id] = { target: "", source: source.id, id: source.id, relation: "" };
        }
    }
}

// Make content from list of nodes and links
function toDataArr(nodes: NodeCollection | {}, links: NodeCollection | {}) {
    const content: ElementDefinition[] = [];

    // Make a list of all nodes
    for (const key in nodes) {
        content.push({ data: nodes[key] });
    }

    // Make a list of all relationships among nodes
    for (const key in links) {
        content.push({ data: links[key] });
    }

    return content;
}

export function parseSIF(text: string) {
    const nodes: NodeCollection | {} = {};
    const links: NodeCollection | {} = {};
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
        if (lines[i] !== "") {
            parse(lines[i], nodes, links);
        }
    }

    return { content: toDataArr(nodes, links) };
}

export function runSearchAlgorithm(cytoscape: Core, rootId: string, type: string, self?: any) {
    let algorithm: any;
    let i = 0;

    function selectNextElement() {
        if (i < algorithm.path.length) {
            // Add css class for the selected edge(s)
            algorithm.path[i].addClass("searchpath");
            i++;
            // Animate the edges and nodes coloring
            // of the path with a delay of 500ms
            setTimeout(selectNextElement, 500);
        }
    }

    switch (type) {
        // Breadth First Search
        case "bfs":
            algorithm = cytoscape.elements().bfs({ root: "#" + rootId, directed: true });
            selectNextElement();
            break;
        // Depth First Search
        case "dfs":
            algorithm = cytoscape.elements().dfs({ root: "#" + rootId, directed: true });
            selectNextElement();
            break;
        // A* search
        case "astar":
            // Choose root and destination for performing A*
            if (!self.astar_root) {
                self.astar_root = rootId;
            } else {
                self.astar_destination = rootId;
            }
            if (self.astar_root && self.astar_destination) {
                algorithm = cytoscape
                    .elements()
                    .aStar({ root: "#" + self.astar_root, goal: "#" + self.astar_destination, directed: true });
                selectNextElement();
            }
        default:
            return;
    }
}

export function runTraversalType(cytoscape: Core, rootId: string, type: string) {
    let nodeCollection: CollectionReturnValue | NodeCollection;

    switch (type) {
        // Recursively get edges (and their sources) coming into the nodes in a collection
        case "predecessors":
            nodeCollection = cytoscape.$("#" + rootId).predecessors();
            break;
        // Recursively get edges (and their targets) coming out of the nodes in a collection
        case "successors":
            nodeCollection = cytoscape.$("#" + rootId).successors();
            break;
        // Get edges (and their targets) coming out of the nodes in a collection.
        case "outgoers":
            nodeCollection = cytoscape.$("#" + rootId).outgoers();
            break;
        // Get edges (and their sources) coming into the nodes in a collection.
        case "incomers":
            nodeCollection = cytoscape.$("#" + rootId).incomers();
            break;
        // From the set of calling nodes, get the nodes which are roots
        case "roots":
            nodeCollection = cytoscape.$("#" + rootId).roots();
            break;
        // From the set of calling nodes, get the nodes which are leaves
        case "leaves":
            nodeCollection = cytoscape.$("#" + rootId).leaves();
            break;
        default:
            return;
    }

    // Add CSS class for selected nodes and edges
    nodeCollection.edges().addClass("searchpath");
    nodeCollection.nodes().addClass("searchpath");
}

export function styleGenerator(settings: any): Stylesheet[] {
    return [
        {
            selector: "node",
            style: {
                "background-color": settings.color_picker_nodes,
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
                "curve-style": settings.curve_style,
                "haystack-radius": 0,
                width: 3,
                opacity: 1,
                "line-color": settings.color_picker_edges,
                "overlay-padding": "3px",
                ...(settings.directed ? { "target-arrow-shape": "triangle" } : {}),
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
                "background-color": settings.color_picker_highlighted,
                "line-color": settings.color_picker_highlighted,
                "target-arrow-color": settings.color_picker_highlighted,
                "transition-property": "background-color, line-color, target-arrow-color",
                "transition-duration": "0.5s",
            },
        },
    ];
}
