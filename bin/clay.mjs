#!/usr/bin/env node
// Clay command line: build, preview and develop a documentation site from the
// docs project in the current directory (clay.yaml, docs/).
import {spawn} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createInterface} from "node:readline";
import {parseArgs} from "node:util";
import {createJiti} from "jiti";

// The CLI's code is TypeScript in lib/, run without a build step
const jiti = createJiti(import.meta.url);
const {createBuildParser, createDevParser, createProgress} = await jiti.import("../lib/progress.ts");

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {version} = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));

const HELP = `Clay ${version} - documentation sites from Markdown

Usage: clay <command> [options]

Commands:
  dev       Start a development server with live reload
  build     Build the static site into <out>/public
  preview   Serve the built site like a static host would
  edit      Edit pages, folders, their front matter and order, and clay.yaml: interactively,
            or one change per command for scripts and AI agents ("clay edit help")
  check     Check links, translations and settings without building; --json for programs
  version   Save the current docs as an older version in docs-archive/: clay version <name>

Options:
  --root <dir>   Docs project with clay.yaml and docs/ (default: current directory)
  --out <dir>    Output directory (default: <root>/publish)
  --port <port>  Port for dev and preview (default: 3000 and 4173)
  --host         Listen on all interfaces, not just localhost
  --strict       build: fail on warnings such as broken links or config typos
  --verbose      build and dev: show the full Nuxt output instead of the progress
  --json         edit and check: print the result as JSON
  -h, --help     Show this help (clay edit --help: the edit commands)
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
            verbose: {type: "boolean"},
            json: {type: "boolean"},
            yes: {type: "boolean"},
            lang: {type: "string"},
            "docs-version": {type: "string"},
            slug: {type: "string"},
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
// "clay edit --help" and "clay edit help" explain the edit commands
const editHelp = command === "edit" && (options.help || positionals[1] === "help");
if ((options.help && !editHelp) || !command) {
    console.log(HELP);
    process.exit(options.help ? 0 : 2);
}

const root = resolve(options.root ?? process.cwd());
const out = resolve(options.out ?? join(root, "publish"));

if (!existsSync(join(root, "clay.yaml"))) {
    console.error(`No clay.yaml found in ${root}. Run clay in your docs project or pass --root.`);
    process.exit(1);
}

// Runs the Nuxt CLI on this package with the docs project as content; with
// onLine, its output is captured line by line instead of shown
function nuxt(args, {onLine, onClose} = {}) {
    const bin = join(dirname(require.resolve("nuxt/package.json")), "bin", "nuxt.mjs");
    const child = spawn(process.execPath, [bin, ...args, packageDir], {
        stdio: onLine ? ["inherit", "pipe", "pipe"] : "inherit",
        env: {...process.env, CLAY_ROOT: root, CLAY_OUT: out, ...(options.strict ? {CLAY_STRICT: "1"} : {})},
    });
    if (onLine) for (const output of [child.stdout, child.stderr]) createInterface({input: output}).on("line", onLine);
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
    // "close" waits for the captured output to be read
    child.on("close", (code, signal) => {
        onClose?.(code ?? 1, signal);
        process.exit(code ?? (signal ? 1 : 0));
    });
}

// Prints a command's result, as JSON with --json, and exits with its code
function report({code, text, data}) {
    if (options.json) console.log(JSON.stringify(data, null, 2));
    else if (text) (code === 0 ? console.log : console.error)(text);
    process.exit(code);
}

switch (command) {
    case "dev": {
        const args = ["dev", "--port", options.port ?? "3000", ...(options.host ? ["--host"] : [])];
        if (options.verbose) {
            nuxt(args);
        } else {
            const progress = createProgress(`Clay ${version} · dev`, {mode: "serve", hint: 'Run "clay dev --verbose" for the full output.'});
            const parse = createDevParser();
            nuxt(args, {onLine: line => parse(line).forEach(progress.apply), onClose: progress.finish});
        }
        break;
    }
    case "build":
        if (options.verbose) {
            nuxt(["generate"]);
        } else {
            const progress = createProgress(`Clay ${version}`);
            const parse = createBuildParser();
            nuxt(["generate"], {onLine: line => parse(line).forEach(progress.apply), onClose: progress.finish});
        }
        break;
    case "preview":
        const {preview} = await jiti.import("../lib/preview.ts");
        await preview({root, out, port: Number(options.port ?? 4173), host: options.host ? "0.0.0.0" : "127.0.0.1", title: `Clay ${version} · preview`});
        break;
    case "version":
        // Copies docs/ to docs-archive/<name>; docs/ stays the latest version
        try {
            const editor = await jiti.import("../lib/editor.ts");
            console.log(`Saved the current docs as version ${positionals[1]} in ${editor.createVersion(root, positionals[1] ?? "")}.`);
            console.log(`docs/ stays the latest version; the switcher calls it "Latest" unless clay.yaml sets "version".`);
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }
        break;
    case "edit": {
        const commands = await jiti.import("../lib/commands.ts");
        if (editHelp) {
            console.log(commands.EDIT_HELP);
            break;
        }
        // Without a command, the interactive editor; scripts and agents without a
        // terminal get the commands they can use instead
        if (!positionals[1]) {
            if (!process.stdin.isTTY || !process.stdout.isTTY) {
                console.error(`clay edit needs an interactive terminal; without one, use its commands:\n\n${commands.EDIT_HELP}`);
                process.exit(2);
            }
            try {
                const {edit} = await jiti.import("../lib/editor-screen.ts");
                await edit(root);
            } catch (error) {
                console.error(error.message);
                process.exit(1);
            }
            break;
        }
        report(commands.runEdit(root, positionals.slice(1), {
            json: options.json, yes: options.yes, lang: options.lang, docsVersion: options["docs-version"], slug: options.slug,
        }));
        break;
    }
    case "check": {
        const commands = await jiti.import("../lib/commands.ts");
        report(commands.runCheck(root));
        break;
    }
    default:
        console.error(`Unknown command "${command}".\n\n${HELP}`);
        process.exit(2);
}
