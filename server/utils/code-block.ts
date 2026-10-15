import type {ShikiTransformer} from "shiki";
import type {Element} from "hast";

export const COPY_ICON = "fa-solid fa-copy";

// Wraps the highlighted <pre> in a div with a copy button. The button sits
// outside the <pre> so it stays in place when long lines scroll sideways.
export function transformerCopyButton(label = "Copy code"): ShikiTransformer {
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
            root.children = [{
                type: "element",
                tagName: "div",
                properties: {class: "code-block"},
                children: [...root.children as Element[], button]
            }];
        }
    };
}
