import {describe, expect, it} from "vitest";
import {createBuildParser, createDevParser, createProgress} from "../../lib/progress";

// Abridged output of "nuxt generate" when piped
const LOG = [
    "┌  Building Nuxt for production...",
    "●  Nuxt 4.2.2 (with Nitro 2.13.0, Vite 7.3.1 and Vue 3.5.26)",
    "[clay]  WARN  Broken link in a.md: \"missing.md\" points to a missing page (/missing)",
    "[clay] ℹ 10 pages in playground/docs",
    " WARN  Browserslist: browsers data (caniuse-lite) is 10 months old. Please run:",
    "ℹ Building client...",
    "ℹ \x1b[32m✓\x1b[39m 194 modules transformed.",
    "✔ Client built in 1040ms",
    "ℹ Building server...",
    "ℹ ✓ 121 modules transformed.",
    "✔ Server built in 397ms",
    "[nitro] ℹ Initializing prerenderer",
    "[nitro]   ├─ /robots.txt (48ms)",
    "[nitro]   ├─ / (103ms)",
    "[nitro]   ├─ /_payload.json?aad4c5fd (3ms) (skipped)",
    "[nitro] ℹ Prerendered 27 routes in 1.375 seconds",
    "[nitro] ✔ Generated public playground/publish/public",
];

const parseAll = (lines: string[]) => {
    const parse = createBuildParser();
    return lines.flatMap(line => parse(line));
};

describe("build parser", () => {
    it("turns Nuxt output into steps and skips noise", () => {
        expect(parseAll(LOG)).toEqual([
            {type: "step", label: "Loading docs"},
            {type: "warn", text: "Broken link in a.md: \"missing.md\" points to a missing page (/missing)"},
            {type: "done", label: "Loaded 10 pages from playground/docs"},
            {type: "step", label: "Building client"},
            {type: "detail", text: "194 modules"},
            {type: "done", label: "Built client"},
            {type: "step", label: "Building server"},
            {type: "detail", text: "121 modules"},
            {type: "done", label: "Built server"},
            {type: "step", label: "Prerendering pages"},
            {type: "detail", text: "1 route"},
            {type: "detail", text: "2 routes"},
            {type: "done", label: "Prerendered pages", detail: "27 routes"},
            {type: "output", dir: "playground/publish/public"},
        ]);
    });

    it("collects prerender errors and deduplicates error messages", () => {
        const events = parseAll([
            "[nitro]   ├─ /nope (3ms)",
            "  │ ├── [404] Page Not Found",
            "[nitro] ",
            "Errors prerendering:",
            "[nitro]   ├─ /nope (3ms)",
            "  │ ├── [404] Page Not Found",
            "[nitro] ",
            " ERROR  Exiting due to prerender errors.",
            "    at prerender (node_modules/nitropack/dist/core/index.mjs:2187:11)",
            " ERROR  Exiting due to prerender errors.",
        ]);
        expect(events.filter((event: {type: string}) => event.type === "error")).toEqual([
            {type: "error", text: "404 Page Not Found on 1 page: /nope"},
            {type: "error", text: "Exiting due to prerender errors."},
        ]);
    });

    it("shows why pages failed, as logged by Clay, and sums up the failed pages", () => {
        const failed = ["/a", "/b", "/c", "/d", "/e"].flatMap(page => [`[nitro]   ├─ ${page} (8ms)`, "  │ ├── [500] Server Error", "  │ └── Linked from /"]);
        const events = parseAll([
            " ERROR  [clay] Rendering /a failed: boom",
            " ERROR  [clay] Rendering /b failed: boom",
            " ERROR  [clay] Rendering /c failed: other",
            "Errors prerendering:",
            ...failed,
            "[nitro] ",
            " ERROR  Exiting due to prerender errors.",
        ]);
        expect(events.filter((event: {type: string}) => event.type === "error")).toEqual([
            {type: "error", text: "boom (rendering /a)"},
            {type: "error", text: "other (rendering /c)"},
            {type: "error", text: "500 Server Error on 5 pages: /a, /b, /c and 2 more"},
            {type: "error", text: "Exiting due to prerender errors."},
        ]);
    });
});

describe("progress without a terminal", () => {
    const render = (lines: string[], code: number) => {
        let output = "";
        const stream = {isTTY: false, write: (text: string) => (output += text)};
        const progress = createProgress("Clay 2.0.0", {stream, now: () => 0});
        const parse = createBuildParser();
        for (const line of lines) parse(line).forEach(progress.apply);
        progress.finish(code);
        return output;
    };

    it("prints each finished step with its warnings", () => {
        expect(render(LOG, 0)).toBe([
            "┌  Clay 2.0.0",
            "│",
            "●  Loaded 10 pages from playground/docs  0ms",
            "│  ▲ Broken link in a.md: \"missing.md\" points to a missing page (/missing)",
            "│",
            "●  Built client  194 modules · 0ms",
            "│",
            "●  Built server  121 modules · 0ms",
            "│",
            "●  Prerendered pages  27 routes · 0ms",
            "│",
            "└  Built playground/publish/public in 0ms",
            "",
        ].join("\n"));
    });

    it("prints notes under their step", () => {
        const lines = [LOG[0]!, "[clay] ℹ Note: submit the sitemap", ...LOG.slice(3)];
        expect(render(lines, 0)).toContain([
            "●  Loaded 10 pages from playground/docs  0ms",
            "│  ℹ submit the sitemap",
            "│",
            "●  Built client  194 modules · 0ms",
        ].join("\n"));
    });

    it("marks the running step as failed and shows the errors", () => {
        const output = render([...LOG.slice(0, 12), " ERROR  Exiting due to prerender errors."], 1);
        expect(output).toContain("✖  Prerendering pages\n│  Exiting due to prerender errors.\n");
        expect(output).toContain("Build failed after 0ms");
        expect(output).not.toContain("\x1b");
    });
});

describe("build parser with an error on its own line", () => {
    it("takes the message from the next line", () => {
        expect(parseAll([" ERROR ", "Could not load the config", ""])).toEqual([{type: "error", text: "Could not load the config"}]);
    });

    it("explains that clay dev is still running", () => {
        const events = parseAll([" ERROR ", "Another Nuxt dev server is already running:", "", "  URL:     http://[::1]:3000", "  PID:     86350"]);
        expect(events).toEqual([{type: "error", text: '"clay dev" is running for this project (process 86350); stop it, then build again'}]);
    });
});

describe("build parser with failing pages", () => {
    it("reports the cause of failed pages once, without the stack", () => {
        const parse = createBuildParser();
        const events = [
            " ERROR  [request error] [unhandled] [GET] http://localhost/de",
            " [nuxt] instance unavailable",
            "",
            "    at useNuxtApp (server.mjs:246:13)",
            " ERROR  [request error] [unhandled] [GET] http://localhost/",
            " [nuxt] instance unavailable",
            " ERROR  Exiting due to prerender errors.",
        ].flatMap(line => parse(line));
        expect(events).toEqual([
            {type: "error", text: "[nuxt] instance unavailable (rendering /de)"},
            {type: "error", text: "Exiting due to prerender errors."},
        ]);
    });
});

describe("build parser in CI", () => {
    it("understands the level prefixes of Nuxt's logger without a terminal", () => {
        const parse = createBuildParser();
        const events = [
            "[info] Building Nuxt for production...",
            "[warn] [clay] Broken link in a.md: \"missing.md\" points to a missing page (/missing)",
            "[warn] Browserslist: browsers data (caniuse-lite) is 10 months old.",
            "[info] [clay] 10 pages in docs; languages de (1/7 translated)",
            "[error] [request error] [unhandled] [GET] http://localhost/de",
            "[error] [nuxt] instance unavailable",
            "[error] clay build --strict: 1 problem(s) found, see the warnings above",
        ].flatMap(line => parse(line));
        expect(events).toEqual([
            {type: "step", label: "Loading docs"},
            {type: "warn", text: "Broken link in a.md: \"missing.md\" points to a missing page (/missing)"},
            {type: "done", label: "Loaded 10 pages from docs", detail: "languages de (1/7 translated)"},
            {type: "error", text: "[nuxt] instance unavailable (rendering /de)"},
            {type: "error", text: "clay build --strict: 1 problem(s) found, see the warnings above"},
        ]);
    });
});

// Abridged output of "nuxt dev" when piped
const DEV_LOG = [
    "│",
    "●  Nuxt 4.2.2 (with Nitro 2.13.0, Vite 7.3.1 and Vue 3.5.26)",
    "  ➜ Local:    http://localhost:3000/",
    "  ➜ Network:  use --host to expose",
    "[clay]  WARN  Broken link in a.md: \"missing.md\" points to a missing page (/missing)",
    "[clay] ℹ 11 pages in playground/docs; languages de (1/7 translated)",
    "✔ Vite client built in 10ms",
    "✔ Vite server built in 17ms",
    "[nitro] ✔ Nuxt Nitro server built in 336ms",
    "ℹ Vite client warmed up in 2ms",
    "/*! 🌼 daisyUI 5.5.14 */",
    " WARN  Browserslist: browsers data (caniuse-lite) is 10 months old. Please run:",
    "  npx update-browserslist-db@latest",
    "  Why you should do it regularly: https://github.com/browserslist/update-db#readme",
    "[clay] ℹ Reloaded docs/a.md",
    " ERROR  [request error] [unhandled] [GET] http://localhost:3000/broken",
    " ERROR  Cannot read properties of undefined (reading 'title')",
    "    at render (app.vue:3:4)",
    "Something Nuxt says",
];

describe("dev parser", () => {
    it("turns Nuxt output into startup steps, then a log, and skips noise", () => {
        const parse = createDevParser();
        expect(DEV_LOG.flatMap(line => parse(line))).toEqual([
            {type: "step", label: "Loading docs"},
            {type: "url", label: "Local", url: "http://localhost:3000/"},
            {type: "url", label: "Network", url: "use --host to expose"},
            {type: "warn", text: "Broken link in a.md: \"missing.md\" points to a missing page (/missing)"},
            {type: "done", label: "Loaded 11 pages from playground/docs", detail: "languages de (1/7 translated)"},
            {type: "ready", label: "Started dev server"},
            {type: "log", icon: "↻", text: "Reloaded docs/a.md"},
            {type: "error", text: "Cannot read properties of undefined (reading 'title') (rendering /broken)"},
            {type: "log", text: "Something Nuxt says"},
        ]);
    });

    it("reports the server as ready only once", () => {
        const parse = createDevParser();
        expect(parse("[nitro] ✔ Nuxt Nitro server built in 336ms")).toEqual([{type: "ready", label: "Started dev server"}]);
        expect(parse("[nitro] ✔ Nuxt Nitro server built in 120ms")).toEqual([]);
    });
});

describe("progress of a server without a terminal", () => {
    const render = (lines: string[], code: number, signal?: NodeJS.Signals) => {
        let output = "";
        const stream = {isTTY: false, write: (text: string) => (output += text)};
        const progress = createProgress("Clay 3.0.0 · dev", {stream, now: () => 0, mode: "serve", hint: "Run with --verbose."});
        const parse = createDevParser();
        for (const line of lines) parse(line).forEach(progress.apply);
        progress.finish(code, signal);
        return output;
    };
    const time = new Date(0).toTimeString().slice(0, 8);

    it("shows the steps, the address and then each event with its time", () => {
        expect(render(DEV_LOG, 0, "SIGINT")).toBe([
            "┌  Clay 3.0.0 · dev",
            "│",
            "●  Loaded 11 pages from playground/docs  languages de (1/7 translated) · 0ms",
            "│  ▲ Broken link in a.md: \"missing.md\" points to a missing page (/missing)",
            "│",
            "●  Started dev server  0ms",
            "│  ➜ Local:   http://localhost:3000/",
            "│  ➜ Network: use --host to expose",
            "│",
            `│  ↻ Reloaded docs/a.md  ${time}`,
            `│  ✖ Cannot read properties of undefined (reading 'title') (rendering /broken)  ${time}`,
            `│  Something Nuxt says  ${time}`,
            "└  Stopped",
            "",
        ].join("\n"));
    });

    it("shows errors at once and the hint when the server fails", () => {
        const output = render(["●  Nuxt 4.2.2", " ERROR  Port 3000 is in use"], 1);
        expect(output).toContain("│  ✖ Port 3000 is in use\n");
        expect(output).toContain("└  Stopped after 0ms. Run with --verbose.\n");
    });
});
