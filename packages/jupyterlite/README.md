# JupyterLite + Galaxy Integration

This project integrates JupyterLite with the Pyodide kernel and custom extensions such as `jl-galaxy`.

The `jl-galaxy` extension enables Jupyter users to interact seamlessly with their Galaxy history — including loading and saving notebooks — through a fully integrated browser-based interface.

## ⚙️ Requirements

- Python **3.10.17+**
- Node.js **20.19.1+**
- npm **10.8.2+**

---

## 📦 Setup Instructions

### 1. Create and activate a virtual environment

```bash
python -m venv .venv
source .venv/bin/activate
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

This installs `jupyterlite`, `jupyterlite-pyodide-kernel`, and the `gxy` utility module for Galaxy integration.

### 3. Install Node.js dependencies

```bash
npm install
```

This installs JavaScript dependencies listed in `package.json`, including custom JupyterLite extensions.

---

## 🔨 Build

Run the full build to generate a standalone JupyterLite distribution:

```bash
npm run build
```

This will:
- Run `jupyter lite build`
- Include the Pyodide kernel
- Bundle federated extensions like `jl-galaxy`
- Output the final static site to: `./static/dist/_output`

---

## 🚀 Serve

To serve the JupyterLite site locally:

```bash
npm run serve
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧰 Galaxy Integration Utilities (`gxy`)

The `gxy` module provides Python functions to interact with the Galaxy API directly from JupyterLite.

### ✅ `api(endpoint, method="GET", data=None)`
Makes an HTTP request to a Galaxy API endpoint and returns the parsed JSON response.

```python
await api("/api/histories")
await api("/api/histories", method="POST", data={"name": "New History"})
```

---

### ✅ `get(datasets_identifiers, identifier_type="hid", retrieve_datatype=False)`
Downloads dataset(s) by HID, ID, or regex pattern. Saves them to Pyodide's virtual filesystem.

```python
await get(3)                          # by HID
await get("some_id", identifier_type="id")
await get("myfile.*", identifier_type="regex")
```

---

### ✅ `put(name, ext="auto", history_id=None)`
Uploads a file from the virtual filesystem to the current Galaxy history.

```python
await put("mydata.txt", ext="txt")
```

---

### ✅ `get_history(history_id=None)`
Returns metadata for all visible datasets in the current history.

```python
await get_history()
```

---

### ✅ `get_history_id()`
Returns the current history ID based on the dataset context.

```python
await get_history_id()
```

---

### ✅ `get_environment()`
Returns the Galaxy environment injected into the session via `__gxy__`.

```python
get_environment()
```

---

### ✅ `_find_matching_ids(history_datasets, list_of_regex_patterns, identifier_type='hid')`
Used internally to resolve regex patterns to dataset identifiers.

---

## 📎 Notes

- The `jl-galaxy` extension allows users to browse and manage Galaxy histories directly from the Jupyter UI.
- All files must be placed within `static/dist/_output`; writing outside this directory breaks the build.
- The upload helper uses `XMLHttpRequest` to work around Pyodide's limitations with `fetch`.

