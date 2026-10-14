import {getCurrentDocItemFromRoute, type DocItem} from "./nav";
import {normalizePath} from "./route-path";

// A version of the docs. The current one (docs/) has the name "" and no URL
// prefix; older ones (versions/<name>/docs) live under "/<name>".
export type VersionInfo = {
    name: string;
    label: string;
};

export const versionPrefix = (version: VersionInfo) => version.name ? `/${version.name}` : "";

// The version a route belongs to: an older version by its first path segment, the current one otherwise
export function versionOf(path: string, versions: VersionInfo[]): VersionInfo {
    const first = normalizePath(path).split("/")[1] ?? "";
    return versions.find(version => version.name && version.name === first) ?? versions.find(version => !version.name)!;
}

// The route inside its version, e.g. "/1.x/guides" becomes "/guides"
export function stripVersion(path: string, version: VersionInfo): string {
    const prefix = versionPrefix(version);
    const normalized = normalizePath(path);
    return prefix && (normalized === prefix || normalized.startsWith(prefix + "/")) ? normalizePath(normalized.slice(prefix.length)) : normalized;
}

// Where the version switcher leads: the same page in the other version, or
// that version's start page when the page does not exist there
export function switchVersion(path: string, from: VersionInfo, to: VersionInfo, navs: Record<string, DocItem>): string {
    const inner = stripVersion(path, from);
    const target = normalizePath(versionPrefix(to) + inner);
    const nav = navs[to.name];
    if (inner === "/" || !nav) return normalizePath(versionPrefix(to) || "/");
    return getCurrentDocItemFromRoute(inner, nav)?.displayLink === target ? target : normalizePath(versionPrefix(to) || "/");
}
