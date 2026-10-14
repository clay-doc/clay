/// <reference lib="dom" />
import createDOMPurify, {type WindowLike} from "dompurify";
import {JSDOM} from "jsdom";

// Docs are rendered on the server (at build time), so DOM work runs on jsdom
const {window} = new JSDOM("");
export const serverDocument = window.document;

const purify = createDOMPurify(window as unknown as WindowLike);

purify.addHook("uponSanitizeAttribute", (node, data) => {
    // DOMPurify drops ids that match document or form properties (e.g. "title",
    // "images") to prevent DOM clobbering. Heading ids are the #anchors of the
    // page and search results, and element ids cannot override existing window
    // or document properties, so keep them.
    if (data.attrName === "id" && /^H[1-6]$/.test(node.nodeName)) data.forceKeepAttr = true;

    // Inline styles could lay content over the page; only highlighted code needs them
    if (data.attrName === "style" && !(node as Element).closest?.("pre.shiki")) data.keepAttr = false;
});

// Docs may come from outside contributors: remove scripts, event handlers,
// javascript: URLs, forms (phishing) and styles from rendered markdown.
export function sanitizeHtml(html: string): string {
    return purify.sanitize(html, {
        FORBID_TAGS: ["form", "input", "textarea", "select", "option", "style"],
    });
}
