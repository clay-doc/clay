import {OPTIONS, type Command} from "../command";

export const preview: Command = {
    name: "preview",
    summary: "Serve the built site like a static host would",
    usage: "clay preview [options]",
    options: {
        out: OPTIONS.out,
        port: {type: "string", value: "<port>", help: "Port to listen on (default: 4173)"},
        host: OPTIONS.host,
    },
    async run(context) {
        const {preview} = await import("../../preview");
        const {outDir} = await import("../nuxt");
        const {options} = context;
        await preview({
            root: context.root, out: outDir(context), port: Number(options.port ?? 4173), host: options.host ? "0.0.0.0" : "127.0.0.1",
            title: `Clay ${context.version} · preview`,
        });
    },
};
