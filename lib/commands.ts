import {existsSync, readFileSync, statSync} from "node:fs";
import {join, posix, relative} from "node:path";
import GithubSlugger from "github-slugger";
import {Marked, type Tokens} from "marked";
import {
    addLink, createFolder, createPage, createTranslation, deleteEntry, editorContext, getSetting, loadDocsTree, loadSettings,
    moveEntry, removeLink, reorder, saveSettings, setFields, setSetting, settingRows, slugify,
    type Edition, type EditorNode, type FrontMatterUpdates,
} from "./editor";
import {loadSite} from "./site";
import {brokenLinks} from "./checks";
import {headingText} from "../common/markdown-text";
import {componentSyntax} from "../common/markdown-components";
import {highlight, searchSections} from "../common/search";
import {buildSearchIndex} from "../server/utils/search-index";

// "clay edit <command>", "clay check" and "clay search": the editor's actions,
// and finding what to change, as commands for scripts and AI agents. Each returns what happened, for people as text and
// for programs as JSON (--json); the interactive editor is editor-screen.ts.

export type CommandOptions = {
    json?: boolean;
    yes?: boolean;
    lang?: string;
    docsVersion?: string;
    slug?: string;
    position?: string;
    redirect?: boolean;
    limit?: number;
};

export type CommandResult = { code: number, text: string, data: Record<string, unknown> };

class UsageError extends Error {}

export const EDIT_HELP = `clay edit - change the docs from the command line

Without a command, "clay edit" opens the interactive editor (needs a terminal).
With a command, it does one change and exits, for scripts and AI agents.

Paths are relative to the docs: docs/, or with versions docs/latest/ (docs/<name>/ with --docs-version):
  guides/setup.md   a page            ".md" may be left out: guides/setup
  guides            a folder          its title and order live in guides/index.md
  index.md          the start page    docs/index.md
  ""                the top level     where a folder is expected

Commands:
  list                                 Every page and folder: path, title, icon, order, URL
  show <path>                          All front matter of one page or folder
  set <path> <field>=<value>...        Set front matter; an empty value removes the field
                                       fields: title icon description order list hero
  new page <folder> <title>            Create a page (file name from the title, or --slug)
  new folder <parent> <title>          Create a folder with an index.md
  move <path> <folder>                 Move a page (with its translations) or a folder
  rename <path> <new-name>             Rename the file or folder (without ".md")
                                       --redirect: the old address keeps leading to the page
  order <path> <position>              Put an entry at a position (1 = first) in its folder
  delete <path> --yes                  Delete a page with its translations, or a folder
  translate <path> --lang <code>       Start a translation: copy the original to <name>.<code>.md
  config                               All settings of clay.yaml with their keys
  config get <key>                     One setting, e.g. title or navbar.source.link
  config set <key> <value>             Change a setting; keys of links: navbar.links.<n>.name|icon|link
  config unset <key>                   Remove a setting
  config add-link <name> <icon> <url>  Add a navbar link
  config remove-link <n>               Remove the n-th navbar link (1 = first)

Options:
  --json                Print the result as JSON (see below) instead of text
  --lang <code>         Work in a language other than the default (set, show, list, translate, config)
  --docs-version <name> Work in an older version in docs/<name>/
  --slug <name>         File or folder name for new and move (default: from the title or unchanged)
  --yes                 Confirm delete
  --redirect            move and rename: add the old address to the page's "redirects"

Examples:
  clay edit list --json
  clay edit set guides/setup.md title="Setting up" icon="fa-solid fa-wrench" order=2
  clay edit set guides description=
  clay edit new page guides "Upgrading"
  clay edit move guides/setup.md reference --redirect
  clay edit order guides/setup.md 1
  clay edit set guides/setup.md title=Einrichtung --lang de
  clay edit config set navbar.links.1.icon "fa-solid fa-book"
  clay check --json

Results:
  Changes are written right away, only to the files that change; comments and
  formatting stay. Moving, renaming and deleting do not rewrite links: the
  result lists the links that broke, so you can fix them. Run "clay check"
  afterwards: it reports broken links and settings without building the site.

  With --json, every command prints one object: {"ok": true, ...} with the
  command's result ("written": files changed, "broken": links that broke,
  "moved" and "redirects" for move and rename, and "entries", "entry" or
  "settings" for list, show and config), or
  {"ok": false, "error": "..."} when it fails.

Exit codes: 0 done, 1 failed or problems found (check), 2 wrong usage.`;

const FIELDS = ["title", "icon", "description", "order", "list", "hero"] as const;

// Turns "guides/setup", "./docs/guides/setup.md" or "guides/" into the path the editor uses
function normalize(path: string): string {
    return path.trim().replace(/\\/g, "/").replace(/^\.?\//, "").replace(/^docs\//, "").replace(/\/+$/, "");
}

function flatten(nodes: EditorNode[]): EditorNode[] {
    return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

function findNode(tree: EditorNode[], path: string): EditorNode {
    const wanted = normalize(path);
    if (["", "index", "index.md"].includes(wanted)) return tree[0]!;
    const all = flatten(tree);
    const node = all.find(n => n.path === wanted) ?? all.find(n => n.kind === "page" && n.path === `${wanted}.md`)
        ?? all.find(n => n.kind === "folder" && `${n.path}/index.md` === wanted);
    if (!node) throw new Error(`No page or folder "${path}" in the docs; "clay edit list" shows the paths`);
    return node;
}

// The entries of a folder ("" for the top level), as the editor orders them
function siblingsOf(tree: EditorNode[], folder: string): EditorNode[] {
    if (folder === "") return tree.filter(node => node.kind !== "start");
    const node = findNode(tree, folder);
    if (node.kind !== "folder") throw new Error(`"${folder}" is not a folder`);
    return node.children;
}

const parentOf = (node: EditorNode) => posix.dirname(node.path) === "." ? "" : posix.dirname(node.path);
const nameOf = (node: EditorNode) => posix.basename(node.path).replace(/\.md$/i, "");

function editionOf(root: string, options: CommandOptions): Edition & { defaultLanguage: string, prefix: string } {
    const {versions, languages} = editorContext(root);
    const version = options.docsVersion ?? "";
    if (!versions.includes(version)) throw new Error(`No version "${version}" in docs/; versions: ${versions.filter(Boolean).join(", ") || "none"}`);
    const language = options.lang ?? languages[0]!;
    if (!languages.includes(language)) throw new Error(`"${language}" is not one of the site's languages: ${languages.join(", ")}`);
    const prefix = (version ? `/${version}` : "") + (language === languages[0] ? "" : `/${language}`);
    return {version, language, defaultLanguage: languages[0]!, prefix};
}

// What an entry looks like to a reader of this command's output
function describe(node: EditorNode, prefix: string): Record<string, unknown> {
    const route = node.kind === "start" ? "/" : "/" + node.path.replace(/\.md$/i, "");
    return {
        path: node.kind === "folder" ? `${node.path}/` : node.kind === "start" ? "index.md" : node.path,
        kind: node.kind,
        title: node.frontMatter.title ?? node.fallbackTitle,
        ...(node.frontMatter.title ? {} : {titleFromContent: true}),
        ...Object.fromEntries(["icon", "description", "list", "hero"].map(key => [key, (node.frontMatter as Record<string, unknown>)[key]])
            .filter(([, value]) => value !== undefined)),
        ...(node.order === undefined ? {} : {order: node.order}),
        url: (prefix + route).replace(/\/$/, "") || "/",
        file: node.file,
        ...(node.exists ? {} : {fileExists: false}),
        ...(node.children.length ? {children: node.children.map(child => describe(child, prefix))} : {}),
    };
}

function listText(nodes: EditorNode[], depth = 0): string[] {
    return nodes.flatMap(node => {
        const mark = node.kind === "start" ? "⌂" : node.kind === "folder" ? "▾" : "◆";
        const title = node.frontMatter.title ?? `${node.fallbackTitle} (from content)`;
        const details = [node.order === undefined ? "" : `order ${node.order}`, node.frontMatter.icon ?? ""].filter(Boolean).join(", ");
        const path = node.kind === "folder" ? `${node.path}/` : node.kind === "start" ? "index.md" : node.path;
        return [`${"  ".repeat(depth)}${mark} ${path}  "${title}"${details ? `  (${details})` : ""}`, ...listText(node.children, depth + 1)];
    });
}

// "order=2", "list=true", "description=" (removes)
function parseUpdates(pairs: string[]): FrontMatterUpdates {
    if (pairs.length === 0) throw new UsageError(`Name what to set, e.g. title="Setup" order=2`);
    return Object.fromEntries(pairs.map(pair => {
        const at = pair.indexOf("=");
        if (at < 1) throw new UsageError(`"${pair}" is not <field>=<value>, e.g. title="Setup"`);
        const field = pair.slice(0, at).trim();
        const value = pair.slice(at + 1);
        if (!(FIELDS as readonly string[]).includes(field)) throw new UsageError(`Unknown field "${field}"; fields: ${FIELDS.join(", ")}`);
        if (value === "") return [field, null];
        if (field === "order") {
            if (!/^-?\d+$/.test(value)) throw new UsageError(`order must be a whole number, not "${value}"`);
            return [field, Number(value)];
        }
        if (field === "list" || field === "hero") {
            if (!/^(true|false|yes|no)$/i.test(value)) throw new UsageError(`${field} must be true or false, not "${value}"`);
            return [field, /^(true|yes)$/i.test(value)];
        }
        return [field, value];
    }));
}

// Navbar links are counted from 1 in keys, like in the help: navbar.links.1.name
function settingPath(key: string): (string | number)[] {
    const path: (string | number)[] = key.split(".").filter(Boolean).map(part => /^\d+$/.test(part) ? Number(part) : part);
    if (path[0] === "navbar" && path[1] === "links" && typeof path[2] === "number") path[2] = path[2] - 1;
    if (path.length === 0) throw new UsageError("Name a setting, e.g. title or navbar.source.link");
    return path;
}

const done = (text: string, data: Record<string, unknown> = {}): CommandResult => ({code: 0, text, data: {ok: true, ...data}});

const changes = (written: string[], broken: string[] = []) =>
    [...written.map(file => `wrote ${file}`), ...broken.map(link => `broken link: ${link}`),
        ...(broken.length ? ["Fix these links, then run \"clay check\"."] : [])].join("\n");

export function runEdit(root: string, args: string[], options: CommandOptions = {}): CommandResult {
    try {
        return edit(root, args, options);
    } catch (error) {
        const message = (error as Error).message;
        return {code: error instanceof UsageError ? 2 : 1, text: error instanceof UsageError ? `${message}\n\nRun "clay edit help" for usage.` : message,
            data: {ok: false, error: message}};
    }
}

function edit(root: string, args: string[], options: CommandOptions): CommandResult {
    const [command, ...rest] = args;
    if (command === "config") return config(root, rest, options);
    const edition = editionOf(root, options);
    const tree = loadDocsTree(root, edition);
    const need = (count: number, usage: string) => {
        if (rest.length < count) throw new UsageError(`Usage: clay edit ${usage}`);
    };

    switch (command) {
        case "list": {
            const entries = tree.map(node => describe(node, edition.prefix));
            return done(listText(tree).join("\n"), {edition: {version: edition.version, language: edition.language}, entries});
        }
        case "show": {
            need(1, "show <path>");
            const node = findNode(tree, rest[0]!);
            const entry = describe({...node, children: []}, edition.prefix);
            return done(Object.entries(entry).map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join("\n"), {entry});
        }
        case "set": {
            need(2, "set <path> <field>=<value>...");
            const node = findNode(tree, rest[0]!);
            const updates = parseUpdates(rest.slice(1));
            if ("order" in updates && edition.language !== edition.defaultLanguage) {
                throw new Error(`The order is the same in every language; set it without --lang`);
            }
            const written = setFields(root, edition, node, updates);
            return done(changes([written]), {written: [written]});
        }
        case "new": {
            need(3, "new page|folder <folder> <title>");
            const [kind, folder, title] = rest as [string, string, string];
            const parent = normalize(folder);
            const siblings = siblingsOf(tree, parent);
            const slug = options.slug ?? slugify(title);
            if (kind !== "page" && kind !== "folder") throw new UsageError(`Create a "page" or a "folder", not "${kind}"`);
            const written = kind === "page"
                ? createPage(root, edition.version, parent, title, slug, siblings)
                : createFolder(root, edition.version, parent, title, slug, siblings);
            return done(changes([written]), {written: [written]});
        }
        case "move":
        case "rename": {
            need(2, command === "move" ? "move <path> <folder>" : "rename <path> <new-name>");
            const node = findNode(tree, rest[0]!);
            const folder = command === "move" ? normalize(rest[1]!) : parentOf(node);
            if (command === "move" && folder !== "") siblingsOf(tree, folder);
            const slug = command === "rename" ? rest[1]!.replace(/\.md$/i, "") : options.slug ?? nameOf(node);
            const {moved, broken, redirects} = moveEntry(root, edition.version, node, folder, slug, options.redirect);
            return done([...moved.map(line => `moved ${line}`), ...redirects.map(line => `redirect ${line}`), changes([], broken)].filter(Boolean).join("\n"),
                {moved, redirects, broken});
        }
        case "order": {
            need(2, "order <path> <position>");
            if (edition.language !== edition.defaultLanguage) throw new Error(`The order is the same in every language; change it without --lang`);
            const node = findNode(tree, rest[0]!);
            if (node.kind === "start") throw new Error("The start page has no place in the order");
            const siblings = siblingsOf(tree, parentOf(node));
            const position = Number(rest[1]);
            if (!Number.isInteger(position) || position < 1) throw new UsageError(`The position is a number from 1 to ${siblings.length}`);
            const others = siblings.filter(sibling => sibling !== node);
            others.splice(Math.min(position, siblings.length) - 1, 0, node);
            const written = reorder(root, edition.version, others);
            return done(written.length ? changes(written) : "already in place", {written});
        }
        case "delete": {
            need(1, "delete <path> --yes");
            const node = findNode(tree, rest[0]!);
            if (!options.yes) throw new UsageError(`Deleting ${node.path || "the start page"} cannot be undone here; add --yes to confirm`);
            const {deleted, broken} = deleteEntry(root, edition.version, node);
            return done([...deleted.map(file => `deleted ${file}`), changes([], broken)].filter(Boolean).join("\n"), {deleted, broken});
        }
        case "translate": {
            need(1, "translate <path> --lang <code>");
            if (edition.language === edition.defaultLanguage) throw new UsageError(`Name the language to translate into with --lang`);
            const written = createTranslation(root, edition, findNode(tree, rest[0]!));
            return done(`${changes([written])}\nTranslate its text and front matter; until then it shows the original's text.`, {written: [written]});
        }
        default:
            throw new UsageError(command ? `Unknown command "${command}"` : "Name a command");
    }
}

function config(root: string, args: string[], options: CommandOptions): CommandResult {
    const [command, ...rest] = args;
    const settings = loadSettings(root);
    const {doc} = settings;
    const lang = options.lang;
    const save = (key: string) => {
        const written = saveSettings(root, settings) ? ["clay.yaml"] : [];
        return done(written.length ? `wrote clay.yaml (${key})` : "no change", {written});
    };

    switch (command) {
        case undefined: {
            const rows = settingRows(doc).filter(row => row.kind === "field");
            const list = rows.map(row => {
                const path = row.path.map((part, i) => i === 2 && row.path[1] === "links" ? Number(part) + 1 : part);
                return {key: path.join("."), label: row.label, value: getSetting(doc, row.path, lang)};
            });
            return done(list.map(row => `${row.key.padEnd(24)} ${row.value || "-"}`).join("\n"), {settings: list});
        }
        case "get": {
            if (!rest[0]) throw new UsageError("Usage: clay edit config get <key>");
            const value = getSetting(doc, settingPath(rest[0]), lang);
            return done(value, {key: rest[0], value});
        }
        case "set": {
            if (rest.length < 2) throw new UsageError("Usage: clay edit config set <key> <value>");
            setSetting(doc, settingPath(rest[0]!), rest[1]!, lang);
            return save(rest[0]!);
        }
        case "unset": {
            if (!rest[0]) throw new UsageError("Usage: clay edit config unset <key>");
            setSetting(doc, settingPath(rest[0]), "", lang);
            return save(rest[0]);
        }
        case "add-link": {
            if (rest.length < 3) throw new UsageError("Usage: clay edit config add-link <name> <icon> <url>");
            addLink(doc);
            const links = doc.getIn(["navbar", "links"]) as { items: unknown[] };
            const index = links.items.length - 1;
            ["name", "icon", "link"].forEach((key, i) => setSetting(doc, ["navbar", "links", index, key], rest[i]!));
            return save(`navbar.links.${index + 1}`);
        }
        case "remove-link": {
            const n = Number(rest[0]);
            const links = doc.getIn(["navbar", "links"]) as { items: unknown[] } | undefined;
            if (!Number.isInteger(n) || n < 1 || !links || n > links.items.length) {
                throw new UsageError(`Name the link by its number, 1 to ${links?.items.length ?? 0}`);
            }
            removeLink(doc, n - 1);
            return save(`navbar.links.${n}`);
        }
        default:
            throw new UsageError(`Unknown config command "${command}"`);
    }
}

// The checks of "clay build", without building: settings, translations,
// versions and links. Missing git history only limits dates; it is not a problem.
export function runCheck(root: string): CommandResult {
    try {
        const site = loadSite(root, {gitDates: false});
        const broken = brokenLinks(site.pages, Object.fromEntries(site.versions.map(v => [v.name, v.docsDir])), site.redirects);
        const problems = [...site.warnings, ...broken.map(link => `Broken link in ${link}`)];
        return {
            code: problems.length ? 1 : 0,
            text: problems.length ? `${problems.join("\n")}\n\n${problems.length} ${problems.length === 1 ? "problem" : "problems"}` : `No problems in ${site.pages.length} pages`,
            data: {ok: problems.length === 0, pages: site.pages.length, problems},
        };
    } catch (error) {
        return {code: 1, text: (error as Error).message, data: {ok: false, error: (error as Error).message}};
    }
}

// Where a section starts in its file: the line of each heading, by the id the
// site gives it (the same slugs as the renderer, see headingIds), and of the
// first line after the front matter. Lines count from 1.
const headingLexer = new Marked({gfm: true}, componentSyntax());

function sectionLines(text: string): { intro: number, anchors: Map<string, number>, starts: number[] } {
    const lines = text.split("\n");
    let intro = 1;
    if (lines[0]?.trim() === "---") {
        const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
        if (end > 0) intro = end + 2;
    }
    const slugger = new GithubSlugger();
    const anchors = new Map<string, number>();
    const starts: number[] = [];
    let fence = "";
    for (let i = intro - 1; i < lines.length; i++) {
        const line = lines[i]!;
        const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
        if (fence) {
            if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = "";
            continue;
        }
        if (marker) {
            fence = marker;
            continue;
        }
        const heading = /^\s{0,3}(#{1,6})\s/.exec(line);
        if (!heading) continue;
        const token = headingLexer.lexer(line.trim())[0] as Tokens.Heading | undefined;
        if (token?.type !== "heading") continue;
        anchors.set(slugger.slug(headingText(token.tokens)), i + 1);
        if (heading[1]!.length <= 3) starts.push(i + 1);
    }
    return {intro, anchors, starts};
}

const MATCHED_LINES = 5;

// The site's search over the docs of one version and language: each result is
// a section with the file and line it starts at, and the lines in it that
// match, to open and change them. Generated pages (OpenAPI) name their spec.
export function runSearch(root: string, query: string, options: CommandOptions = {}): CommandResult {
    try {
        if (!query.trim()) throw new UsageError("Name what to search for, e.g. clay search page order");
        const limit = options.limit ?? 10;
        if (!Number.isInteger(limit) || limit < 1) throw new UsageError(`--limit is a number from 1, not "${options.limit}"`);
        const edition = editionOf(root, options);
        const site = loadSite(root, {gitDates: false});
        const version = site.versions.find(v => v.name === edition.version)!;
        const pages = site.pages.filter(page => page.version === edition.version && page.language === edition.language);
        const byRoute = new Map(pages.map(page => [page.route, page]));
        const hits = searchSections(buildSearchIndex(pages), query, limit);

        const files = new Map<string, ReturnType<typeof sectionLines> & { lines: string[] }>();
        const results = hits.map(hit => {
            const page = byRoute.get(hit.link)!;
            const spec = version.apis.find(api => api.spec === page.source);
            const path = join(version.docsDir, page.source);
            const file = spec ? page.source : relative(root, path).split("\\").join("/");
            const result: Record<string, unknown> = {
                file, title: hit.pageTitle, ...(hit.heading ? {heading: hit.heading} : {}),
                url: hit.link + (hit.anchor ? `#${hit.anchor}` : ""),
                snippet: hit.snippet.map(part => part.text).join(""),
                ...(spec ? {generated: true} : {}),
            };
            if (spec || !existsSync(path) || !statSync(path).isFile()) return result;

            let read = files.get(path);
            if (!read) {
                const text = readFileSync(path, "utf8");
                read = {...sectionLines(text), lines: text.split("\n")};
                files.set(path, read);
            }
            const line = hit.anchor ? read.anchors.get(hit.anchor) ?? read.intro : read.intro;
            const end = read.starts.find(start => start > line) ?? read.lines.length + 1;
            const matched = read.lines.slice(line - 1, end - 1)
                .map((text, i) => ({line: line + i, text: text.trim()}))
                .filter(({text}) => text && highlight(text, hit.terms).some(part => part.match))
                .slice(0, MATCHED_LINES)
                .map(({line, text}) => ({line, text: text.length > 160 ? `${text.slice(0, 159)}…` : text}));
            return {...result, line, lines: matched};
        });

        const text = results.length ? results.map((result, i) => [
            `${i + 1}. ${result.heading ? `${result.title} › ${result.heading}` : result.title}`,
            `   ${result.file}${result.line ? `:${result.line}` : ""}  ${result.url}${result.generated ? "  (generated from this OpenAPI spec)" : ""}`,
            ...((result.lines as { line: number, text: string }[] | undefined)?.length
                ? (result.lines as { line: number, text: string }[]).map(({line, text}) => `   ${String(line).padStart(4)}: ${text}`)
                : [`   ${result.snippet}`]),
        ].join("\n")).join("\n\n") : `Nothing found for "${query}"`;
        return done(text, {query, edition: {version: edition.version, language: edition.language}, results});
    } catch (error) {
        const message = (error as Error).message;
        return {code: error instanceof UsageError ? 2 : 1, text: error instanceof UsageError ? `${message}\n\nRun "clay search --help" for usage.` : message,
            data: {ok: false, error: message}};
    }
}
