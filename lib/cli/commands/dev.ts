import {OPTIONS, type Command} from "../command";

export const dev: Command = {
    name: "dev",
    summary: "Start a development server with live reload",
    usage: "clay dev [options]",
    options: {
        port: {type: "string", value: "<port>", help: "Port to listen on (default: 3000)"},
        host: OPTIONS.host,
        verbose: OPTIONS.verbose,
    },
    async run(context) {
        const {createDevParser, createProgress} = await import("../../progress");
        const {generate, nuxt} = await import("../nuxt");
        const {options} = context;
        const args = ["dev", "--port", String(options.port ?? "3000"), ...(options.host ? ["--host"] : [])];
        if (options.verbose) {
            await generate(context);
            nuxt(context, args);
            return;
        }
        const progress = createProgress(`Clay ${context.version} · dev`, {mode: "serve", hint: 'Run "clay dev --verbose" for the full output.'});
        await generate(context, progress);
        const parse = createDevParser();
        nuxt(context, args, {onLine: line => parse(line).forEach(progress.apply), onClose: progress.finish});
    },
};
