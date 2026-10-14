import DOMPurify from "dompurify";

// DOMPurify needs a DOM. During server-side rendering it loads without one and
// has no hooks API, so the hook is registered on first use in the browser.
let hookAdded = false;

function addHook() {
    DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
        // DOMPurify drops ids that match document or form properties (e.g. "title",
        // "images") to prevent DOM clobbering. Heading ids are the #anchors of the
        // page and search results, and element ids cannot override existing window
        // or document properties, so keep them.
        if (data.attrName === "id" && /^H[1-6]$/.test(node.nodeName)) data.forceKeepAttr = true;

        // Inline styles could lay content over the page; only highlighted code needs them
        if (data.attrName === "style" && !(node as Element).closest?.("pre.shiki")) data.keepAttr = false;
    });
    hookAdded = true;
}

// Docs may come from outside contributors: remove scripts, event handlers,
// javascript: URLs, forms (phishing) and styles from rendered markdown.
// Without a DOM nothing can be sanitized, so nothing is returned.
export function sanitizeHtml(html: string): string {
    if (!DOMPurify.isSupported) return "";
    if (!hookAdded) addHook();

    return DOMPurify.sanitize(html, {
        FORBID_TAGS: ["form", "input", "textarea", "select", "option", "style"],
    });
}
