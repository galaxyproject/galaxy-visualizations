# JupyterLite End-to-End Testing with Playwright

This project contains automated tests for JupyterLite using [Playwright](https://playwright.dev/). The tests open the JupyterLite interface in a browser, create a new notebook via the menu, run a code cell, and verify the output.

---

## 📦 Setup

1. **Initialize the project**

```bash
npm init -y
```

2. **Install Playwright and the test runner**

```bash
npm install --save-dev playwright @playwright/test
npx playwright install
```

---

## 🧪 Writing Tests

Create a file named `tests/jupyterlite.spec.js` and add your Playwright test logic there.

Example test included in this repo:
- Opens JupyterLite at `http://localhost:8000`
- Goes to `File → New → Notebook`
- Selects the Python kernel
- Runs `print("hello world")` in a new notebook cell
- Verifies the output appears

---

## 🚀 Running Tests

Make sure you have a static JupyterLite build served at `http://localhost:8000`.

If you used `jupyter lite build`, you can serve it like this:

```bash
cd dist  # or wherever index.html is located
python3 -m http.server 8000
```

Then run the test:

```bash
npx playwright test
```

To see the browser during test execution:

```bash
npx playwright test --headed
```

You can also enable slow motion for debugging:

```bash
npx playwright test --headed --slow-mo 100
```

---

## 🛠 Configuration (optional)

If you'd like to run in non-headless mode by default, create `playwright.config.js`:

```js
module.exports = {
  use: {
    headless: false,
    slowMo: 100,
  },
};
```

---

## 📁 Directory Structure

```
jl-e2e-test/
├── tests/
│   └── jupyterlite.spec.js
├── package.json
└── playwright.config.js (optional)
```

---

## ✅ Notes

- Make sure your JupyterLite site is available at `http://localhost:8000`.
- You can adapt this script to test extensions, kernel features, or other UI behaviors.