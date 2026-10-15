const RESET_AFTER_MS = 2000;

export type CopyLabels = { copyCode: string, copied: string, copyFailed: string };
const ENGLISH: CopyLabels = {copyCode: "Copy code", copied: "Copied", copyFailed: "Copy failed"};

// Copies the code next to a copy button and shows the result on the button.
export async function copyCodeBlock(button: HTMLElement, clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard,
                                    labels: CopyLabels = ENGLISH): Promise<boolean> {
    const code = button.closest(".code-block")?.querySelector("pre")?.textContent ?? "";
    // The button's own label: "Copy code", or "Copy prompt" for prompts
    const label = button.dataset.label ??= button.getAttribute("aria-label") ?? labels.copyCode;

    let copied = true;
    try {
        await clipboard.writeText(code);
    } catch {
        // No clipboard access (insecure context, permission denied)
        copied = false;
    }

    // The button's own icon, drawn on the server (server/utils/code-block.ts)
    const icon = button.querySelector("i");
    if (icon) {
        icon.dataset.icon ??= icon.className;
        icon.className = copied ? "fa-solid fa-check" : "fa-solid fa-xmark";
    }
    button.setAttribute("aria-label", copied ? labels.copied : labels.copyFailed);

    setTimeout(() => {
        if (icon) icon.className = icon.dataset.icon!;
        button.setAttribute("aria-label", label);
    }, RESET_AFTER_MS);

    return copied;
}
