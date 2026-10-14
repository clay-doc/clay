import type {ShikiTransformer} from "shiki";
import type {Element} from "hast";
import {COPY_ICON} from "../../common/code-copy";

// Wraps the highlighted <pre> in a div with a copy button. The button sits
// outside the <pre> so it stays in place when long lines scroll sideways.
export function transformerCopyButton(): ShikiTransformer {
    return {
        name: "clay:copy-button",
        root(root) {
            const button: Element = {
                type: "element",
                tagName: "button",
                properties: {
                    type: "button",
                    class: "copy-code btn btn-sm btn-square btn-ghost",
                    title: "Copy code",
                    ariaLabel: "Copy code"
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
