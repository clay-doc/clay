// DOM types: runs in the browser, and on the server with jsdom
/// <reference lib="dom" />
import {Marked} from "marked";
import {plainText} from "../../common/markdown-text";
import {rewriteDocHtml} from "../../common/doc-links";
import linkConcat from "../../common/link-concat";
import {truncate} from "../../common/seo";
import type {TocEntry} from "../../common/toc";
import {parseFrontMatter, stripFrontMatter} from "../../lib/front-matter";
import {messagesFor, type Messages} from "../../common/i18n";
import {renderMarkdown} from "./markdown";
import {sanitizeHtml, serverDocument} from "./sanitize";

export type RenderedDoc = {
    html: string;
    toc: TocEntry[];
    description: string;
};

const lexer = new Marked({gfm: true});

// Plain text of the first top-level paragraph, for the meta description
export function firstParagraph(markdown: string): string {
    for (const token of lexer.lexer(markdown)) {
        if (token.type !== "paragraph") continue;
        const text = plainText(token).replace(/\s+/g, " ").trim();
        if (text) return text;
    }
    return "";
}

// Renders a doc for the app: sanitized HTML with links resolved for the site's
// base URL, its table of contents and a description for search engines.
export async function renderDoc(markdown: string, docPath: string, baseURL: string, fallbackDescription = "", assetPath = docPath,
                                messages: Messages = messagesFor("en")): Promise<RenderedDoc> {
    const body = stripFrontMatter(markdown);
    const routeHref = (route: string) => route.startsWith("#") ? route : linkConcat(baseURL, route);
    const html = rewriteDocHtml(sanitizeHtml(await renderMarkdown(body, messages)), docPath, baseURL, routeHref, serverDocument, assetPath);

    const template = serverDocument.createElement("template");
    template.innerHTML = html;
    // The headings' text, without their "#" links
    for (const link of template.content.querySelectorAll(".heading-anchor")) link.remove();
    const toc = [...template.content.querySelectorAll<HTMLElement>("h2[id], h3[id]")].map(heading => ({
        id: heading.id,
        text: heading.textContent?.trim() ?? "",
        level: heading.tagName === "H3" ? 3 : 2
    }));

    const description = truncate(parseFrontMatter(markdown).description || firstParagraph(body) || fallbackDescription);
    return {html, toc, description};
}
