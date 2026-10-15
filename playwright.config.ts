import {defineConfig, devices} from "@playwright/test";

// The playground is built and served under a base path, like a GitHub Pages
// project site, so links and assets are tested where they most often break.
// Build first: npm run test:e2e
const BASE = "/clay/";
const env = {CLAY_BASE_URL: BASE};

export default defineConfig({
    testDir: "e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["github"], ["list"]] : "list",
    use: {trace: "retain-on-failure"},
    projects: [
        {
            name: "static",
            testMatch: /static\.spec\.ts/,
            use: {...devices["Desktop Chrome"], viewport: {width: 1440, height: 900}, baseURL: `http://127.0.0.1:4173${BASE}`},
        },
        {
            name: "mobile",
            testMatch: /mobile\.spec\.ts/,
            use: {...devices["Pixel 7"], baseURL: `http://127.0.0.1:4173${BASE}`},
        },
        {
            name: "accessibility",
            testMatch: /accessibility\.spec\.ts/,
            use: {...devices["Desktop Chrome"], viewport: {width: 1440, height: 900}, baseURL: `http://127.0.0.1:4173${BASE}`},
        },
        {
            name: "dev",
            testMatch: /dev\.spec\.ts/,
            use: {...devices["Desktop Chrome"], baseURL: `http://localhost:3100${BASE}`},
        },
    ],
    webServer: [
        {
            // The built site, served like a static host
            command: "node bin/clay.mjs preview --root playground --port 4173",
            url: `http://127.0.0.1:4173${BASE}`,
            env,
            reuseExistingServer: !process.env.CI,
        },
        {
            // The development server renders every request on the server
            command: "node bin/clay.mjs dev --root playground --port 3100",
            url: `http://localhost:3100${BASE}`,
            env,
            timeout: 120_000,
            reuseExistingServer: !process.env.CI,
        },
    ],
});
