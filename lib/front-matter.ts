import {stringify} from "yaml";

export type FrontMatter = {
    title?: string;
    icon?: string;
    description?: string;
    order?: number; // position in the navigation; unset pages follow ordered ones
    list?: boolean; // index.md: list the folder's pages below the text ("cards" in Clay 3.0)
    hero?: boolean; // index.md: show title, icon and description as a large centered header
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
// was; front matter is added at the top when a document has none.
export function setFrontMatter(content: string, updates: Record<string, string | number | boolean | null>): string {
    const {found} = splitFrontMatter(content);
    const bom = content.startsWith("﻿") ? "﻿" : "";
    const body = content.slice(bom.length).split(/(?<=\n)/);
    const lines = found ? body : ["---\n", "---\n", ...body];
    const keyOf = (line: string) => line.match(/^([\w-]+)\s*:/)?.[1];

    for (const [key, value] of Object.entries(updates)) {
        const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
        const index = lines.findIndex((line, i) => i > 0 && i < end && keyOf(line) === key);
        const newline = (lines[index] ?? lines[0]!).endsWith("\r\n") ? "\r\n" : "\n";
        const line = value === null ? [] : [`${key}: ${stringify(value, {lineWidth: 0}).trimEnd()}${newline}`];
        if (index >= 0) lines.splice(index, 1, ...line);
        else lines.splice(end, 0, ...line);
    }

    // Front matter added here but left empty is dropped again
    if (!found && lines[1]?.trim() === "---") lines.splice(0, 2);
    return bom + lines.join("");
}

const unquote = (value: string) =>
    value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0] ? value.slice(1, -1) : value;

// Parses "key: value" lines leniently (values may contain colons, quotes are optional)
export function parseFrontMatter(content: string): FrontMatter {
    const {frontMatter, found} = splitFrontMatter(content);
    const result: FrontMatter = {};
    if (!found) return result;

    for (const line of frontMatter.split("\n")) {
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
            case "list":
            case "cards": // the name in Clay 3.0
            case "hero": {
                if (value !== "true" && value !== "false") break;
                result[key === "cards" ? "list" : key] = value === "true";
                break;
            }
        }
    }
    return result;
}
