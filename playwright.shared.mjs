const DEFAULT_PORT = 5173;
const DEFAULT_TIMEOUT = 120_000;

/**
 * Shared Playwright options for the visualization packages. Returns a plain object so
 * this file needs no dependencies of its own; each package wraps it in `defineConfig`.
 *
 * `PLAYWRIGHT_PORT` gives a run its own port so packages can be tested in parallel, and
 * `--strictPort` makes the dev server fail loudly rather than drift to the next free port
 * while Playwright keeps waiting on the original URL.
 *
 * `command` is a function of the resolved port, for packages whose dev server is not vite.
 */
export function visualizationConfig({ port = DEFAULT_PORT, timeout = DEFAULT_TIMEOUT, command, use = {} } = {}) {
    const resolvedPort = Number(process.env.PLAYWRIGHT_PORT || port);
    const devCommand = command ? command(resolvedPort) : `npm run dev -- --port ${resolvedPort} --strictPort`;
    return {
        // Playwright owns *.spec.*; vitest owns *.test.*. Without this Playwright
        // collects unit tests and fails on their imports.
        testMatch: ["**/*.spec.{js,ts}"],
        testIgnore: ["src/**", "**/*.test.{js,ts}"],
        timeout,
        snapshotPathTemplate: "{testDir}/test-data/{arg}.png",
        use: {
            // Specs navigate relatively, so the port only has to be right in one place.
            baseURL: `http://localhost:${resolvedPort}`,
            headless: !!process.env.CI,
            ...use,
            launchOptions: {
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
                ...(use.launchOptions || {}),
            },
        },
        webServer: {
            command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || devCommand,
            url: `http://localhost:${resolvedPort}`,
            reuseExistingServer: !process.env.CI,
            timeout: DEFAULT_TIMEOUT,
        },
    };
}
