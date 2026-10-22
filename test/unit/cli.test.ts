import {describe, expect, it} from "vitest";
import {spawnSync} from "node:child_process";
import {COMMANDS, commandHelp, mainHelp} from "../../lib/cli/main";

const clay = (...args: string[]) => spawnSync(process.execPath, ["bin/clay.mjs", ...args], {encoding: "utf8", env: {...process.env, NO_COLOR: "1"}});

describe("the clay command line", () => {
    it("lists every command in its help, and each command's options in the command's help", () => {
        const help = mainHelp("0.0.0");
        for (const command of COMMANDS) expect(help).toContain(`  ${command.name} `);
        expect(commandHelp(COMMANDS.find(command => command.name === "build")!)).toMatch(/--strict\s+Fail on warnings/);
    });

    it("gives an option the same type in every command that has it", () => {
        const types = new Map<string, string>();
        for (const command of COMMANDS) {
            for (const [name, option] of Object.entries(command.options)) {
                expect(types.get(name) ?? option.type, `--${name} of clay ${command.name}`).toBe(option.type);
                types.set(name, option.type);
            }
        }
    });

    it("rejects options the command does not have, and unknown commands", () => {
        const wrong = clay("build", "--json", "--root", "playground");
        expect(wrong.status).toBe(2);
        expect(wrong.stderr).toContain("clay build has no option --json");
        expect(clay("frobnicate").status).toBe(2);
    });

    it("reads options before the command and runs it", () => {
        const found = clay("--root", "playground", "search", "page", "order", "--limit", "1", "--json");
        expect(found.status).toBe(0);
        expect(JSON.parse(found.stdout)).toMatchObject({ok: true, results: [{heading: "Page Order"}]});
        expect(clay("search", "--help").stdout).toContain("Usage: clay search <words> [options]");
    });

});
