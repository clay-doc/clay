import {getCurrentDocItemFromRoute, type DocItem} from "./nav";
import {normalizePath} from "./route-path";

// The docs come in editions: a version (the current docs/ has the name "", older
// ones live in versions/<name>/) in a language. The current version and the
// default language have no URL prefix; others add theirs: /1.x, /de, /1.x/de.
export type VersionInfo = { name: string, label: string };
export type LanguageInfo = { code: string, label: string };
export type Edition = { version: VersionInfo, language: LanguageInfo, prefix: string };

export function editionPrefix(version: string, language: string, defaultLanguage: string): string {
    return (version ? `/${version}` : "") + (language && language !== defaultLanguage ? `/${language}` : "");
}

// The edition a route belongs to; versions[0] is the current one, languages[0] the default
export function editionOf(path: string, versions: VersionInfo[], languages: LanguageInfo[]): Edition {
    const segments = normalizePath(path).split("/").slice(1);
    const version = versions.find(v => v.name && v.name === segments[0]);
    const language = languages.slice(1).find(l => l.code === segments[version ? 1 : 0]);
    const chosen = {version: version ?? versions[0]!, language: language ?? languages[0]!};
    return {...chosen, prefix: editionPrefix(chosen.version.name, chosen.language.code, languages[0]!.code)};
}

// The route inside its edition, e.g. "/1.x/de/guides" becomes "/guides"
export function stripPrefix(path: string, prefix: string): string {
    const normalized = normalizePath(path);
    return prefix && (normalized === prefix || normalized.startsWith(prefix + "/")) ? normalizePath(normalized.slice(prefix.length)) : normalized;
}

// The navigation entry of the same page in another edition, if it has the page
export function samePage(path: string, from: string, to: string, navs: Record<string, DocItem>): DocItem | undefined {
    const inner = stripPrefix(path, from);
    const nav = navs[to];
    if (inner === "/" || !nav) return undefined;
    const item = getCurrentDocItemFromRoute(inner, nav);
    return item?.displayLink === normalizePath(to + inner) ? item : undefined;
}

// Where a version or language switch leads: the same page in the other
// edition, or that edition's start page
export function switchEdition(path: string, from: string, to: string, navs: Record<string, DocItem>): string {
    return samePage(path, from, to, navs)?.displayLink ?? normalizePath(to || "/");
}
