var _JUPYTERLAB = _JUPYTERLAB || {};
_JUPYTERLAB["jl-galaxy"] = {
    init: async () => {},
    get: async (request) => {
        if (request === "./extension") {
            return async () => (await import("./extension.js")).default;
        }
        throw new Error("Unknown request: " + request);
    },
};
