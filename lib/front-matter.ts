import {stringify} from "yaml";

export type FrontMatter = {
    title?: string;
    icon?: string;
    description?: string;
    order?: number; // position in the navigation; unset pages follow ordered ones
    list?: boolean; // index.md: list the folder's pages below the text
    hero?: boolean; // index.md: show title, icon and description as a large centered header
    redirects?: string[]; // old addresses of the page, which lead to it, e.g. "/guides/install"
};

// Front matter only counts when the very first line is "---", so a horizontal
// rule further down a document is not mistaken for it.
export function splitFrontMatter(content: string): { frontMatter: string, body: string, found: boolean } {
    const text = content.replace(/^﻿/, "");
    const lines = text.split(/(?<=\n)/);
    if (lines[0]?.trim() !== "---") return {frontMatter: "", body: text, found: false};

    for (let i = 1; i < lines.length; i++) {
        if (lines[i]!.trim() === "---") {
            return {frontMatter: lines.slice(1, i).join(""), body: lines.slice(i + 1).join(""), found: true};
        }
    }
    return {frontMatter: "", body: text, found: false};
}

export function stripFrontMatter(content: string): string {
    return splitFrontMatter(content).body;
}

// Sets (or with null removes) front matter keys, leaving every other line as it
// was; front matter is added at the top when a document has none. Lists are
// written on one line: redirects: ["/a", "/b"].
export function setFrontMatter(content: string, updates: Record<string, string | number | boolean | string[] | null>): string {
    const {found} = splitFrontMatter(content);
    const bom = content.startsWith("﻿") ? "﻿" : "";
    const body = content.slice(bom.length).split(/(?<=\n)/);
    const lines = found ? body : ["---\n", "---\n", ...body];
    const keyOf = (line: string) => line.match(/^([\w-]+)\s*:/)?.[1];

    for (const [key, value] of Object.entries(updates)) {
        const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
        const index = lines.findIndex((line, i) => i > 0 && i < end && keyOf(line) === key);
        const newline = (lines[index] ?? lines[0]!).endsWith("\r\n") ? "\r\n" : "\n";
        const text = Array.isArray(value) ? JSON.stringify(value).replace(/","/g, '", "') : stringify(value, {lineWidth: 0}).trimEnd();
        const line = value === null ? [] : [`${key}: ${text}${newline}`];
        // A list written as "- item" lines below its key goes with it
        let length = 1;
        while (index >= 0 && index + length < end && /^\s*-\s/.test(lines[index + length]!)) length++;
        if (index >= 0) lines.splice(index, length, ...line);
        else lines.splice(end, 0, ...line);
    }

    // Front matter added here but left empty is dropped again
    if (!found && lines[1]?.trim() === "---") lines.splice(0, 2);
    return bom + lines.join("");
}

const unquote = (value: string) =>
    value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0] ? value.slice(1, -1) : value;

// A list, on one line ("[a, b]") or as "- item" lines below its key
function parseList(value: string, below: string[]): string[] {
    const items = value
        ? value.replace(/^\[|\]$/g, "").split(",")
        : below.map(line => line.replace(/^\s*-\s/, ""));
    return items.map(item => unquote(item.trim())).filter(Boolean);
}

// Parses "key: value" lines leniently (values may contain colons, quotes are optional)
export function parseFrontMatter(content: string): FrontMatter {
    const {frontMatter, found} = splitFrontMatter(content);
    const result: FrontMatter = {};
    if (!found) return result;

    const lines = frontMatter.split("\n");
    for (const [i, line] of lines.entries()) {
        const separator = line.indexOf(":");
        if (separator < 0) continue;
        const key = line.slice(0, separator).trim();
        const value = unquote(line.slice(separator + 1).trim());

        switch (key) {
            case "title":
            case "icon":
            case "description":
                result[key] = value;
                break;
            case "order":
                if (/^-?\d+$/.test(value)) result.order = Number(value);
                break;
            case "redirects": {
                const below: string[] = [];
                for (let j = i + 1; j < lines.length && /^\s*-\s/.test(lines[j]!); j++) below.push(lines[j]!);
                result.redirects = parseList(value, below);
                break;
            }
            case "list":
            case "hero": {
                if (value !== "true" && value !== "false") break;
                result[key] = value === "true";
                break;
            }
        }
    }
    return result;
}
