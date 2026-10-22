import {OPTIONS, report, type Command} from "../command";

export const search: Command = {
    name: "search",
    summary: "Search the docs like the site's search does, and show where each match is:\nfile, line and section, to edit it; --json for programs",
    usage: "clay search <words> [options]",
    options: {
        json: OPTIONS.json,
        lang: OPTIONS.lang,
        "docs-version": OPTIONS.docsVersion,
        limit: {type: "string", value: "<n>", help: "Show at most n sections (default: 10)"},
    },
    async run({args, options, root}) {
        const {runSearch} = await import("../../commands");
        report(runSearch(root, args.join(" "), {
            lang: options.lang as string | undefined, docsVersion: options["docs-version"] as string | undefined,
            limit: options.limit === undefined ? undefined : Number(options.limit),
        }), options.json);
    },
};
