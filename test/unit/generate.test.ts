import {existsSync, mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {runGenerate} from "../../lib/generate";
import type {ProgressEvent} from "../../lib/progress";

function project(generate: string[]): string {
    const root = mkdtempSync(join(tmpdir(), "clay-generate-"));
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "clay.yaml"), `title: Docs\ngenerate:\n${generate.map(command => `  - ${JSON.stringify(command)}`).join("\n")}\n`);
    return root;
}

const writeApi = `node -e "require('fs').mkdirSync('docs/api',{recursive:true});require('fs').writeFileSync('docs/api/index.md','# API')"`;

describe("generate", () => {
    it("runs the commands in the project folder, as steps of the progress", async () => {
        const root = project([writeApi]);
        const events: ProgressEvent[] = [];
        expect(await runGenerate(root, {apply: event => events.push(event)})).toBe(true);
        expect(existsSync(join(root, "docs/api/index.md"))).toBe(true);
        expect(events).toEqual([
            {type: "step", label: `Generating docs: ${writeApi}`},
            {type: "done", label: `Generated docs: ${writeApi}`},
        ]);
    });

    it("stops at a command that fails, with its last lines", async () => {
        const root = project([`node -e "console.error('no spec found'); process.exit(3)"`, writeApi]);
        const events: ProgressEvent[] = [];
        expect(await runGenerate(root, {apply: event => events.push(event)})).toBe(false);
        expect(events.filter(event => event.type === "error").map(event => "text" in event && event.text)).toEqual([
            "no spec found",
            "Failed with exit code 3",
        ]);
        expect(existsSync(join(root, "docs/api"))).toBe(false);
    });
});
