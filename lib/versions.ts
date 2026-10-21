import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync} from "node:fs";
import {basename, dirname, join, relative, resolve, sep} from "node:path";
import {createExpander, INCLUDE, TARGET, VARIABLE, type Variables} from "./expand";
import {isMarkdown, isVersioned, LATEST, loadConfig, localize, RESERVED_NAMES, siteLanguages, translationOf, VERSION_NAME} from "./site";
import {getSetting, loadSettings, saveSettings, setSetting} from "./editor";
import {dump} from "js-yaml";
import {apiRoute, loadApis, VERSION_APIS, VERSION_APIS_FILE} from "./openapi";
import type {ApiConfiguration} from "../common/configuration";

// "clay version": saves the latest docs as an older version. Without versions,
// docs/ holds the pages; the first version moves them into docs/latest/, next to
// which each version gets its folder (site.ts, versionDir). docs/latest/ is one
// level deeper than docs/ was, so paths that lead out of docs/ get one more "../".

// A path in the docs that leads out of docs/, before and after the move
export type FixedPath = { file: string, from: string, to: string };

// What moving docs/ into docs/latest/ does, worked out before anything changes
export type LayoutPlan = {
    files: number; // files moved into docs/latest/
    archived: string[]; // Clay 3's docs-archive/<name>/, moved to docs/<name>/
    fixed: FixedPath[]; // paths in the docs that get one more "../"
    settings: { key: string, from: string, to: string }[]; // clay.yaml values that point into docs/
    unchanged: string[]; // mentions of docs/ that Clay cannot change: generate commands, .gitignore, package.json
    contents: Map<string, string>; // docs files with fixed paths, by their path in docs/
};

const toPosix = (path: string) => path.split(sep).join("/");
const isHidden = (name: string) => name.startsWith(".");
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
// Destinations of links and images, reference definitions and file attributes in HTML
const LINK = /(\]\(\s*)(<[^>\n]*>|[^\s)]+)/g;
const REFERENCE = /^( {0,3}\[[^\]\n]+\]:\s*)(<[^>\n]*>|\S+)/;
const HTML_REF = /(\b(?:src|href|poster)\s*=\s*["'])([^"']*)/gi;

function countFiles(dir: string): number {
    return readdirSync(dir, {withFileTypes: true})
        .reduce((sum, entry) => sum + (entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1), 0);
}

function markdownFiles(dir: string, path = ""): string[] {
    return readdirSync(join(dir, path), {withFileTypes: true}).flatMap(entry => {
        const rel = path ? `${path}/${entry.name}` : entry.name;
        if (entry.isDirectory()) return isHidden(entry.name) ? [] : markdownFiles(dir, rel);
        return isMarkdown(entry.name) ? [rel] : [];
    });
}

// The path from the doc at newFile to what path led to from oldFile, if that is
// outside docsDir; paths inside docs/ move along and stay as they are
function movedPath(path: string, oldFile: string, newFile: string, docsDir: string): string | undefined {
    if (!path || /^(\/|#|\?|[a-z][a-z\d+.-]*:)/i.test(path)) return undefined;
    const target = resolve(dirname(oldFile), path);
    if (!relative(docsDir, target).startsWith("..")) return undefined;
    return toPosix(relative(dirname(newFile), target));
}

// A link destination with its #section or ?query, and <angle brackets>
function fixDestination(destination: string, fix: (path: string) => string | undefined): string {
    const bracketed = destination.startsWith("<") && destination.endsWith(">");
    const inner = bracketed ? destination.slice(1, -1) : destination;
    const cut = inner.search(/[?#]/);
    const path = cut < 0 ? inner : inner.slice(0, cut);
    const fixed = fix(path);
    if (fixed === undefined) return destination;
    const result = fixed + (cut < 0 ? "" : inner.slice(cut));
    return bracketed ? `<${result}>` : result;
}

// Gives the paths of a docs file that lead out of docs/ one more "../": includes
// anywhere (they are filled in inside code blocks too), links, images and HTML
// files outside code, where they would be examples
export function fixPaths(markdown: string, oldFile: string, newFile: string, docsDir: string, file: string, fixed: FixedPath[]): string {
    // suffix: what follows the path of an include, shown with it
    const fix = (path: string, suffix = "") => {
        const to = movedPath(path, oldFile, newFile, docsDir);
        if (to !== undefined) fixed.push({file, from: path + suffix, to: to + suffix});
        return to;
    };
    const withIncludes = markdown.replace(INCLUDE, (line, indent: string, escaped: string, target: string) => {
        if (escaped) return line;
        const [, path, from, to, region] = TARGET.exec(target)!;
        const suffix = region ? `#${region}` : from !== undefined || to !== undefined ? `{${from},${to}}` : "";
        const moved = fix(path!, suffix);
        return moved === undefined ? line : line.replace(target, moved + suffix);
    });

    let fence: string | undefined;
    return withIncludes.split("\n").map(line => {
        const marker = FENCE.exec(line)?.[1];
        if (fence) {
            if (marker && marker[0] === fence[0] && marker.length >= fence.length && !line.trim().slice(marker.length)) fence = undefined;
            return line;
        }
        if (marker) {
            fence = marker;
            return line;
        }
        // Inline code stays as written
        return line.split(/(`+[^`]*`+)/).map(part => part.startsWith("`") ? part : part
            .replace(LINK, (_, start: string, destination: string) => start + fixDestination(destination, fix))
            .replace(REFERENCE, (_, start: string, destination: string) => start + fixDestination(destination, fix))
            .replace(HTML_REF, (_, start: string, value: string) => start + fixDestination(value, fix))).join("");
    }).join("\n");
}

// What moving docs/ into docs/latest/ would do; undefined when the docs have versions already
export function planLayout(root: string): LayoutPlan | undefined {
    if (isVersioned(root)) return undefined;
    const docsDir = join(root, "docs");
    if (!existsSync(docsDir)) throw new Error(`No docs/ directory found in ${root}`);

    const fixed: FixedPath[] = [];
    const contents = new Map<string, string>();
    for (const file of markdownFiles(docsDir)) {
        const text = readFileSync(join(docsDir, file), "utf8");
        const updated = fixPaths(text, join(docsDir, file), join(docsDir, LATEST, file), docsDir, `docs/${LATEST}/${file}`, fixed);
        if (updated !== text) contents.set(file, updated);
    }

    const archiveDir = join(root, "docs-archive");
    const archived = existsSync(archiveDir)
        ? readdirSync(archiveDir, {withFileTypes: true}).filter(entry => entry.isDirectory() && !isHidden(entry.name)).map(entry => entry.name)
        : [];
    for (const name of archived) {
        if (!VERSION_NAME.test(name) || RESERVED_NAMES.has(name)) throw new Error(`docs-archive/${name} can't be used in URLs; rename it first`);
    }

    // Files in docs/ named in clay.yaml move too
    const settings: LayoutPlan["settings"] = [];
    const {doc} = loadSettings(root);
    for (const key of [["favicon"], ["navbar", "logo"]]) {
        const value = getSetting(doc, key);
        const match = /^(\.\/)?docs\/(.+)$/.exec(value);
        if (match) settings.push({key: key.join("."), from: value, to: `docs/${LATEST}/${match[2]}`});
    }

    // Commands and lists that name paths in docs/, which Clay leaves to the author
    const unchanged: string[] = [];
    const mentions = (where: string, text: string) => {
        if (/(^|[\s"'=/])docs\/(?!latest\/)/.test(text)) unchanged.push(`${where}: ${text.trim()}`);
    };
    const generate = doc.get("generate");
    if (generate && typeof generate === "object" && "items" in generate) {
        for (const item of (generate as { items: { value?: unknown }[] }).items) mentions("clay.yaml generate", String(item.value ?? ""));
    }
    if (existsSync(join(root, ".gitignore"))) {
        for (const line of readFileSync(join(root, ".gitignore"), "utf8").split("\n")) if (!line.startsWith("#")) mentions(".gitignore", line);
    }
    if (existsSync(join(root, "package.json"))) {
        const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {}) as Record<string, string>;
        for (const [name, script] of Object.entries(scripts)) mentions(`package.json "${name}"`, script);
    }

    return {files: countFiles(docsDir), archived, fixed, settings, unchanged, contents};
}

// Moves docs/ into docs/latest/ and Clay 3's docs-archive/<name>/ to docs/<name>/,
// with the paths of the plan fixed
export function applyLayout(root: string, plan: LayoutPlan) {
    const docsDir = join(root, "docs");
    const latest = join(docsDir, LATEST);
    const entries = readdirSync(docsDir);
    mkdirSync(latest);
    for (const entry of entries) renameSync(join(docsDir, entry), join(latest, entry));
    for (const [file, content] of plan.contents) writeFileSync(join(latest, file), content);

    const archiveDir = join(root, "docs-archive");
    for (const name of plan.archived) renameSync(join(archiveDir, name), join(docsDir, name));
    // docs-archive/ goes once nothing but hidden files (.DS_Store) is left in it
    if (existsSync(archiveDir) && readdirSync(archiveDir).every(isHidden)) rmSync(archiveDir, {recursive: true});

    if (plan.settings.length) {
        const settings = loadSettings(root);
        for (const {key, to} of plan.settings) setSetting(settings.doc, key.split("."), to);
        saveSettings(root, settings);
    }
}

// Checks a name for a new version before anything moves
export function checkVersionName(root: string, name: string) {
    if (!name) throw new Error(`Name the version, e.g. "clay version 1.x"`);
    if (!VERSION_NAME.test(name) || RESERVED_NAMES.has(name)) {
        throw new Error(`"${name}" can't be used in URLs; use letters, digits, ".", "-" and "_"`);
    }
    if (existsSync(join(root, "docs", name)) && isVersioned(root)) throw new Error(`docs/${name} already exists`);
    if (existsSync(join(root, "docs-archive", name))) throw new Error(`docs-archive/${name} already exists`);
}

// What saving a version filled in, so the copy keeps today's text, and the APIs it keeps
export type Frozen = { variables: number, includes: number, apis: number, warnings: string[] };

// Fills in the variables of a docs file of a saved version, and the includes of
// files outside the version's folder (versionDir), like config/ or docs/_snippets/:
// the latest docs go on changing them, a saved version keeps what they said.
// Escaped variables and includes stay as written, so do includes within the version.
export function freezeFile(text: string, file: string, versionDir: string, root: string, variables: Variables,
                           frozen: Frozen): string {
    const expander = createExpander(root, frozen.warnings);
    const included = text.replace(INCLUDE, (line, _indent: string, escaped: string, target: string) => {
        if (escaped) return line;
        const path = TARGET.exec(target)![1]!;
        if (!relative(versionDir, resolve(dirname(file), path)).startsWith("..")) return line;
        frozen.includes++;
        // The included text with its own includes, without variables yet
        return expander.expand(line, file, {});
    });
    return included.replace(VARIABLE, (match, escaped: string, key: string) => {
        if (escaped || !(key in variables)) return match;
        frozen.variables++;
        return String(variables[key]);
    });
}

// Copies docs/latest/ to docs/<name>/, with variables and outside includes filled
// in (freezeFile); the docs must have versions (applyLayout)
export function saveVersion(root: string, name: string): { dir: string, files: number, frozen: Frozen } {
    checkVersionName(root, name);
    if (!isVersioned(root)) throw new Error(`The docs have no versions yet; run "clay version ${name}"`);
    const target = join(root, "docs", name);
    cpSync(join(root, "docs", LATEST), target, {recursive: true, filter: source => !basename(source).startsWith(".")});

    const {config} = loadConfig(root, {});
    const codes = siteLanguages(config).languages.map(language => language.code);
    const frozen: Frozen = {variables: 0, includes: 0, apis: 0, warnings: []};
    for (const file of markdownFiles(target)) {
        const language = translationOf(basename(file), codes.slice(1)) ?? codes[0]!;
        const variables = localize(config, language, codes).variables ?? {};
        const path = join(target, file);
        const text = readFileSync(path, "utf8");
        const updated = freezeFile(text, path, target, root, variables, frozen);
        if (updated !== text) writeFileSync(path, updated);
    }
    frozen.apis = freezeApis(root, target, config.openapi, codes);
    return {dir: `docs/${name}`, files: countFiles(target), frozen};
}

// The APIs of the latest docs, kept by the version: copies of their documents,
// and the files these refer to, in _openapi/ laid out like the project, with
// their settings from clay.yaml in _openapi/apis.yaml (site.ts reads them)
function freezeApis(root: string, target: string, entries: ApiConfiguration[] | undefined, codes: string[]): number {
    if (!entries?.length) return 0;
    const {apis} = loadApis(root, localize(entries, codes[0]!, codes));
    if (!apis.length) return 0;
    const dir = join(target, VERSION_APIS);
    for (const file of apis.flatMap(api => api.files)) {
        mkdirSync(dirname(join(dir, file)), {recursive: true});
        cpSync(join(root, file), join(dir, file));
    }
    const kept = entries.filter(entry => entry && typeof entry.spec === "string" && apis.some(api => api.route === apiRoute(entry)));
    writeFileSync(join(dir, VERSION_APIS_FILE), `# The APIs of this version, as "openapi" in clay.yaml said when it was saved,\n`
        + `# with copies of their documents next to this file\n${dump(kept, {lineWidth: -1})}`);
    return apis.length;
}

// What "clay version" is about to do, for the author to confirm
export function describePlan(plan: LayoutPlan, name: string | undefined): string {
    const rows = [
        [`docs/${LATEST}/`, "at /", `the latest docs: docs/ moves here (${plan.files} files)`],
        ...plan.archived.map(version => [`docs/${version}/`, `at /${version}`, `from docs-archive/${version}/`]),
        ...(name ? [[`docs/${name}/`, `at /${name}`, `a copy of docs/${LATEST}/`]] : []),
    ];
    const width = (column: number) => Math.max(...rows.map(row => row[column]!.length)) + 2;
    const lines = [
        "Clay keeps each version of the docs in a folder of its own inside docs/:",
        "",
        ...rows.map(([folder, address, what]) => `  ${folder!.padEnd(width(0))}${address!.padEnd(width(1))}${what}`),
        "",
        "Every version sits at the same depth, so paths that lead out of docs/ work in each copy.",
    ];
    if (plan.fixed.length || plan.settings.length) {
        lines.push("", `docs/${LATEST}/ is one level deeper than docs/, so Clay changes these paths:`);
        for (const {file, from, to} of plan.fixed) lines.push(`  ${file}: ${from} → ${to}`);
        for (const {key, from, to} of plan.settings) lines.push(`  clay.yaml ${key}: ${from} → ${to}`);
    }
    if (plan.unchanged.length) {
        lines.push("", `These name paths in docs/, which Clay does not change; point them into docs/${LATEST}/ if they mean the latest docs:`);
        for (const line of plan.unchanged) lines.push(`  ${line}`);
    }
    lines.push("", "Git keeps the history of the moved files. Commit the move on its own, so it is easy to review.");
    return lines.join("\n");
}
