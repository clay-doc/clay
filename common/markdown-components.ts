import type {MarkedExtension, Token, Tokens, TokenizerThis} from "marked";

// The syntax of Clay's Markdown components. The renderer (server/utils/components.ts),
// the search index and the link checks read docs with it, so all of them see
// the same headings, links and text.
//
//   ::: tabs              ::: code-group          ::: steps / cards
//   == npm                ```sh [npm]             1. ...
//   ...                   ...                     :::
//   == pnpm               ```
//   ...                   :::                     ::: details Title
//   :::                                           ...
//                                                 :::
//   ::: prompt Title (a suggested prompt for AI assistants and agents, copied as written)
//   ::: request petstore getPetById (a request to try, with starting values in YAML;
//   ::: request alone holds a request written out: "POST https://...", headers, body)
//   ::: fields     a list of "- `name` · type · **required**" with text and nested lists below
//   ::: endpoints  a list of "- `GET /path` [Title](link)"
//   ::: credentials petstore (where readers enter what an API's requests need;
//   what it holds is shown without JavaScript and to agents)
//   $inline math$   $$ block math $$   :badge[New]{tip}
//
// Containers nest; an inner one may use the same number of colons or more.

export const CONTAINERS = ["tabs", "code-group", "steps", "cards", "details", "prompt", "request", "fields", "endpoints", "credentials"] as const;
export type ContainerKind = typeof CONTAINERS[number];

// A tab of a tabs or code-group container
export type TabToken = { type: "tab", raw: string, label: string, tokens: Token[] };
export type ContainerToken = {
    type: "container", raw: string, kind: ContainerKind,
    title: string, // the text after the name, e.g. the title of details
    tokens: Token[], // tabs and code groups: TabTokens
    text?: string, // prompts and requests: their text as written, not Markdown
};
export type MathToken = { type: "math" | "mathBlock", raw: string, text: string };
export type BadgeToken = { type: "badge", raw: string, text: string, variant: string };

const OPEN = /^(:{3,})[ \t]*([\w-]+)[ \t]*([^\n]*)(?:\n|$)/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// The container's body and its full source, or undefined when it is not closed
function containerBody(src: string, colons: string, openLength: number): { body: string, raw: string } | undefined {
    const lines = src.slice(openLength).split("\n");
    let depth = 1;
    let fence: string | undefined;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        // ::: inside code blocks is text, e.g. in docs about containers
        const marker = FENCE.exec(line)?.[1];
        if (fence) {
            if (marker && marker[0] === fence[0] && marker.length >= fence.length && !line.trim().slice(marker.length)) fence = undefined;
            continue;
        }
        if (marker) {
            fence = marker;
            continue;
        }
        const open = OPEN.exec(line);
        if (open && open[1] === colons && (CONTAINERS as readonly string[]).includes(open[2]!)) depth++;
        else if (line.trimEnd() === colons && --depth === 0) {
            const body = lines.slice(0, i).join("\n");
            const raw = src.slice(0, openLength) + lines.slice(0, i + 1).join("\n") + (i + 1 < lines.length ? "\n" : "");
            return {body, raw};
        }
    }
    return undefined;
}

// Splits a tabs body at its "== Label" lines; text before the first label is dropped
function splitTabs(body: string): { label: string, text: string }[] {
    const tabs: { label: string, text: string }[] = [];
    let fence: string | undefined;
    for (const line of body.split("\n")) {
        const marker = FENCE.exec(line)?.[1];
        if (!fence && /^== +\S/.test(line)) {
            tabs.push({label: line.slice(2).trim(), text: ""});
            continue;
        }
        if (fence) {
            if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
        } else if (marker) {
            fence = marker;
        }
        if (tabs.length) tabs.at(-1)!.text += line + "\n";
    }
    return tabs;
}

// "sh [npm]" => label "npm", lang "sh"; without a label, the language names the tab
function codeLabel(token: Tokens.Code): string {
    const label = /\[([^\]]+)\]/.exec(token.lang ?? "");
    if (!label) return token.lang?.split(/\s/)[0] || "Code";
    token.lang = token.lang!.replace(label[0], "").replace(/\s+/g, " ").trim();
    return label[1]!.trim();
}

function containerTokenizer(this: TokenizerThis, src: string): ContainerToken | undefined {
    const open = OPEN.exec(src);
    if (!open || !(CONTAINERS as readonly string[]).includes(open[2]!)) return undefined;
    const found = containerBody(src, open[1]!, open[0].length);
    if (!found) return undefined;
    const kind = open[2] as ContainerKind;
    const token: ContainerToken = {type: "container", raw: found.raw, kind, title: open[3]!.trim(), tokens: []};

    if (kind === "tabs") {
        token.tokens = splitTabs(found.body).map(tab => ({type: "tab", raw: "", label: tab.label, tokens: this.lexer.blockTokens(tab.text, [])}) as TabToken as Token);
        if (!token.tokens.length) return undefined;
    } else if (kind === "prompt" || kind === "request") {
        // A prompt is text to copy as it is, like code
        token.text = found.body.replace(/^\n+|\s+$/g, "");
    } else if (kind === "code-group") {
        token.tokens = this.lexer.blockTokens(found.body, []).filter((t): t is Tokens.Code => t.type === "code")
            .map(code => ({type: "tab", raw: "", label: codeLabel(code), tokens: [code]}) as TabToken as Token);
        if (!token.tokens.length) return undefined;
    } else {
        token.tokens = this.lexer.blockTokens(found.body, []);
    }
    return token;
}

const lineStart = (src: string, pattern: RegExp) => {
    const index = src.search(pattern);
    return index < 0 ? undefined : index;
};

export function componentSyntax(): MarkedExtension {
    return {
        extensions: [
            {
                name: "container",
                level: "block",
                start: src => lineStart(src, /^:{3,}/m),
                tokenizer: containerTokenizer as never,
            },
            {
                name: "mathBlock",
                level: "block",
                start: src => lineStart(src, /^\$\$/m),
                tokenizer(src) {
                    const match = /^\$\$[ \t]*\n([\s\S]+?)\n[ \t]*\$\$[ \t]*(?:\n|$)/.exec(src)
                        ?? /^\$\$([^\n]+?)\$\$[ \t]*(?:\n|$)/.exec(src);
                    if (match) return {type: "mathBlock", raw: match[0], text: match[1]!.trim()} satisfies MathToken;
                },
            },
            {
                name: "math",
                level: "inline",
                start: src => {
                    const index = src.indexOf("$");
                    return index < 0 ? undefined : index;
                },
                tokenizer(src) {
                    // Not "$5 and $10": no space inside the dollars, no digit after the closing one
                    const match = /^\$(?![\s$])((?:\\[\s\S]|[^\\$\n])+?)(?<!\s)\$(?![\w$])/.exec(src);
                    if (match) return {type: "math", raw: match[0], text: match[1]!} satisfies MathToken;
                },
            },
            {
                name: "badge",
                level: "inline",
                start: src => {
                    const index = src.indexOf(":badge[");
                    return index < 0 ? undefined : index;
                },
                tokenizer(src) {
                    const match = /^:badge\[([^\]\n]+)\](?:\{([\w-]+)\})?/.exec(src);
                    if (match) return {type: "badge", raw: match[0], text: match[1]!.trim(), variant: match[2] ?? ""} satisfies BadgeToken;
                },
            },
        ],
    };
}
