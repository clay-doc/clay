import {OPTIONS, type Command} from "../command";

export const build: Command = {
    name: "build",
    summary: "Build the static site into <out>/public",
    usage: "clay build [options]",
    options: {
        out: OPTIONS.out,
        strict: {type: "boolean", help: "Fail on warnings such as broken links or config typos"},
        verbose: OPTIONS.verbose,
    },
    async run(context) {
        const {createBuildParser, createProgress} = await import("../../progress");
        const {generate, nuxt} = await import("../nuxt");
        if (context.options.verbose) {
            await generate(context);
            nuxt(context, ["generate"]);
            return;
        }
        const progress = createProgress(`Clay ${context.version}`);
        await generate(context, progress);
        const parse = createBuildParser();
        nuxt(context, ["generate"], {onLine: line => parse(line).forEach(progress.apply), onClose: progress.finish});
    },
};
