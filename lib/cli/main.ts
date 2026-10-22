import {existsSync, readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {parseArgs} from "node:util";
import {GRAY, rgb, SAGE} from "../colors";
import {printFailure} from "../progress";
import {PACKAGE_DIR, type Command, type Option, type Values} from "./command";
import {build} from "./commands/build";
import {check} from "./commands/check";
import {dev} from "./commands/dev";
import {edit} from "./commands/edit";
import {preview} from "./commands/preview";
import {search} from "./commands/search";
import {version} from "./commands/version";

// Clay's command line: "clay <command> [options]". A new command is a file in
// commands/ and an entry here; main reads its options, shows its help and runs it.

export const COMMANDS: Command[] = [dev, build, preview, edit, check, search, version];

// Options of every command
const GLOBAL: Record<string, Option> = {
    root: {type: "string", value: "<dir>", help: "Docs project with clay.yaml and docs/ (default: current directory)"},
    help: {type: "boolean", short: "h", help: "Show this help"},
};

const VERSION: Record<string, Option> = {version: {type: "boolean", short: "v", help: "Show the version"}};

const ENVIRONMENT = "Environment overrides for clay.yaml: CLAY_TITLE, CLAY_BASE_URL, CLAY_SITE_URL, CLAY_FONTAWESOME_KIT";

// "  --root <dir>   Docs project ...", the descriptions lined up
function table(rows: [string, string][]): string[] {
    const width = Math.max(...rows.map(([name]) => name.length)) + 3;
    return rows.flatMap(([name, text]) => text.split("\n").map((line, i) => `  ${(i ? "" : name).padEnd(width)}${line}`));
}

const optionRows = (options: Record<string, Option>): [string, string][] => Object.entries(options)
    .map(([name, option]) => [`${option.short ? `-${option.short}, ` : ""}--${name}${option.value ? ` ${option.value}` : ""}`, option.help]);

export function mainHelp(clay: string): string {
    return [
        `Clay ${clay} - documentation sites from Markdown`, "",
        "Usage: clay <command> [options]", "",
        "Commands:", ...table(COMMANDS.map(command => [command.name, command.summary])), "",
        "Options:", ...table(optionRows({...GLOBAL, ...VERSION})), "",
        'Run "clay <command> --help" for the options of a command.', "",
        ENVIRONMENT,
    ].join("\n");
}

export function commandHelp(command: Command): string {
    return [
        `clay ${command.name} - ${command.summary.replace(/\n/g, " ")}`, "",
        `Usage: ${command.usage}`, "",
        "Options:", ...table(optionRows({...command.options, ...GLOBAL})),
    ].join("\n");
}

// The help in the colors of the progress (lib/progress.ts): headings in bold,
// commands and options in sage, hints in gray; plain without a terminal
function colorHelp(text: string): string {
    if (!process.stdout.isTTY || "NO_COLOR" in process.env) return text;
    const paint = (code: string, value: string) => `\x1b[${code}m${value}\x1b[0m`;
    return text.split("\n").map((line, i) => {
        if (i === 0) return line.replace(/^((?:Clay|clay) \S+)/, value => paint("1", value));
        if (/^Run "/.test(line)) return paint(rgb(...GRAY), line);
        if (/^[A-Z][\w ]*:/.test(line)) return line.replace(/^([^:]+:)/, value => paint("1", value));
        return line.replace(/^( {2})((?:-\w, )?--?[\w-]+(?: <\w+>)?|\w+)(?= )/, (_, indent, name) => indent + paint(rgb(...SAGE), name));
    }).join("\n");
}

const fail = (message: string, hint: string): never => {
    printFailure(message, hint);
    process.exit(2);
};

export async function main(argv: string[]) {
    const clay = (JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")) as { version: string }).version;

    // Options may come before the command ("clay --root docs build"), so every
    // command's options are read first, and then checked against the command's
    const all: Record<string, Option> = Object.assign({}, GLOBAL, VERSION, ...COMMANDS.map(command => command.options));
    let parsed: { values: Values, positionals: string[] };
    try {
        parsed = parseArgs({args: argv, allowPositionals: true, options: Object.fromEntries(Object.entries(all).map(([name, {type, short}]) => [name, short ? {type, short} : {type}]))});
    } catch (error) {
        return fail((error as Error).message, 'Run "clay --help" for usage.');
    }
    const {values: options, positionals} = parsed;

    if (options.version) {
        console.log(clay);
        return;
    }
    const name = positionals[0];
    if (!name) {
        console.log(colorHelp(mainHelp(clay)));
        process.exit(options.help ? 0 : 2);
    }
    const command = COMMANDS.find(command => command.name === name);
    if (!command) return fail(`Unknown command "${name}"`, 'Run "clay --help" for the commands.');
    if (options.help) {
        console.log(command.help ? await command.help() : colorHelp(commandHelp(command)));
        return;
    }
    for (const option of Object.keys(options)) {
        if (!(option in command.options) && !(option in GLOBAL)) {
            return fail(`clay ${command.name} has no option --${option}`, `Run "clay ${command.name} --help" for its options.`);
        }
    }

    const root = resolve(typeof options.root === "string" ? options.root : process.cwd());
    if (!existsSync(join(root, "clay.yaml"))) {
        printFailure(`No clay.yaml found in ${root}`, "Run clay in your docs project, or pass --root.");
        process.exit(1);
    }
    await command.run({args: positionals.slice(1), options, root, version: clay});
}
