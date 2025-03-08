HTMLCanvasElement.prototype.toDataURL = vi.fn();
HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    return {
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        getImageData: vi.fn(() => {
            return {
                data: new Array(100).fill(0),
            };
        }),
        putImageData: vi.fn(),
        createImageData: vi.fn(() => {
            return {
                data: new Array(100).fill(0),
            };
        }),
        setTransform: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        fillText: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn(() => {
            return { width: 0 };
        }),
        translate: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        rotate: vi.fn(),
    };
});
