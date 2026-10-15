import katex from "katex";
import {renderMermaidSVG} from "beautiful-mermaid";
import {Marked, type MarkedExtension, type Token, type Tokens} from "marked";
import type {BadgeToken, ContainerToken, MathToken, TabToken} from "../../common/markdown-components";
import type {Messages} from "../../common/i18n";
import {COPY_ICON} from "./code-block";

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Badge types, named like the alerts
const BADGE_COLORS: Record<string, string> = {
    "": "badge-primary", info: "badge-info", note: "badge-neutral", tip: "badge-success", important: "badge-secondary",
    warning: "badge-warning", caution: "badge-error", danger: "badge-error",
};

function math(token: MathToken): string {
    return katex.renderToString(token.text, {displayMode: token.type === "mathBlock", throwOnError: false, output: "htmlAndMathml"});
}

// A card is a list item: a link on its first line, optionally followed by
// {fa-... icon classes}, and its text below. Cards without icon or text get
// the ones of the page they link to (render-doc.ts).
const CARD = /^\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)[ \t]*(?:\{([\w\s-]+)\})?[ \t]*(?:\n([\s\S]*))?$/;
const inline = new Marked();

function cards(token: ContainerToken, render: (tokens: Token[]) => string): string {
    const items = token.tokens.filter((t): t is Tokens.List => t.type === "list").flatMap(list => list.items);
    if (!items.length) return render(token.tokens);
    const cards = items.map(item => {
        const card = CARD.exec(item.text.trim());
        if (!card) return `<div class="clay-card">${render(item.tokens)}</div>`;
        const [, title, href, icon, text] = card;
        const description = text?.trim() ? inline.parseInline(text.trim().replace(/\s*\n\s*/g, " ")) as string : "";
        // Links inside a card would nest in its link
        const plain = description.replace(/<\/?a\b[^>]*>/g, "");
        return `<a class="clay-card" href="${escapeHtml(href!)}">`
            + (icon ? `<i class="clay-card-icon ${escapeHtml(icon.trim())}" aria-hidden="true"></i>` : "")
            + `<span class="clay-card-title">${inline.parseInline(title!)}</span>`
            + (plain ? `<span class="clay-card-text">${plain}</span>` : "")
            + `</a>`;
    });
    return `<div class="clay-cards not-prose">${cards.join("")}</div>\n`;
}

// Renders the components of markdown-components.ts. Tabs are numbered per
// document for their ids, so every document gets its own renderers.
export function componentRenderers(messages: Messages): MarkedExtension {
    let tabGroups = 0;

    function tabs(token: ContainerToken, render: (tokens: Token[]) => string): string {
        const group = `clay-tabs-${++tabGroups}`;
        const tabs = token.tokens as unknown as TabToken[];
        const buttons = tabs.map((tab, i) =>
            `<button type="button" role="tab" id="${group}-${i}" class="tab${i ? "" : " tab-active"}" aria-controls="${group}-${i}-panel" `
            + `aria-selected="${i === 0}" tabindex="${i ? -1 : 0}">${escapeHtml(tab.label)}</button>`);
        const panels = tabs.map((tab, i) =>
            `<div role="tabpanel" id="${group}-${i}-panel" class="clay-tab-panel" aria-labelledby="${group}-${i}"${i ? " hidden" : ""}>${render(tab.tokens)}</div>`);
        return `<div class="clay-tabs${token.kind === "code-group" ? " clay-code-group" : ""}" data-tabs>`
            + `<div role="tablist" class="tabs tabs-border not-prose">${buttons.join("")}</div>${panels.join("")}</div>\n`;
    }

    return {
        extensions: [
            {
                name: "container",
                renderer(generic) {
                    const token = generic as unknown as ContainerToken;
                    const render = (tokens: Token[]) => this.parser.parse(tokens);
                    switch (token.kind) {
                        case "tabs":
                        case "code-group":
                            return tabs(token, render);
                        case "steps":
                            return `<div class="clay-steps">${render(token.tokens)}</div>\n`;
                        case "cards":
                            return cards(token, render);
                        case "prompt":
                            return `<div class="clay-prompt code-block not-prose"><div class="clay-prompt-title">`
                                + `<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>`
                                + `<span>${inline.parseInline(token.title || escapeHtml(messages.suggestedPrompt))}</span></div>`
                                + `<pre class="clay-prompt-text">${escapeHtml(token.text ?? "")}</pre>`
                                + `<button type="button" class="copy-code btn btn-sm btn-square btn-ghost" title="${escapeHtml(messages.copyPrompt)}" `
                                + `aria-label="${escapeHtml(messages.copyPrompt)}"><i class="${COPY_ICON}"></i></button></div>\n`;
                        case "details":
                            return `<details class="clay-details collapse"><summary class="collapse-title">`
                                + `<span class="clay-details-icon" aria-hidden="true"><i class="fa-solid fa-chevron-right"></i></span>`
                                + `<span class="clay-details-title">${inline.parseInline(token.title || escapeHtml(messages.details))}</span></summary>`
                                + `<div class="collapse-content">${render(token.tokens)}</div></details>\n`;
                    }
                },
            },
            {name: "mathBlock", renderer: token => `<div class="clay-math">${math(token as unknown as MathToken)}</div>\n`},
            {name: "math", renderer: token => math(token as unknown as MathToken)},
            {
                name: "badge",
                renderer(generic) {
                    const token = generic as unknown as BadgeToken;
                    const color = BADGE_COLORS[token.variant.toLowerCase()] ?? BADGE_COLORS[""];
                    return `<span class="badge badge-sm badge-soft ${color} clay-badge">${escapeHtml(token.text)}</span>`;
                },
            },
        ],
    };
}

// A file tree, written as an indented list of names: folders end with "/" or
// have entries below them, "# text" adds a comment and "..." stands for more
// entries. Output of the "tree" command works as well. Folders fold like in
// an editor's explorer.
const FILE_ICONS: [RegExp, string][] = [
    [/\.(md|mdx|markdown)$/i, "fa-brands fa-markdown"],
    [/\.(png|jpe?g|gif|svg|webp|avif|ico)$/i, "fa-regular fa-file-image"],
    [/\.(ya?ml|json|toml|ts|js|mjs|cjs|vue|py|go|rs|java|sh|css|html)$/i, "fa-regular fa-file-code"],
    [/\.(zip|tgz|gz|tar)$/i, "fa-regular fa-file-zipper"],
    [/\.pdf$/i, "fa-regular fa-file-pdf"],
];

export function fileTree(source: string): string {
    type Entry = { name: string, comment: string, indent: number, children: Entry[] };
    const root: Entry = {name: "", comment: "", indent: -1, children: []};
    const stack = [root];
    for (const line of source.split("\n")) {
        if (!line.trim()) continue;
        // Indentation, tree-drawing characters and list markers count as indentation
        const prefix = /^[\s│├└─|`+-]*(?:[-*]\s+)?/.exec(line)![0];
        const [name, ...comment] = line.slice(prefix.length).split(/\s+#\s?/);
        const entry: Entry = {name: name!.trim(), comment: comment.join(" # ").trim(), indent: prefix.length, children: []};
        while (stack.length > 1 && stack.at(-1)!.indent >= entry.indent) stack.pop();
        stack.at(-1)!.children.push(entry);
        stack.push(entry);
    }

    const icon = (classes: string, extra = "") => `<i class="${classes}${extra}" aria-hidden="true"></i>`;
    // Room for the folders' arrow and icon, so names line up
    const space = (name: string) => `<span class="${name}" aria-hidden="true"></span>`;
    const label = (entry: Entry) => `<span class="file-tree-name">${escapeHtml(entry.name.replace(/\/$/, ""))}</span>`
        + (entry.comment ? `<span class="file-tree-comment">${escapeHtml(entry.comment)}</span>` : "");

    const item = (entry: Entry): string => {
        if (entry.children.length) {
            return `<li><details open><summary class="file-tree-entry file-tree-folder">`
                + icon("fa-solid fa-chevron-right", " file-tree-chevron") + icon("fa-solid fa-folder-open", " file-tree-open") + icon("fa-solid fa-folder", " file-tree-closed") + label(entry)
                + `</summary>${list(entry.children)}</details></li>`;
        }
        const chevron = space("file-tree-chevron");
        if (entry.name.endsWith("/")) return `<li><span class="file-tree-entry file-tree-folder">${chevron}${icon("fa-solid fa-folder")}${label(entry)}</span></li>`;
        if (/^(\.\.\.|…)$/.test(entry.name)) return `<li><span class="file-tree-entry file-tree-more">${chevron}${space("file-tree-icon")}${label(entry)}</span></li>`;
        const file = FILE_ICONS.find(([pattern]) => pattern.test(entry.name))?.[1] ?? "fa-regular fa-file-lines";
        return `<li><span class="file-tree-entry">${chevron}${icon(file)}${label(entry)}</span></li>`;
    };
    const list = (entries: Entry[]): string => `<ul>${entries.map(item).join("")}</ul>`;

    return `<div class="file-tree not-prose">${list(root.children)}</div>`;
}

// Mermaid diagrams are drawn when the site is built (beautiful-mermaid), as SVG
// that takes its colors from the site's theme (tailwind.css), so they show
// without JavaScript and follow theme switches. Kinds it cannot draw, like pie
// charts, are drawn in the browser by Mermaid itself (app/utils/diagrams.ts),
// and show their source until then. n numbers the diagrams of a page, for the
// ids inside them.
export function mermaidDiagram(source: string, n: number): string {
    try {
        const svg = renderMermaidSVG(source, {transparent: true})
            // The colors and fonts come from the site (tailwind.css), and no
            // stylesheet loads from elsewhere
            .replace(/<style>[\s\S]*?<\/style>/, "")
            .replace(/^<svg([^>]*?) style="[^"]*"/, "<svg$1")
            // Arrow heads are defined in each diagram; their ids must differ
            .replace(/ id="([^"]+)"/g, ` id="diagram-${n}-$1"`)
            .replace(/url\(#([^)]+)\)/g, `url(#diagram-${n}-$1)`);
        return `<div class="mermaid-diagram">${svg}</div>`;
    } catch {
        return `<div class="mermaid-diagram" data-client><pre class="mermaid-source">${escapeHtml(source)}</pre></div>`;
    }
}
