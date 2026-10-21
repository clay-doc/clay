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

// Embedded players and editors. Any other frame could show a fake login form
// inside the page, so only these hosts (and paths) may be embedded, over https.
const EMBEDS: [host: string, path: string][] = [
    ["www.youtube.com", "/embed/"],
    ["www.youtube-nocookie.com", "/embed/"],
    ["player.vimeo.com", "/video/"],
    ["www.loom.com", "/embed/"],
    ["www.figma.com", "/embed"],
    ["embed.figma.com", "/"],
    ["codepen.io", "/"],
    ["codesandbox.io", "/"],
    ["stackblitz.com", "/"],
    ["www.google.com", "/maps/embed"],
];

export function isAllowedEmbed(src: string | null): boolean {
    let url: URL;
    try {
        url = new URL(src ?? "");
    } catch {
        return false;
    }
    return url.protocol === "https:" && EMBEDS.some(([host, path]) => url.hostname === host && url.pathname.startsWith(path));
}

// What an embed may ask the browser for; camera, microphone and the like are not needed to watch or click
const EMBED_FEATURES = new Set(["accelerometer", "autoplay", "clipboard-write", "encrypted-media", "fullscreen", "gyroscope", "picture-in-picture", "web-share"]);

purify.addHook("uponSanitizeAttribute", (node, data) => {
    if (node.nodeName !== "IFRAME") return;
    // A named frame could be navigated elsewhere by a link with that target
    if (data.attrName === "name") data.keepAttr = false;
    if (data.attrName !== "allow") return;
    data.attrValue = data.attrValue.split(";").map(feature => feature.trim())
        .filter(feature => EMBED_FEATURES.has(feature.split(/\s/)[0]!.toLowerCase())).join("; ");
});

purify.addHook("afterSanitizeAttributes", node => {
    if (node.nodeName !== "IFRAME") return;
    if (!isAllowedEmbed((node as Element).getAttribute("src"))) {
        (node as Element).remove();
        return;
    }
    // Loaded when scrolled to; YouTube refuses to play without knowing the site
    if (!(node as Element).hasAttribute("loading")) (node as Element).setAttribute("loading", "lazy");
    (node as Element).setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
});

// Task lists ("- [x] Done") keep their checkboxes, read-only and with nothing
// else: a box that cannot be changed or sent. Any other input could be part
// of a fake form, so it goes.
purify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "input") return;
    const input = node as Element;
    if (input.getAttribute("type")?.toLowerCase() !== "checkbox" || !input.closest("li")) input.remove();
});

purify.addHook("afterSanitizeAttributes", node => {
    if (node.nodeName !== "INPUT") return;
    const input = node as Element;
    for (const {name} of [...input.attributes]) if (name !== "checked") input.removeAttribute(name);
    input.setAttribute("type", "checkbox");
    input.setAttribute("disabled", "");
    input.setAttribute("class", "clay-task");
});

const MATH_STYLE =/^(?:height|width|min-width|max-width|vertical-align|top|bottom|margin-(?:left|right|top|bottom)|padding-(?:left|right)|border-(?:top|bottom|right)-width|color)$/;

// The declarations of a KaTeX style that cannot move content out of the formula
function mathStyle(style: string): string {
    return style.split(";").filter(declaration => {
        const [property, value] = declaration.split(":").map(part => part.trim().toLowerCase());
        return property && value && MATH_STYLE.test(property) && !/url\(|expression|var\(/.test(value);
    }).join(";");
}

// Docs may come from outside contributors: remove scripts, event handlers,
// javascript: URLs, forms and their fields (phishing; task lists keep their
// checkboxes), styles and frames other than known embeds from rendered markdown.
export function sanitizeHtml(html: string): string {
    const fragment = purify.sanitize(html, {
        FORBID_TAGS: ["form", "textarea", "select", "option", "style"],
        ADD_TAGS: ["iframe"],
        ADD_ATTR: ["allow", "allowfullscreen", "referrerpolicy", "loading"],
        RETURN_DOM_FRAGMENT: true,
    });
    for (const box of fragment.querySelectorAll(".clay-task")) labelTask(box);
    const container = serverDocument.createElement("div");
    container.append(fragment);
    return container.innerHTML;
}

// A task's checkbox and its text go into a label, so the box is named by the
// task; a nested list or paragraph below it stays outside
function labelTask(box: Element) {
    const label = serverDocument.createElement("label");
    box.before(label);
    let node: ChildNode | null = box;
    while (node && !(node.nodeType === 1 && /^(UL|OL|P|DIV|PRE|BLOCKQUOTE|TABLE)$/.test(node.nodeName))) {
        const next: ChildNode | null = node.nextSibling;
        label.append(node);
        node = next;
    }
}
