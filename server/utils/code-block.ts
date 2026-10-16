import type {ShikiTransformer} from "shiki";
import type {Element} from "hast";

export const COPY_ICON = "fa-solid fa-copy";

// The file name of a code block, in brackets after the language: ```yaml [clay.yaml].
// Returns the language and the rest of the info string without it.
export function codeTitle(info: string): { title?: string, lang: string, meta: string } {
    const title = /\[([^\]]+)\]/.exec(info);
    const rest = (title ? info.replace(title[0], " ") : info).trim().split(/\s+/).filter(Boolean);
    return {title: title?.[1]!.trim() || undefined, lang: rest[0] ?? "", meta: rest.slice(1).join(" ")};
}

// Wraps the highlighted <pre> in a div with a copy button, and the file name
// above it if the block has one. The button sits outside the <pre> so it
// stays in place when long lines scroll sideways.
export function transformerCopyButton(label = "Copy code", title?: string): ShikiTransformer {
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
            }] : [];
            root.children = [{
                type: "element",
                tagName: "div",
                properties: {class: title ? "code-block has-title" : "code-block"},
                children: [...header, ...root.children as Element[], button]
            }];
        }
    };
}
