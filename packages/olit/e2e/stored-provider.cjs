// Olit starts on Galaxy AI. A drive that needs its stub provider stores it before the page
// loads, as the picker would, instead of depending on the picker being reachable.
module.exports = (page, creds) =>
    page.addInitScript((c) => sessionStorage.setItem("olit.credentials", JSON.stringify(c)), creds);
