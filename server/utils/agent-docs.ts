import type {DocItem} from "../../common/nav";
import type {Page, Site, SiteEdition} from "../../lib/site";
import {stripFrontMatter} from "../../lib/front-matter";
import {isAssetLink, resolveDocAsset, resolveDocLink} from "./doc-links";
import {docPath, markdownRoute} from "../../common/route-path";
import linkConcat from "../../common/link-concat";
import {firstParagraph} from "../../common/markdown-text";
import {Marked, type Token} from "marked";
import {componentSyntax, type ContainerToken} from "../../common/markdown-components";
import {buildRequest, curlCommand, startingInputs} from "../../common/openapi";
import {messagesFor} from "../../common/i18n";
import {pageCells} from "./request-cell";

// The docs for language models and agents (llmstxt.org): every page as
// Markdown at its own path with ".md", and per version and language an index,
// llms.txt, and all pages in one file, llms-full.txt. Links lead to the
// Markdown of the pages they point to, so agents can follow them.

// Full URLs when the site's address is known (siteURL), else from the root
export type UrlOf = (route: string) => string;

export function urlMaker(origin: string | undefined, baseURL: string): UrlOf {
    return route => `${origin ?? ""}${linkConcat(baseURL, route)}`;
}

const isStart = (page: Page) => page.isDir && page.route === (page.prefix || "/");
export const markdownRouteOf = (page: Page) => markdownRoute(page.route, isStart(page));

// The page a ".md" address belongs to: "/guides/setup.md", "/guides.md" or
// "/guides/index.md" for a folder, "/index.md" and "/de/index.md" for start pages
export function pageOfMarkdown(site: Site, path: string): Page | undefined {
    if (!path.endsWith(".md")) return undefined;
    const route = path.slice(0, -3);
    const folder = route.replace(/\/index$/, "") || "/";
    return site.pages.find(page => page.route === route) ?? site.pages.find(page => page.isDir && page.route === folder);
}

const description = (page: Page) => page.frontMatter.description || (page.markdown ? firstParagraph(stripFrontMatter(page.markdown)) : "");

// Links and images in the page's Markdown, made absolute: pages lead to their
// Markdown, files to where the site publishes them. Code blocks stay as they are.
function rewriteLinks(markdown: string, page: Page, url: UrlOf): string {
    const assetPath = (page.version ? `/${page.version}` : "") + docPath(page.route, page.isDir).slice(page.prefix.length);
    const target = (href: string) => {
        if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) return href;
        if (isAssetLink(href)) {
            const asset = href.startsWith("/_clay/") ? href : resolveDocAsset(href, assetPath);
            return asset ? url(asset) : href;
        }
        const route = resolveDocLink(href, docPath(page.route, page.isDir));
        if (route === undefined) return href;
        const [path, hash = ""] = route.split("#");
        const linked = path!.split("?")[0]!;
        const target = linked === (page.prefix || "/") ? markdownRoute(linked, true) : markdownRoute(linked, false);
        return url(target) + (hash ? `#${hash}` : "");
    };
    let fence: string | undefined;
    return markdown.split("\n").map(line => {
        const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
        if (fence) {
            if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
            return line;
        }
        if (marker) {
            fence = marker;
            return line;
        }
        return line
            .replace(/(!?\[[^\]]*\]\(\s*<?)([^)\s>]+)/g, (_, start, href) => start + target(href))
            .replace(/^(\s*\[[^\]]+\]:\s*<?)(\S+?)(>?(\s|$))/, (_, start, href, end) => start + target(href) + end);
    }).join("\n");
}

const lexer = new Marked({gfm: true}, componentSyntax());

// Request cells as agents can send them: a curl command, with a link to the operation's page
function requestsAsCode(markdown: string, page: Page, site: Site): string {
    if (!/^:{3,}[ \t]*(request|credentials)\b/m.test(markdown)) return markdown;
    const config = site.configs[page.language];
    const cells = pageCells(site, page, messagesFor(page.language, config?.messages?.[page.language]));
    const found: ContainerToken[] = [];
    lexer.walkTokens(lexer.lexer(markdown), (token: Token) => {
        const kind = (token as unknown as ContainerToken).kind;
        if (token.type === "container" && (kind === "request" || kind === "credentials")) found.push(token as unknown as ContainerToken);
    });
    for (const token of found) {
        // The form for credentials is for readers of the site; agents read what it holds
        if (token.kind === "credentials") {
            markdown = markdown.replace(token.raw.replace(/\n$/, ""), token.raw.replace(/\n$/, "").split("\n").slice(1, -1).join("\n"));
            continue;
        }
        const cell = cells(token.title, token.text ?? "");
        const text = typeof cell === "string" ? `> ${cell}`
            : (cell.title && cell.link ? `[${cell.title}](${cell.link})\n\n` : "") + "```sh\n" + curlCommand(buildRequest(cell, startingInputs(cell))) + "\n```";
        markdown = markdown.replace(token.raw.replace(/\n$/, ""), text);
    }
    return markdown;
}

// A page as Markdown: its text without front matter, under its title. A folder
// without text lists its pages.
export function pageMarkdown(page: Page, site: Site, url: UrlOf): string {
    const body = page.markdown !== undefined ? requestsAsCode(stripFrontMatter(page.markdown).trim(), page, site) : "";
    const hasTitle = /^#\s/m.test(body.split("\n").find(line => line.trim()) ?? "");
    const about = description(page);
    const head = hasTitle ? "" : `# ${page.title}\n\n${about ? `> ${about}\n\n` : ""}`;
    const children = page.isDir && !body
        ? site.pages.filter(child => page.children.some(c => c.route === child.route))
            .map(child => `- [${child.title}](${url(markdownRouteOf(child))})${description(child) ? `: ${description(child)}` : ""}`).join("\n")
        : "";
    return `${head}${rewriteLinks(body, page, url)}${children}\n`;
}

// The pages of an edition in the order of its navigation, start page first
function pagesInOrder(site: Site, edition: SiteEdition): Page[] {
    const byRoute = new Map(site.pages.filter(page => page.prefix === edition.prefix).map(page => [page.route, page]));
    const walk = (items: DocItem[] | undefined): Page[] => (items ?? []).flatMap(item => {
        const page = byRoute.get(item.displayLink);
        return [...(page ? [page] : []), ...walk(item.children)];
    });
    const start = byRoute.get(edition.prefix || "/");
    return [...(start ? [start] : []), ...walk(edition.nav.children), ...walk(edition.nav.apis)];
}

function editionLabel(site: Site, edition: SiteEdition): string {
    const language = site.languages.find(l => l.code === edition.language)?.label ?? edition.language;
    return [edition.version ? `version ${edition.version}` : "", site.languages.length > 1 ? language : ""].filter(Boolean).join(", ");
}

// The index for language models: what the docs are, and a link to the Markdown
// of every page, grouped by the top-level folders
export function llmsTxt(site: Site, edition: SiteEdition, url: UrlOf): string {
    const config = site.configs[edition.language] ?? site.config;
    const start = site.pages.find(page => page.prefix === edition.prefix && isStart(page));
    const about = start ? description(start) : "";
    const pages = new Map(site.pages.filter(page => page.prefix === edition.prefix).map(page => [page.route, page]));
    const entry = (item: DocItem, depth: number): string[] => {
        const page = pages.get(item.displayLink);
        const line = page ? `${"  ".repeat(depth)}- [${item.title}](${url(markdownRouteOf(page))})${description(page) ? `: ${description(page)}` : ""}` : "";
        return [line, ...(item.children ?? []).flatMap(child => entry(child, depth + 1))].filter(Boolean);
    };
    const top = edition.nav.children ?? [];
    const loose = top.filter(item => !item.children?.length);
    const sections = top.filter(item => item.children?.length);
    const others = site.editions.filter(other => other !== edition)
        .map(other => `- [${editionLabel(site, other) || "Other docs"}](${url(`${other.prefix}/llms.txt`)})`);

    return [
        `# ${config.title}`,
        about ? `\n> ${about}` : "",
        `\nThis is the documentation${editionLabel(site, edition) ? ` (${editionLabel(site, edition)})` : ""} as Markdown for language models and agents. ` +
        `Every link leads to the Markdown of a page; [llms-full.txt](${url(`${edition.prefix}/llms-full.txt`)}) holds all pages in one file. ` +
        `Each page of the website is also available as Markdown at its own address with ".md" appended.`,
        ...(start ? [`\n## Start\n\n- [${start.title}](${url(markdownRouteOf(start))})${about ? `: ${about}` : ""}`] : []),
        ...(loose.length ? [`\n## Pages\n\n${loose.flatMap(item => entry(item, 0)).join("\n")}`] : []),
        ...sections.map(item => `\n## ${item.title}\n\n${entry(item, 0).join("\n")}`),
        // Each API (OpenAPI): its overview, operations and schemas
        ...(edition.nav.apis ?? []).map(item => `\n## ${item.title}\n\n${entry(item, 0).join("\n")}`),
        `\n## Optional\n\n- [All pages in one file](${url(`${edition.prefix}/llms-full.txt`)})${others.length ? `\n${others.join("\n")}` : ""}`,
    ].filter(Boolean).join("\n") + "\n";
}

// All pages of an edition in one file, each with the address it comes from
export function llmsFullTxt(site: Site, edition: SiteEdition, url: UrlOf): string {
    const config = site.configs[edition.language] ?? site.config;
    const pages = pagesInOrder(site, edition);
    return `# ${config.title}\n\n> All pages of the documentation${editionLabel(site, edition) ? ` (${editionLabel(site, edition)})` : ""} as Markdown, in the order of its navigation.\n` +
        pages.map(page => `\n---\n\nSource: ${url(markdownRouteOf(page))}\n\n${pageMarkdown(page, site, url)}`).join("");
}
