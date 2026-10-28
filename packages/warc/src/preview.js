const POLICY =
    "default-src 'none'; script-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'";
const TAGS = new Set(
    "a abbr article aside b blockquote br caption code col colgroup dd del details div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img li main mark nav ol p pre s section small span strong style sub summary sup table tbody td tfoot th thead tr u ul".split(
        " ",
    ),
);
const ATTRS = new Set(["class", "style", "title", "alt", "width", "height", "colspan", "rowspan", "open"]);
const DROP = new Set(["script", "iframe", "object", "embed", "template", "meta", "link", "base", "svg", "math"]);

function dataUrl(bytes, type) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:${type};base64,${btoa(binary)}`;
}

/** Project archived HTML onto static markup: no navigation, handlers, or live URLs. */
function staticHtml(text) {
    const template = document.createElement("template");
    template.innerHTML = text;
    function copy(node, parent) {
        if (node.nodeType === Node.TEXT_NODE) {
            parent.appendChild(document.createTextNode(node.textContent));
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.localName;
        if (DROP.has(tag)) return;
        let target = parent;
        if (TAGS.has(tag)) {
            target = document.createElement(tag);
            for (const { name, value } of node.attributes) {
                if (ATTRS.has(name)) target.setAttribute(name, value);
                if (
                    tag === "img" &&
                    name === "src" &&
                    /^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,/i.test(value)
                ) {
                    target.setAttribute("src", value);
                }
            }
            parent.appendChild(target);
        }
        for (const child of node.childNodes) copy(child, target);
    }
    const container = document.createElement("div");
    for (const node of template.content.childNodes) copy(node, container);
    return container.innerHTML;
}

function payloadDocument(bytes, contentType) {
    const type = (contentType || "").split(";")[0].trim().toLowerCase();
    const container = document.createElement("div");
    if (type === "text/html" || type === "application/xhtml+xml") {
        container.innerHTML = staticHtml(new TextDecoder().decode(bytes));
    } else if (/^image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)$/.test(type)) {
        const img = document.createElement("img");
        img.src = dataUrl(bytes, type);
        img.alt = "Archived image";
        img.style.maxWidth = "100%";
        container.appendChild(img);
    } else if (/^(audio|video)\/[a-z0-9.+-]+$/.test(type)) {
        const media = document.createElement(type.split("/")[0]);
        media.controls = true;
        media.src = dataUrl(bytes, type);
        container.appendChild(media);
    } else {
        const pre = document.createElement("pre");
        pre.textContent = new TextDecoder().decode(bytes);
        pre.style.whiteSpace = "pre-wrap";
        container.appendChild(pre);
    }
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLICY}"></head><body>${container.innerHTML}</body></html>`;
}

export function previewPayload(bytes, type) {
    const popup = window.open("", "_blank");
    if (!popup) throw new Error("Allow pop-ups to preview the selected record.");
    popup.opener = null;
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.title = "Archived payload";
    frame.srcdoc = payloadDocument(bytes, type);
    // The controlled wrapper and sandboxed child both forbid script execution.
    const outerPolicy = POLICY.replace("frame-src 'none'", "frame-src 'self'");
    popup.document.write(
        `<!doctype html><html><head><title>Archived payload</title><meta http-equiv="Content-Security-Policy" content="${outerPolicy}"><style>html,body{margin:0;height:100%;font:13px system-ui}p{margin:0;padding:8px;background:#fff3cd}iframe{width:100%;height:calc(100% - 48px);border:0}</style></head><body><p>Archived record preview · scripts, links, and live resources disabled</p>${frame.outerHTML}</body></html>`,
    );
    popup.document.close();
}
