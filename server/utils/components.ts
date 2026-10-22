import katex from "katex";
import {renderMermaidSVG} from "beautiful-mermaid";
import {Lexer, Marked, Parser, type MarkedExtension, type Token, type Tokens} from "marked";
import type {BadgeToken, ContainerToken, MathToken, TabToken} from "../../common/markdown-components";
import type {Messages} from "../../common/i18n";
import {COPY_ICON} from "./code-block";
import {buildRequest, curlCommand, startingInputs} from "../../common/openapi";
import type {CellResolver} from "./request-cell";

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

// Fields: each list item a name in code, its type, and flags: bold for required,
// italic for others, struck through for deprecated, e.g.
// "- `name` string **required** *read-only*", with its text and nested fields
// below, like the properties of a schema (lib/openapi-pages.ts). "·" between
// them may be written and is left out. Items without that shape show as they are.
function fieldHead(line: string): { name?: string, type: string, flags: string } | undefined {
    const tokens = Lexer.lexInline(line.replace(/(^|\s)·(?=\s|$)/g, "$1"));
    const name = tokens[0]?.type === "codespan" ? (tokens.shift() as Tokens.Codespan).text : undefined;
    const type: Token[] = [];
    const flags: string[] = [];
    for (const token of tokens) {
        const kind = token.type === "strong" ? " clay-field-required" : token.type === "del" ? " clay-field-deprecated" : token.type === "em" ? "" : undefined;
        if (kind === undefined) type.push(token);
        else flags.push(`<span class="clay-field-flag${kind}">${Parser.parseInline((token as Tokens.Strong).tokens)}</span>`);
    }
    const typeHtml = Parser.parseInline(type).trim();
    return name || typeHtml ? {name, type: typeHtml, flags: flags.join("")} : undefined;
}

function fields(list: Tokens.List, render: (tokens: Token[]) => string): string {
    const rows = list.items.map(item => {
        const [head, ...rest] = item.tokens;
        const lines = head && (head.type === "text" || head.type === "paragraph") ? (head as Tokens.Text).text.split("\n") : [];
        const field = lines.length ? fieldHead(lines[0]!) : undefined;
        if (!head || !field) return `<div class="clay-field">${render(item.tokens)}</div>`;
        const nested = rest.filter((t): t is Tokens.List => t.type === "list");
        const body = rest.filter(t => t.type !== "list" && t.type !== "space");
        // A head of more than one line: the rest is text
        const more = lines.slice(1).join(" ").trim();
        return `<div class="clay-field"><div class="clay-field-head">`
            + (field.name ? `<code class="clay-field-name">${escapeHtml(field.name)}</code>` : "")
            + (field.type ? `<span class="clay-field-type">${field.type}</span>` : "")
            + field.flags + `</div>`
            + (more || body.length ? `<div class="clay-field-text">${more ? `<p>${inline.parseInline(more) as string}</p>` : ""}${render(body)}</div>` : "")
            + nested.map(list => `<div class="clay-fields clay-fields-nested">${fields(list, render)}</div>`).join("")
            + `</div>`;
    });
    return rows.join("");
}

// Endpoints: each list item "`GET /path` [Title](link)", or "`GET /path` text",
// shown with the method's color; the method in any case, the path also in a
// code span of its own
const ENDPOINT = /^`([a-z]+)(?: ([^`]*))?`(?:\s*`([^`]+)`)?(?:\s*\[(.+?)\]\((\S+?)\))?(.*)$/i;

function endpoints(token: ContainerToken, render: (tokens: Token[]) => string): string {
    const lists = token.tokens.filter((t): t is Tokens.List => t.type === "list");
    if (!lists.length) return render(token.tokens);
    const rows = lists.flatMap(list => list.items).map(item => {
        const match = ENDPOINT.exec(item.text.trim());
        if (!match) return `<li>${render(item.tokens)}</li>`;
        const [, word, own, separate, title, href, after = ""] = match;
        const method = word!.toUpperCase();
        const path = own ?? separate;
        const deprecated = /~~/.test(after);
        const inner = `<span class="clay-method clay-method-${method.toLowerCase()}">${method}</span>`
            // Long paths break after a slash, not inside a word
            + (path ? `<code class="clay-endpoint-path">${escapeHtml(path).replace(/\//g, "/<wbr>")}</code>` : "")
            + `<span class="clay-endpoint-title">${inline.parseInline(title ?? (deprecated ? "" : after.trim())) as string}</span>`;
        return href
            ? `<li><a class="clay-endpoint${deprecated ? " clay-endpoint-deprecated" : ""}" href="${escapeHtml(href)}">${inner}</a></li>`
            : `<li><div class="clay-endpoint">${inner}</div></li>`;
    });
    return `<ul class="clay-endpoints not-prose">${rows.join("")}</ul>\n`;
}

// Where readers enter what the requests of an API need, for all its request cells
// (ApiCredentials.vue); without JavaScript, what the container holds
function credentialsForm(token: ContainerToken, render: (tokens: Token[]) => string, cells?: CellResolver): string {
    const found = cells?.credentials?.(token.title.trim());
    return found ? `<div class="clay-credentials not-prose" data-credentials="${escapeHtml(JSON.stringify(found))}">${render(token.tokens)}</div>\n` : render(token.tokens);
}

// A request cell as the page shows it without JavaScript, and to search
// engines and agents: the request as a curl command and an example response.
// The browser makes it a cell to fill in and run (RequestCell.vue), from its data.
function requestCell(token: ContainerToken, messages: Messages, cells?: CellResolver): string {
    const cell = cells?.(token.title, token.text ?? "") ?? messages.requestInvalid;
    if (typeof cell === "string") {
        return `<div class="markdown-alert markdown-alert-caution"><p class="markdown-alert-title text-error">`
            + `<i class="fa-solid fa-triangle-exclamation mr-2"></i>${escapeHtml(messages.alertCaution)}</p><p>${escapeHtml(cell)}</p></div>\n`;
    }
    const command = curlCommand(buildRequest(cell, startingInputs(cell)));
    const example = cell.example
        ? `<div class="clay-request-out"><div class="clay-request-status">${escapeHtml(messages.requestExample)} · ${escapeHtml(cell.example.status)}</div>`
            + `<pre><code>${escapeHtml(cell.example.body)}</code></pre></div>`
        : "";
    return `<div class="clay-request not-prose" data-request="${escapeHtml(JSON.stringify(cell))}">`
        + `<div class="clay-request-head"><span class="clay-method clay-method-${escapeHtml(cell.method.toLowerCase())}">${escapeHtml(cell.method)}</span>`
        + `<code class="clay-request-path">${escapeHtml(cell.path)}</code>`
        + (cell.title ? `<span class="clay-request-title">${escapeHtml(cell.title)}</span>` : "") + `</div>`
        + `<pre class="clay-request-code"><code>${escapeHtml(command)}</code></pre>${example}</div>\n`;
}

// Renders the components of markdown-components.ts. Tabs are numbered per
// document for their ids, so every document gets its own renderers. Request
// cells are found by cells (request-cell.ts).
// windowDots: code groups of shell code show a window's buttons in the bar of their tabs ("theme" in clay.yaml)
export function componentRenderers(messages: Messages, cells?: CellResolver, windowDots = true): MarkedExtension {
    let tabGroups = 0;

    // "::: tabs status" holds the responses of an API operation (lib/openapi-pages.ts):
    // its tabs are colored by status, and picking one is not carried to other groups
    function tabs(token: ContainerToken, render: (tokens: Token[]) => string): string {
        const group = `clay-tabs-${++tabGroups}`;
        const tabs = token.tokens as unknown as TabToken[];
        const status = token.kind === "tabs" && token.title === "status";
        const statusClass = (label: string) => status ? ` clay-status clay-status-${/^[1-5]/.test(label) ? label[0] : "default"}` : "";
        const buttons = tabs.map((tab, i) =>
            `<button type="button" role="tab" id="${group}-${i}" class="tab${i ? "" : " tab-active"}${statusClass(tab.label)}" aria-controls="${group}-${i}-panel" `
            + `aria-selected="${i === 0}" tabindex="${i ? -1 : 0}">${escapeHtml(tab.label)}</button>`);
        const panels = tabs.map((tab, i) =>
            `<div role="tabpanel" id="${group}-${i}-panel" class="clay-tab-panel" aria-labelledby="${group}-${i}" data-label="${escapeHtml(tab.label)}"${i ? " hidden" : ""}>`
            + `${render(tab.tokens)}</div>`);
        // A code group with shell code in a tab is a terminal: the bar of its tabs gets a window's buttons (code.css)
        const terminal = token.kind === "code-group" && panels.some(panel => panel.includes('class="code-block is-terminal'));
        const codeGroup = token.kind === "code-group" ? ` clay-code-group${terminal ? " is-terminal" : ""}${terminal && windowDots ? " has-dots" : ""}` : "";
        return `<div class="clay-tabs${codeGroup}" data-tabs${status ? " data-tabs-local" : ""}>`
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
                            // In daisyUI's aura: a light that runs around its edge
                            return `<div class="clay-prompt-aura aura not-prose"><div class="clay-prompt code-block"><div class="clay-prompt-title">`
                                + `<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>`
                                + `<span>${inline.parseInline(token.title || escapeHtml(messages.suggestedPrompt))}</span></div>`
                                + `<pre class="clay-prompt-text">${escapeHtml(token.text ?? "")}</pre>`
                                + `<button type="button" class="copy-code btn btn-sm btn-square btn-ghost" title="${escapeHtml(messages.copyPrompt)}" `
                                + `aria-label="${escapeHtml(messages.copyPrompt)}"><i class="${COPY_ICON}"></i></button></div></div>\n`;
                        case "request":
                            return requestCell(token, messages, cells);
                        case "fields": {
                            const lists = token.tokens.filter((t): t is Tokens.List => t.type === "list");
                            const other = token.tokens.filter(t => t.type !== "list");
                            return `<div class="clay-fields not-prose">${render(other)}${lists.map(list => fields(list, render)).join("")}</div>\n`;
                        }
                        case "endpoints":
                            return endpoints(token, render);
                        case "credentials":
                            return credentialsForm(token, render, cells);
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
// that takes its colors from the site's theme (assets/css/components.css), so they show
// without JavaScript and follow theme switches. Kinds it cannot draw, like pie
// charts, are drawn in the browser by Mermaid itself (app/utils/diagrams.ts),
// and show their source until then. n numbers the diagrams of a page, for the
// ids inside them.
export function mermaidDiagram(source: string, n: number): string {
    try {
        const svg = renderMermaidSVG(source, {transparent: true})
            // The colors and fonts come from the site (assets/css/components.css), and no
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
