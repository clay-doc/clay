import {OPTIONS, report, type Command} from "../command";

export const check: Command = {
    name: "check",
    summary: "Check links, translations and settings without building; --json for programs",
    usage: "clay check [options]",
    options: {json: OPTIONS.json},
    async run({root, options, version}) {
        // Generated docs are checked too; with --json, a failing command is a problem in the result
        const {runGenerate} = await import("../../generate");
        const {runCheck} = await import("../../commands");
        if (options.json) {
            const failed: string[] = [];
            if (!await runGenerate(root, {apply: event => event.type === "error" && failed.push(event.text)})) {
                report({code: 1, text: "", data: {ok: false, problems: failed}}, true);
            }
            report(runCheck(root), true);
        }
        const {createProgress} = await import("../../progress");
        const progress = createProgress(`Clay ${version} · check`, {mode: "task"});
        if (!await runGenerate(root, {apply: progress.apply})) {
            progress.finish(1, null, {failed: 'A command of "generate" failed, so nothing was checked.'});
            process.exit(1);
        }
        progress.apply({type: "step", label: "Checking links, translations and settings"});
        const {code, data} = runCheck(root);
        if (data.error) {
            progress.apply({type: "error", text: String(data.error)});
            progress.finish(1, null, {failed: "The docs could not be read."});
            process.exit(1);
        }
        const problems = data.problems as string[];
        for (const problem of problems) progress.apply({type: "warn", text: problem});
        if (code === 0) progress.apply({type: "done", label: `Checked ${data.pages} pages`});
        const count = problems.length;
        progress.finish(code, null, {done: "No problems", failed: `${count} ${count === 1 ? "problem" : "problems"}; "clay build --strict" fails on them too`});
        process.exit(code);
    },
};
