# JupyterLite + Pyodide Setup

This project integrates JupyterLite with the Pyodide kernel and custom extensions such as `jl-galaxy`.

## ⚙️ Requirements

- Python 3.7+
- Node.js 16+
- npm 7+

## 📦 Installation

### 1. Set up Python dependencies

Install JupyterLite and the Pyodide kernel plugin:

```bash
pip install jupyterlite
pip install jupyterlite-pyodide-kernel
```

> These packages provide the CLI and register the Pyodide kernel for bundling.

### 2. Set up Node dependencies

Install JavaScript dependencies (for building extensions):

```bash
npm install
```

This installs dependencies listed in `package.json`, such as custom JupyterLite extensions.

## 🔨 Build

Run the build to generate a standalone JupyterLite distribution:

```bash
npm run build
```

This will:
- Run `jupyter lite build`
- Include the Pyodide kernel
- Bundle your extensions (e.g., `jl-galaxy`)
- Generate the final site in `./static/dist/_output`

## 🚀 Launch

You can serve the output using any static file server. For quick testing:

```bash
npx serve static/dist/_output
```

Or use Python:

```bash
cd static/dist/_output
python -m http.server
```

Then open [http://localhost:8000](http://localhost:8000) in your browser.

---

## 💡 Notes

- The build process automatically configures the Pyodide kernel and registers it as a federated extension.
- If you're developing additional extensions, make sure to register them in `jupyter-lite.json` under `federated_extensions`.
