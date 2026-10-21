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
const {createBuildParser, createDevParser, createProgress, printFailure} = await jiti.import("../lib/progress.ts");
const {rgb, SAGE} = await jiti.import("../lib/colors.ts");

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
  version   Save the latest docs as an older version in docs/<name>/: clay version <name>

Options:
  --root <dir>   Docs project with clay.yaml and docs/ (default: current directory)
  --out <dir>    Output directory (default: <root>/publish)
  --port <port>  Port for dev and preview (default: 3000 and 4173)
  --host         Listen on all interfaces, not just localhost
  --strict       build: fail on warnings such as broken links or config typos
  --verbose      build and dev: show the full Nuxt output instead of the progress
  --json         edit and check: print the result as JSON
  --yes          version: move docs/ into docs/latest/ without asking (the first version)
  -h, --help     Show this help (clay edit --help: the edit commands)
  -v, --version  Show the version

Environment overrides for clay.yaml: CLAY_TITLE, CLAY_BASE_URL, CLAY_SITE_URL, CLAY_FONTAWESOME_KIT`;

// The help in the colors of the progress (lib/progress.ts): headings in bold,
// commands and options in sage; plain without a terminal
function colorHelp(text) {
    if (!process.stdout.isTTY || "NO_COLOR" in process.env) return text;
    const sage = value => `\x1b[${rgb(...SAGE)}m${value}\x1b[0m`;
    return text.split("\n").map((line, i) => {
        if (i === 0) return line.replace(/^(Clay \S+)/, "\x1b[1m$1\x1b[0m");
        if (/^[A-Z][\w ]*:/.test(line)) return line.replace(/^([^:]+:)/, "\x1b[1m$1\x1b[0m");
        return line.replace(/^( {2})((?:-\w, )?--?[\w-]+(?: <\w+>)?|\w+)(?= )/, (_, indent, name) => indent + sage(name));
    }).join("\n");
}

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
            redirect: {type: "boolean"},
            help: {type: "boolean", short: "h"},
            version: {type: "boolean", short: "v"},
        },
    });
} catch (error) {
    printFailure(error.message, 'Run "clay --help" for usage.');
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
    console.log(colorHelp(HELP));
    process.exit(options.help ? 0 : 2);
}

const root = resolve(options.root ?? process.cwd());
const out = resolve(options.out ?? join(root, "publish"));

if (!existsSync(join(root, "clay.yaml"))) {
    printFailure(`No clay.yaml found in ${root}`, "Run clay in your docs project, or pass --root.");
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

// Runs the commands of "generate" in clay.yaml (lib/generate.ts), which write docs
// before Clay reads them; exits when one fails
async function generate(progress) {
    const {runGenerate} = await jiti.import("../lib/generate.ts");
    if (await runGenerate(root, {apply: progress?.apply, verbose: options.verbose})) return;
    progress?.finish(1);
    process.exit(1);
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
            await generate();
            nuxt(args);
        } else {
            const progress = createProgress(`Clay ${version} · dev`, {mode: "serve", hint: 'Run "clay dev --verbose" for the full output.'});
            await generate(progress);
            const parse = createDevParser();
            nuxt(args, {onLine: line => parse(line).forEach(progress.apply), onClose: progress.finish});
        }
        break;
    }
    case "build":
        if (options.verbose) {
            await generate();
            nuxt(["generate"]);
        } else {
            const progress = createProgress(`Clay ${version}`);
            await generate(progress);
            const parse = createBuildParser();
            nuxt(["generate"], {onLine: line => parse(line).forEach(progress.apply), onClose: progress.finish});
        }
        break;
    case "preview":
        const {preview} = await jiti.import("../lib/preview.ts");
        await preview({root, out, port: Number(options.port ?? 4173), host: options.host ? "0.0.0.0" : "127.0.0.1", title: `Clay ${version} · preview`});
        break;
    case "version": {
        // Copies docs/latest/ to docs/<name>/. The first version moves docs/ into
        // docs/latest/ (lib/versions.ts), which is explained and confirmed first.
        const name = positionals[1];
        const progress = createProgress(`Clay ${version} · version`, {mode: "task"});
        try {
            const versions = await jiti.import("../lib/versions.ts");
            const plan = versions.planLayout(root);
            if (!name && !plan?.archived.length) versions.checkVersionName(root, "");
            if (name) versions.checkVersionName(root, name);
            if (plan) {
                for (const line of versions.describePlan(plan, name).split("\n")) progress.apply({type: "text", text: line});
                progress.apply({type: "text", text: ""});
                if (!options.yes) {
                    if (!process.stdin.isTTY) {
                        progress.finish(1, null, {failed: `Nothing was changed. Run "clay version${name ? ` ${name}` : ""} --yes" to go ahead.`});
                        process.exit(1);
                    }
                    const answer = await progress.ask("Go ahead? (y/N)");
                    if (!/^y(es)?$/i.test(String(answer).trim())) {
                        progress.finish(0, null, {done: "Nothing was changed."});
                        break;
                    }
                }
                versions.applyLayout(root, plan);
                const changed = plan.fixed.length + plan.settings.length;
                progress.apply({
                    type: "done", label: `Moved docs/ into docs/latest/${plan.archived.map(v => `, and docs-archive/${v}/ to docs/${v}/`).join("")}`,
                    ...(changed ? {detail: `${changed} ${changed === 1 ? "path" : "paths"} out of docs/ changed`} : {}),
                });
            }
            if (name) {
                progress.apply({type: "step", label: `Saving docs/latest/ as version ${name}`});
                const saved = versions.saveVersion(root, name);
                const {variables, includes, apis, warnings} = saved.frozen;
                const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
                const filled = [variables ? `${count(variables, "variable", "variables")} filled in` : "",
                    includes ? `${count(includes, "include", "includes")} of files outside docs/latest/ written out` : ""].filter(Boolean);
                if (filled.length) progress.apply({type: "note", text: `To keep today's text: ${filled.join(", ")}`});
                if (apis) progress.apply({type: "note", text: `${count(apis, "API", "APIs")} kept as ${apis === 1 ? "it is" : "they are"} today, in ${saved.dir}/_openapi/`});
                for (const warning of warnings) progress.apply({type: "warn", text: warning});
                progress.apply({type: "done", label: `Saved version ${name} in ${saved.dir}/, at /${name}`, detail: `${saved.files} files`});
                progress.finish(0, null, {done: `docs/latest/ stays the latest version. Update it for the next release, and set "version" in clay.yaml to its label.`});
            } else {
                progress.finish(0, null, {done: "Done"});
            }
        } catch (error) {
            progress.finish(1, null, {failed: error.message});
            process.exit(1);
        }
        break;
    }
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
            redirect: options.redirect,
        }));
        break;
    }
    case "check": {
        // Generated docs are checked too; with --json, a failing command is a problem in the result
        const {runGenerate} = await jiti.import("../lib/generate.ts");
        const commands = await jiti.import("../lib/commands.ts");
        if (options.json) {
            const failed = [];
            if (!await runGenerate(root, {apply: event => event.type === "error" && failed.push(event.text)})) {
                report({code: 1, text: "", data: {ok: false, problems: failed}});
            }
            report(commands.runCheck(root));
        }
        const progress = createProgress(`Clay ${version} · check`, {mode: "task"});
        if (!await runGenerate(root, {apply: progress.apply})) {
            progress.finish(1, null, {failed: 'A command of "generate" failed, so nothing was checked.'});
            process.exit(1);
        }
        progress.apply({type: "step", label: "Checking links, translations and settings"});
        const {code, data} = commands.runCheck(root);
        if (data.error) {
            progress.apply({type: "error", text: data.error});
            progress.finish(1, null, {failed: "The docs could not be read."});
            process.exit(1);
        }
        for (const problem of data.problems) progress.apply({type: "warn", text: problem});
        if (code === 0) progress.apply({type: "done", label: `Checked ${data.pages} pages`});
        const count = data.problems.length;
        progress.finish(code, null, {done: "No problems", failed: `${count} ${count === 1 ? "problem" : "problems"}; "clay build --strict" fails on them too`});
        process.exit(code);
    }
    default:
        printFailure(`Unknown command "${command}"`, 'Run "clay --help" for the commands.');
        process.exit(2);
}
