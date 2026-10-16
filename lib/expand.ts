import {existsSync, readFileSync, statSync} from "node:fs";
import {dirname, isAbsolute, relative, resolve} from "node:path";
import {stripFrontMatter} from "./front-matter";

// Snippets and variables, expanded when the docs are read, so pages, search,
// link checks and the Markdown for agents all see the finished text:
//
//   <!--@include: _snippets/install.md-->        a file, without its front matter
//   <!--@include: ../src/example.ts{3,10}-->     lines 3 to 10 ({3,} to the end)
//   <!--@include: ../src/example.ts#setup-->     between "#region setup" and "#endregion"
//   {{version}}                                  "variables" in clay.yaml
//
// A backslash keeps them as written: \<!--@include: x--> and \{{version}}.

export const INCLUDE = /^([ \t]*)(\\?)<!--\s*@include:\s*(.+?)\s*-->[ \t]*$/gm;
export const TARGET = /^(.+?)(?:\{(\d*),(\d*)\}|#([\w.-]+))?$/;
export const VARIABLE = /(\\?)\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g;
const REGION_MARK = /#(?:end)?region\b/;

export type Variables = Record<string, string | number | boolean>;

export type Expander = {
    // The text of a docs file with its snippets and variables filled in
    expand(markdown: string, file: string, variables: Variables): string;
    // Files that were included, relative to the project, for reloads during development
    included: Set<string>;
};

// warnings receives problems, like a file that does not exist; root is the
// project, which included files may not leave
export function createExpander(root: string, warnings: string[]): Expander {
    const included = new Set<string>();
    const name = (file: string) => relative(root, file);

    function include(markdown: string, file: string, stack: string[]): string {
        return markdown.replace(INCLUDE, (line, indent: string, escaped: string, target: string) => {
            if (escaped) return line.replace("\\<!--", "<!--");
            const [, path, from, to, region] = TARGET.exec(target)!;
            const source = resolve(dirname(file), path!);
            const problem = (reason: string) => {
                warnings.push(`${name(file)}: includes "${target}", ${reason}; it is left out`);
                return "";
            };
            const inside = relative(root, source);
            if (inside.startsWith("..") || isAbsolute(inside)) return problem("which is outside the project");
            if (!existsSync(source) || !statSync(source).isFile()) return problem("which does not exist");
            if (stack.includes(source)) return problem("which leads back to this file");
            included.add(inside);

            const text = readFileSync(source, "utf8");
            let lines: string[];
            if (region) {
                const all = text.split("\n");
                const start = all.findIndex(l => new RegExp(`#region\\s+${region.replace(/[.-]/g, "\\$&")}(?![\\w.-])`).test(l));
                const end = all.findIndex((l, i) => i > start && /#endregion\b/.test(l));
                if (start < 0) return problem(`which has no "#region ${region}"`);
                lines = all.slice(start + 1, end < 0 ? undefined : end);
            } else if (from !== undefined) {
                lines = text.split("\n").slice(from ? Number(from) - 1 : 0, to ? Number(to) : undefined);
            } else {
                lines = stripFrontMatter(text).split("\n");
            }
            lines = lines.filter(l => !REGION_MARK.test(l));
            while (lines.length && !lines.at(-1)!.trim()) lines.pop();
            const content = include(lines.join("\n"), source, [...stack, source]);
            return content.split("\n").map(l => l ? indent + l : l).join("\n");
        });
    }

    return {
        included,
        expand(markdown, file, variables) {
            const text = include(markdown, file, [file]);
            return text.replace(VARIABLE, (match, escaped: string, key: string) =>
                !(key in variables) ? match : escaped ? match.slice(1) : String(variables[key]));
        },
    };
}
