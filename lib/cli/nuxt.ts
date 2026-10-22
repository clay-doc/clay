import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {createInterface} from "node:readline";
import {runGenerate} from "../generate";
import type {ProgressEvent} from "../progress";
import {PACKAGE_DIR, type Context} from "./command";

const require = createRequire(import.meta.url);

export const outDir = ({root, options}: Context) => resolve(typeof options.out === "string" ? options.out : join(root, "publish"));

// The arguments of the Nuxt CLI for a command, e.g. ["dev", "--host"]: the
// package's directory comes right after Nuxt's command, so an option that takes
// a value, like "--host", can never take the directory for its value
export const nuxtArguments = ([command, ...options]: string[]) => [command!, PACKAGE_DIR, ...options];

// Runs the Nuxt CLI on this package with the docs project as content; with
// onLine, its output is captured line by line instead of shown
export function nuxt(context: Context, args: string[], {onLine, onClose}: {
    onLine?: (line: string) => void,
    onClose?: (code: number, signal: NodeJS.Signals | null) => void,
} = {}) {
    const bin = join(dirname(require.resolve("nuxt/package.json")), "bin", "nuxt.mjs");
    const child = spawn(process.execPath, [bin, ...nuxtArguments(args)], {
        stdio: onLine ? ["inherit", "pipe", "pipe"] : "inherit",
        env: {...process.env, CLAY_ROOT: context.root, CLAY_OUT: outDir(context), ...(context.options.strict ? {CLAY_STRICT: "1"} : {})},
    });
    if (onLine) for (const output of [child.stdout!, child.stderr!]) createInterface({input: output}).on("line", onLine);
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
    // "close" waits for the captured output to be read
    child.on("close", (code, signal) => {
        onClose?.(code ?? 1, signal);
        process.exit(code ?? (signal ? 1 : 0));
    });
}

// Runs the commands of "generate" in clay.yaml (lib/generate.ts), which write docs
// before Clay reads them; exits when one fails
export async function generate(context: Context, progress?: { apply: (event: ProgressEvent) => void, finish: (code: number) => void }) {
    if (await runGenerate(context.root, {apply: progress?.apply, verbose: Boolean(context.options.verbose)})) return;
    progress?.finish(1);
    process.exit(1);
}
