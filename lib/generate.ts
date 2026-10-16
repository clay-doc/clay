import {spawn} from "node:child_process";
import {createInterface} from "node:readline";
import {loadConfig} from "./site";
import type {ProgressEvent} from "./progress";

// "generate" in clay.yaml: commands that write docs before Clay reads them, like
// API reference from code (TypeDoc, Sphinx, godoc). They run in the project
// folder before "clay build", "clay dev" and "clay check", one after another.

const SHOWN_LINES = 20;

function run(command: string, root: string, verbose: boolean): Promise<{ code: number, output: string[] }> {
    return new Promise(done => {
        const child = spawn(command, {cwd: root, shell: true, stdio: verbose ? "inherit" : ["ignore", "pipe", "pipe"]});
        const output: string[] = [];
        if (!verbose) for (const stream of [child.stdout!, child.stderr!]) createInterface({input: stream}).on("line", line => output.push(line));
        child.on("error", error => output.push(error.message));
        child.on("close", code => done({code: code ?? 1, output}));
    });
}

// Runs the commands; apply shows them as steps of the progress (without it, they
// are printed). Returns false when one fails, after showing its last lines.
export async function runGenerate(root: string, {apply, verbose = false}: { apply?: (event: ProgressEvent) => void, verbose?: boolean } = {}): Promise<boolean> {
    const commands = loadConfig(root).config.generate ?? [];
    for (const command of commands) {
        if (apply) apply({type: "step", label: `Generating docs: ${command}`});
        else console.log(`> ${command}`);
        const {code, output} = await run(command, root, verbose);
        if (code !== 0) {
            const lines = [...output.slice(-SHOWN_LINES), `Failed with exit code ${code}`];
            if (apply) lines.forEach(text => apply({type: "error", text}));
            else console.error(lines.join("\n"));
            return false;
        }
        apply?.({type: "done", label: `Generated docs: ${command}`});
    }
    return true;
}
