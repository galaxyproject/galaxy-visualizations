// Olit starts on Galaxy AI; the footer's model button is the way to the picker. It is wired
// once the app has booted, so a click can land before it does and is repeated until it opens.
module.exports = async (target, ms = 30000) => {
    const end = Date.now() + ms;
    await target.locator("#model-btn").waitFor({ timeout: ms });
    while (Date.now() < end) {
        await target.locator("#model-btn").click();
        try {
            await target.locator("#cred-overlay:not(.hidden)").waitFor({ timeout: 2000 });
            return;
        } catch {}
    }
    throw new Error("the model button never opened the picker");
};
