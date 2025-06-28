// main.js
import { WebR } from "webr";

const webR = new WebR();

async function init() {
  await webR.init();

  // Run some R code
  const result = await webR.evalR('paste("Hello from R,", R.version.string)');
  const output = await result.toArray();

  // Display in DOM
  const div = document.createElement("div");
  div.textContent = output.join(" ");
  document.body.appendChild(div);
}

init();
