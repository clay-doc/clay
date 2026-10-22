import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

// A command of the Clay CLI ("clay <name>"). main.ts reads its options, shows
// its help and runs it; each lives in commands/ and loads what it needs when
// it runs, so "clay --help" stays fast.

export type Option = {
    type: "string" | "boolean";
    short?: string;
    value?: string; // shown in the help, e.g. "<dir>"
    help: string;
};

export type Values = Record<string, string | boolean | undefined>;

export type Context = {
    args: string[]; // the words after the command's name
    options: Values;
    root: string;
    version: string; // Clay's
};

export type Command = {
    name: string;
    summary: string; // its line in "clay --help"; more lines start with a line break
    usage: string; // e.g. "clay build [options]"
    options: Record<string, Option>;
    help?: () => Promise<string>; // in place of the help made from usage and options, e.g. edit's
    run(context: Context): Promise<void> | void;
};

export const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Options used by more than one command
export const OPTIONS = {
    out: {type: "string", value: "<dir>", help: "Output directory (default: <root>/publish)"},
    host: {type: "boolean", help: "Listen on all interfaces, not just localhost"},
    verbose: {type: "boolean", help: "Show the full Nuxt output instead of the progress"},
    json: {type: "boolean", help: "Print the result as JSON"},
    lang: {type: "string", value: "<code>", help: "Work in a language other than the default"},
    docsVersion: {type: "string", value: "<name>", help: "Work in an older version in docs/<name>/"},
} satisfies Record<string, Option>;

// Prints a command's result, as JSON with --json, and exits with its code
export function report({code, text, data}: { code: number, text: string, data: unknown }, json: unknown): never {
    if (json) console.log(JSON.stringify(data, null, 2));
    else if (text) (code === 0 ? console.log : console.error)(text);
    process.exit(code);
}
