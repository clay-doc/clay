import {OPTIONS, report, type Command} from "../command";

export const edit: Command = {
    name: "edit",
    summary: "Edit pages, folders, their front matter and order, and clay.yaml: interactively,\nor one change per command for scripts and AI agents (\"clay edit help\")",
    usage: "clay edit [<command>] [options]",
    options: {
        json: OPTIONS.json,
        lang: OPTIONS.lang,
        "docs-version": OPTIONS.docsVersion,
        slug: {type: "string", value: "<name>", help: "File or folder name for new and move"},
        yes: {type: "boolean", help: "Confirm delete"},
        redirect: {type: "boolean", help: "move and rename: the old address keeps leading to the page"},
    },
    help: async () => (await import("../../commands")).EDIT_HELP,
    async run({args, options, root}) {
        const commands = await import("../../commands");
        if (args[0] === "help") {
            console.log(commands.EDIT_HELP);
            return;
        }
        // Without a command, the interactive editor; scripts and agents without a
        // terminal get the commands they can use instead
        if (!args[0]) {
            if (!process.stdin.isTTY || !process.stdout.isTTY) {
                console.error(`clay edit needs an interactive terminal; without one, use its commands:\n\n${commands.EDIT_HELP}`);
                process.exit(2);
            }
            try {
                const {edit} = await import("../../editor-screen");
                await edit(root);
            } catch (error) {
                console.error((error as Error).message);
                process.exit(1);
            }
            return;
        }
        report(commands.runEdit(root, args, {
            json: Boolean(options.json), yes: Boolean(options.yes), lang: options.lang as string | undefined,
            docsVersion: options["docs-version"] as string | undefined, slug: options.slug as string | undefined, redirect: Boolean(options.redirect),
        }), options.json);
    },
};
