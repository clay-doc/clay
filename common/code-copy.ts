// DOM types: runs in the browser
/// <reference lib="dom" />
export const COPY_ICON = "fa-solid fa-copy";
const RESET_AFTER_MS = 2000;

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
