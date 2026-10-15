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

    // Inline styles could lay content over the page; only highlighted code needs
    // them, and math (KaTeX) its sizes and offsets
    if (data.attrName === "style") {
        if ((node as Element).closest?.("pre.shiki")) return;
        if ((node as Element).closest?.(".katex")) data.attrValue = mathStyle(data.attrValue);
        else data.keepAttr = false;
    }
});

const MATH_STYLE = /^(?:height|width|min-width|max-width|vertical-align|top|bottom|margin-(?:left|right|top|bottom)|padding-(?:left|right)|border-(?:top|bottom|right)-width|color)$/;

// The declarations of a KaTeX style that cannot move content out of the formula
function mathStyle(style: string): string {
    return style.split(";").filter(declaration => {
        const [property, value] = declaration.split(":").map(part => part.trim().toLowerCase());
        return property && value && MATH_STYLE.test(property) && !/url\(|expression|var\(/.test(value);
    }).join(";");
}

// Docs may come from outside contributors: remove scripts, event handlers,
// javascript: URLs, forms (phishing) and styles from rendered markdown.
export function sanitizeHtml(html: string): string {
    return purify.sanitize(html, {
        FORBID_TAGS: ["form", "input", "textarea", "select", "option", "style"],
    });
}
