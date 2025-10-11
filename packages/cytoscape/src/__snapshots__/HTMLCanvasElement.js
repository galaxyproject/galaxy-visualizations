HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,MOCKDATA");

HTMLCanvasElement.prototype.getContext = vi.fn(function () {
    const canvas = this;
    if (!canvas._opsContainer) {
        const opsContainer = document.createElement("div");
        opsContainer.setAttribute("data-canvas-ops", "");
        canvas.insertAdjacentElement("afterend", opsContainer);
        canvas._opsContainer = opsContainer;
    }
    const opsContainer = canvas._opsContainer;
    function logOp(name, ...args) {
        const div = document.createElement("div");
        div.textContent = `${name}(${args.map((a) => JSON.stringify(a)).join(", ")})`;
        opsContainer.appendChild(div);
    }
    return {
        fillRect(x, y, w, h) {
            logOp("fillRect", x, y, w, h);
        },
        clearRect(x, y, w, h) {
            logOp("clearRect", x, y, w, h);
        },
        getImageData(x, y, w, h) {
            logOp("getImageData", x, y, w, h);
            return { data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData(imageData, x, y) {
            logOp("putImageData", x, y);
        },
        createImageData(w, h) {
            logOp("createImageData", w, h);
            return { data: new Uint8ClampedArray(w * h * 4) };
        },
        setTransform() {
            logOp("setTransform");
        },
        drawImage() {
            logOp("drawImage");
        },
        save() {
            logOp("save");
        },
        fillText(text, x, y) {
            logOp("fillText", text, x, y);
        },
        restore() {
            logOp("restore");
        },
        measureText() {
            logOp("measureText");
            return { width: 42 };
        },
        translate(x, y) {
            logOp("translate", x, y);
        },
        beginPath() {
            logOp("beginPath");
        },
        arc(x, y, r) {
            logOp("arc", x, y, r);
        },
        fill() {
            logOp("fill");
        },
        closePath() {
            logOp("closePath");
        },
        moveTo(x, y) {
            logOp("moveTo", x, y);
        },
        lineTo(x, y) {
            logOp("lineTo", x, y);
        },
        rotate(a) {
            logOp("rotate", a);
        },
        scale(x, y) {
            logOp("scale", x, y);
        },
        stroke() {
            logOp("stroke");
        },
        strokeRect(x, y, w, h) {
            logOp("strokeRect", x, y, w, h);
        },
        clip() {
            logOp("clip");
        },
    };
});
