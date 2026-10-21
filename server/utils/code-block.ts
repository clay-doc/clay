import type {ShikiTransformer} from "shiki";
import type {Element, ElementContent} from "hast";

export const COPY_ICON = "fa-solid fa-copy";

// The file name of a code block, in brackets after the language: ```yaml [clay.yaml].
// Returns the language and the rest of the info string without it.
export function codeTitle(info: string): { title?: string, lang: string, meta: string } {
    const title = /\[([^\]]+)\]/.exec(info);
    const rest = (title ? info.replace(title[0], " ") : info).trim().split(/\s+/).filter(Boolean);
    return {title: title?.[1]!.trim() || undefined, lang: rest[0] ?? "", meta: rest.slice(1).join(" ")};
}

// Shell code blocks look like a terminal (transformerCopyButton): commands
// get a "$" (transformerShellPrompts); sessions are written with their own
// prompts and output, so theirs stay as written
const SHELLS = new Set(["sh", "bash", "shell", "zsh", "fish"]);
const SESSIONS = new Set(["console", "shellsession", "shell-session"]);
export const isTerminal = (lang: string) => SHELLS.has(lang) || SESSIONS.has(lang);
export const hasPrompts = (lang: string) => SHELLS.has(lang);

// Which lines of a shell block start a command: not empty lines, comments,
// lines continued from the one before ("\") or the text of a heredoc.
// Blocks that write their own "$ " keep it.
export function commandLines(lines: string[]): boolean[] {
    if (lines.some(line => /^\s*\$ /.test(line))) return lines.map(() => false);
    let continued = false;
    let heredoc: string | undefined;
    return lines.map(line => {
        const text = line.trim();
        if (heredoc !== undefined) {
            if (text === heredoc) heredoc = undefined;
            return false;
        }
        const command = !continued && text !== "" && !text.startsWith("#");
        continued = text.endsWith("\\");
        if (command) heredoc = /<<-?\s*['"]?(\w+)['"]?/.exec(text)?.[1];
        return command;
    });
}

const textOf = (node: Element | ElementContent): string =>
    node.type === "text" ? node.value : "children" in node ? node.children.map(textOf).join("") : "";

// Marks the lines that start a command; code.css puts the "$" before them,
// so it is not copied with the code
export function transformerShellPrompts(): ShikiTransformer {
    return {
        name: "clay:shell-prompts",
        code(code) {
            // The lines, between the line breaks
            const lines = code.children.filter((child): child is Element => child.type === "element");
            commandLines(lines.map(textOf)).forEach((command, i) => command && this.addClassToHast(lines[i]!, "command"));
        }
    };
}

// Wraps the highlighted <pre> in a div with a copy button, and above it the
// file name if the block has one, or for shell code (terminal) a terminal's
// bar, unless the window's buttons are off (bar). The button sits outside
// the <pre> so it stays in place when long lines scroll sideways.
export function transformerCopyButton(label = "Copy code", title?: string, terminal = false, bar = true): ShikiTransformer {
    return {
        name: "clay:copy-button",
        root(root) {
            const button: Element = {
                type: "element",
                tagName: "button",
                properties: {
                    type: "button",
                    class: "copy-code btn btn-sm btn-square btn-ghost",
                    title: label,
                    ariaLabel: label
                },
                children: [{type: "element", tagName: "i", properties: {class: COPY_ICON}, children: []}]
            };
            const header: Element[] = title ? [{
                type: "element",
                tagName: "div",
                properties: {class: "code-title"},
                children: [
                    {type: "element", tagName: "i", properties: {class: "fa-regular fa-file-lines", ariaHidden: "true"}, children: []},
                    {type: "element", tagName: "span", properties: {}, children: [{type: "text", value: title}]}
                ]
            }] : terminal && bar ? [{
                type: "element",
                tagName: "div",
                properties: {class: "code-terminal", ariaHidden: "true"},
                children: [0, 1, 2].map(() => ({type: "element", tagName: "span", properties: {}, children: []}))
            }] : [];
            root.children = [{
                type: "element",
                tagName: "div",
                properties: {class: title ? "code-block has-title" : terminal ? `code-block is-terminal${bar ? " has-bar" : ""}` : "code-block"},
                children: [...header, ...root.children as Element[], button]
            }];
        }
    };
}
