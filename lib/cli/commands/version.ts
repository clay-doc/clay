import type {Command} from "../command";

export const version: Command = {
    name: "version",
    summary: "Save the latest docs as an older version in docs/<name>/: clay version <name>",
    usage: "clay version [<name>] [options]",
    options: {
        yes: {type: "boolean", help: "Move docs/ into docs/latest/ without asking (the first version)"},
    },
    // Copies docs/latest/ to docs/<name>/. The first version moves docs/ into
    // docs/latest/ (lib/versions.ts), which is explained and confirmed first.
    async run({args, options, root, version: clay}) {
        const {createProgress} = await import("../../progress");
        const name = args[0];
        const progress = createProgress(`Clay ${clay} · version`, {mode: "task"});
        try {
            const versions = await import("../../versions");
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
                        return;
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
                const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
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
            progress.finish(1, null, {failed: (error as Error).message});
            process.exit(1);
        }
    },
};
