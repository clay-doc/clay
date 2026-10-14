export type FrontMatter = {
    title?: string;
    icon?: string;
    description?: string;
    order?: number; // position in the navigation; unset pages follow ordered ones
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
        }
    }
    return result;
}
