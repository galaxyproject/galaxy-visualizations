// Wait for an asynchronous outcome instead of reading it once: a slower machine reaches the
// same state later, not differently.

/**
 * Poll `probe` until it returns something truthy, and return that. Past `timeout` ms, throw an
 * error naming `what` was awaited and the last value or error the probe gave.
 */
async function eventually(probe, { what = "the condition", timeout = 30000, every = 250 } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    for (;;) {
        try {
            last = await probe();
            if (last) return last;
        } catch (error) {
            last = error;
        }
        if (Date.now() >= deadline) {
            const seen = last instanceof Error ? last.message : JSON.stringify(last);
            throw new Error(`timed out after ${timeout} ms waiting for ${what}; last saw ${seen}`);
        }
        await new Promise((resolve) => setTimeout(resolve, every));
    }
}

module.exports = { eventually };
