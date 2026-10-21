// DOM types: runs on the server with jsdom
/// <reference lib="dom" />
import {firstParagraph} from "../../common/markdown-text";
import {rewriteDocHtml} from "./doc-links";
import linkConcat from "../../common/link-concat";
import {truncate} from "../../common/seo";
import type {TocEntry} from "../../common/toc";
import {parseFrontMatter, stripFrontMatter} from "../../lib/front-matter";
import {messagesFor, type Messages} from "../../common/i18n";
import {renderMarkdown} from "./markdown";
import {sanitizeHtml, serverDocument} from "./sanitize";
import type {CellResolver} from "./request-cell";

// What a card (markdown-components.ts) shows of the page it links to
export type PageInfo = (route: string) => { icon?: string, description?: string } | undefined;

export type RenderedDoc = {
    html: string;
    toc: TocEntry[];
    description: string;
};

// Renders a doc for the app: sanitized HTML with links resolved for the site's
// base URL, its table of contents and a description for search engines.
export async function renderDoc(markdown: string, docPath: string, baseURL: string, fallbackDescription = "", assetPath = docPath,
                                messages: Messages = messagesFor("en"), pageInfo?: PageInfo, cells?: CellResolver): Promise<RenderedDoc> {
    const body = stripFrontMatter(markdown);
    const routeHref = (route: string) => route.startsWith("#") ? route : linkConcat(baseURL, route);
    const html = rewriteDocHtml(sanitizeHtml(await renderMarkdown(body, messages, cells)), docPath, baseURL, routeHref, serverDocument, assetPath);

    const template = serverDocument.createElement("template");
    template.innerHTML = html;
    let filled = html;
    if (pageInfo) {
        fillCards(template.content, pageInfo);
        filled = template.innerHTML;
    }
    // The headings' text, without their "#" links
    for (const link of template.content.querySelectorAll(".heading-anchor")) link.remove();
    const toc = [...template.content.querySelectorAll<HTMLElement>("h2[id], h3[id]")].map(heading => ({
        id: heading.id,
        text: heading.textContent?.trim() ?? "",
        level: heading.tagName === "H3" ? 3 : 2
    }));

    const description = truncate(parseFrontMatter(markdown).description || firstParagraph(body) || fallbackDescription);
    return {html: filled, toc, description};
}

// Cards without an icon or text of their own show the linked page's
function fillCards(root: DocumentFragment, pageInfo: PageInfo) {
    for (const card of root.querySelectorAll<HTMLElement>("a.clay-card[data-route]")) {
        const page = pageInfo(card.dataset.route!.replace(/[?#].*$/, ""));
        if (!page) continue;
        if (page.icon && !card.querySelector(".clay-card-icon")) {
            const icon = serverDocument.createElement("i");
            icon.className = `clay-card-icon ${page.icon}`;
            icon.setAttribute("aria-hidden", "true");
            card.prepend(icon);
        }
        if (page.description && !card.querySelector(".clay-card-text")) {
            const text = serverDocument.createElement("span");
            text.className = "clay-card-text";
            text.textContent = page.description;
            card.append(text);
        }
    }
}
