import {describe, expect, it} from "vitest";
// @ts-expect-error plain JavaScript module of the CLI
import {createBuildParser, createProgress} from "../bin/progress.mjs";

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
            {type: "error", text: "├─ /nope (3ms)"},
            {type: "error", text: "│ ├── [404] Page Not Found"},
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

    it("marks the running step as failed and shows the errors", () => {
        const output = render([...LOG.slice(0, 12), " ERROR  Exiting due to prerender errors."], 1);
        expect(output).toContain("✖  Prerendering pages\n│  Exiting due to prerender errors.\n");
        expect(output).toContain("Build failed after 0ms");
        expect(output).not.toContain("\x1b");
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
