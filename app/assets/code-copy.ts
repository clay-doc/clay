import type {ShikiTransformer} from "shiki";
import type {Element} from "hast";

const COPY_ICON = "fa-solid fa-copy";
const RESET_AFTER_MS = 2000;

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

// Copies the code next to a copy button and shows the result on the button.
export async function copyCodeBlock(button: HTMLElement, clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard): Promise<boolean> {
    const code = button.closest(".code-block")?.querySelector("pre")?.textContent ?? "";

    let copied = true;
    try {
        await clipboard.writeText(code);
    } catch {
        // No clipboard access (insecure context, permission denied)
        copied = false;
    }

    const icon = button.querySelector("i");
    if (icon) icon.className = copied ? "fa-solid fa-check" : "fa-solid fa-xmark";
    button.setAttribute("aria-label", copied ? "Copied" : "Copy failed");

    setTimeout(() => {
        if (icon) icon.className = COPY_ICON;
        button.setAttribute("aria-label", "Copy code");
    }, RESET_AFTER_MS);

    return copied;
}
