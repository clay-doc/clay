// DOM types: runs in the browser
/// <reference lib="dom" />
export const COPY_ICON = "fa-solid fa-copy";
const RESET_AFTER_MS = 2000;

export type CopyLabels = { copyCode: string, copied: string, copyFailed: string };
const ENGLISH: CopyLabels = {copyCode: "Copy code", copied: "Copied", copyFailed: "Copy failed"};

// Copies the code next to a copy button and shows the result on the button.
export async function copyCodeBlock(button: HTMLElement, clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard,
                                    labels: CopyLabels = ENGLISH): Promise<boolean> {
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
    button.setAttribute("aria-label", copied ? labels.copied : labels.copyFailed);

    setTimeout(() => {
        if (icon) icon.className = COPY_ICON;
        button.setAttribute("aria-label", labels.copyCode);
    }, RESET_AFTER_MS);

    return copied;
}
