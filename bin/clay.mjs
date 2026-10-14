#!/usr/bin/env node
// Clay command line: build, preview and develop a documentation site from the
// docs project in the current directory (clay.yaml, dir-meta.yaml, docs/).
import {spawn} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {preview} from "./preview.mjs";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {version} = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));

const HELP = `Clay ${version} - documentation sites from Markdown

Usage: clay <command> [options]

Commands:
  dev       Start a development server with live reload
  build     Build the static site into <out>/public
  preview   Serve the built site like a static host would

Options:
  --root <dir>   Docs project with clay.yaml and docs/ (default: current directory)
  --out <dir>    Output directory (default: <root>/publish)
  --port <port>  Port for dev and preview (default: 3000 and 4173)
  --host         Listen on all interfaces, not just localhost
  --strict       build: fail on warnings such as broken links or config typos
  -h, --help     Show this help
  -v, --version  Show the version

Environment overrides for clay.yaml: CLAY_TITLE, CLAY_BASE_URL, CLAY_SITE_URL, CLAY_FONTAWESOME_KIT`;

let parsed;
try {
    parsed = parseArgs({
        allowPositionals: true,
        options: {
            root: {type: "string"},
            out: {type: "string"},
            port: {type: "string"},
            host: {type: "boolean"},
            strict: {type: "boolean"},
            help: {type: "boolean", short: "h"},
            version: {type: "boolean", short: "v"},
        },
    });
} catch (error) {
    console.error(`${error.message}\n\nRun "clay --help" for usage.`);
    process.exit(2);
}

const {values: options, positionals} = parsed;
const command = positionals[0];

if (options.version) {
    console.log(version);
    process.exit(0);
}
if (options.help || !command) {
    console.log(HELP);
    process.exit(options.help ? 0 : 2);
}

const root = resolve(options.root ?? process.cwd());
const out = resolve(options.out ?? join(root, "publish"));

if (!existsSync(join(root, "clay.yaml"))) {
    console.error(`No clay.yaml found in ${root}. Run clay in your docs project or pass --root.`);
    process.exit(1);
}

// Runs the Nuxt CLI on this package with the docs project as content
function nuxt(args) {
    const bin = join(dirname(require.resolve("nuxt/package.json")), "bin", "nuxt.mjs");
    const child = spawn(process.execPath, [bin, ...args, packageDir], {
        stdio: "inherit",
        env: {...process.env, CLAY_ROOT: root, CLAY_OUT: out, ...(options.strict ? {CLAY_STRICT: "1"} : {})},
    });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
    child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

switch (command) {
    case "dev":
        nuxt(["dev", "--port", options.port ?? "3000", ...(options.host ? ["--host"] : [])]);
        break;
    case "build":
        nuxt(["generate"]);
        break;
    case "preview":
        await preview({root, out, port: Number(options.port ?? 4173), host: options.host ? "0.0.0.0" : "127.0.0.1"});
        break;
    default:
        console.error(`Unknown command "${command}".\n\n${HELP}`);
        process.exit(2);
}
