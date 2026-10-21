import type {MarkedExtension, Token, Tokens} from "marked";
import type {ContainerToken} from "./markdown-components";

// Typography of the text of pages: arrows, dashes, ellipses, symbols and the
// quotes of the page's language, like a typesetter would set them. Only text
// changes: code, links that show their address, HTML, math, prompts and request
// cells stay as written, and so do heading ids, which come from the text as
// written. A backslash keeps a character as it is: \-> stays "->".

const RULES: [RegExp, string][] = [
    [/\(c\)/gi, "©"],
    [/\(r\)/gi, "®"],
    [/\(tm\)/gi, "™"],
    [/(?<![+-])\+-(?![+-])/g, "±"],
    [/(?<![<=>!-])<=>(?![=>])/g, "⇔"],
    [/(?<![<-])<->(?![->])/g, "↔"],
    [/(?<![-=<>])->(?![->])/g, "→"],
    [/(?<![<-])<-(?![-<>])/g, "←"],
    [/(?<![=<>!])=>(?![=>])/g, "⇒"],
    [/(?<![<=>])<=(?![=<>])/g, "≤"],
    [/(?<![<=>])>=(?![=>])/g, "≥"],
    [/(?<![!=])!=(?!=)/g, "≠"],
    [/(?<!-)---(?!-)/g, "—"],
    // "1--2" and "a -- b", but not "--strict"
    [/(?<=[^-\s])--(?=[^-\s])/g, "–"],
    [/(?<=\s)--(?=\s)/g, "–"],
    [/(?<!\.)\.\.\.(?!\.)/g, "…"],
];

// Where a quote opens: at the start, or after a space or an opening bracket, dash or quote
const OPENS = /[\s([{–—«“„‘‚"']/;

// The text of one text token; before is the character in front of it, maybe in
// another token, e.g. "**bold**" before a closing quote
export function typeset(text: string, quotes: string, before = " "): string {
    // Rules see the character before, so a dash or quote at the start of the text is judged right
    let set = before + text;
    for (const [pattern, replacement] of RULES) set = set.replace(pattern, replacement);
    // A rule that took the character before as well: the text alone, without it
    if (set[0] !== before) {
        set = " " + text;
        for (const [pattern, replacement] of RULES) set = set.replace(pattern, replacement);
    }
    const [open = "“", close = "”", openSingle = "‘", closeSingle = "’"] = [...quotes];
    let out = "";
    const chars = [...set];
    for (let i = 1; i < chars.length; i++) {
        const char = chars[i]!;
        const previous = chars[i - 1]!;
        const next = chars[i + 1] ?? " ";
        if (char === '"') out += OPENS.test(previous) && !/\s/.test(next) ? open : close;
        else if (char === "'") {
            // Between letters it is an apostrophe: it's
            out += OPENS.test(previous) && !/\s/.test(next) ? openSingle : closeSingle;
        } else out += char;
    }
    return out;
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// The character before a text token, kept until it is rendered: other extensions,
// like the one for alerts, may still change the token's text
type Typeset = Tokens.Text & { before?: string };
type Context = { before: string };

// The last character a token shows, for the token after it
const lastOf = (text: string) => [...text].at(-1) ?? " ";

function inline(tokens: Token[] | undefined, context: Context, quotes: string) {
    for (const token of tokens ?? []) {
        switch (token.type) {
            case "text":
                if ("tokens" in token && token.tokens?.length) inline(token.tokens, context, quotes);
                else if (!(token as Tokens.Text).escaped) {
                    (token as Typeset).before = context.before;
                    context.before = lastOf(token.text);
                }
                break;
            case "strong":
            case "em":
            case "del":
                inline(token.tokens, context, quotes);
                break;
            case "link":
                // A link that shows its address keeps it as written
                if ((token as Tokens.Link & { autolink?: boolean }).autolink) context.before = "x";
                else inline(token.tokens, context, quotes);
                break;
            case "br":
                context.before = " ";
                break;
            default:
                // Code, escapes, HTML, math and badges are shown as written
                context.before = "text" in token && typeof token.text === "string" ? lastOf(token.text) : "x";
        }
    }
}

function blocks(tokens: Token[] | undefined, quotes: string) {
    for (const token of tokens ?? []) {
        switch (token.type) {
            case "paragraph":
            case "heading":
            case "text":
                inline(token.tokens, {before: " "}, quotes);
                break;
            case "list":
                for (const item of (token as Tokens.List).items) blocks(item.tokens, quotes);
                break;
            case "table":
                for (const cell of [...(token as Tokens.Table).header, ...(token as Tokens.Table).rows.flat()]) inline(cell.tokens, {before: " "}, quotes);
                break;
            case "blockquote":
                blocks(token.tokens, quotes);
                break;
            case "container": {
                const container = token as unknown as ContainerToken;
                // Prompts are copied as written; request cells are requests
                if (container.kind === "prompt" || container.kind === "request") break;
                // Tabs hold their content in tabs of their own
                for (const child of container.tokens) blocks(child.type === "tab" ? (child as unknown as { tokens: Token[] }).tokens : [child], quotes);
                break;
            }
        }
    }
}

// quotes: the opening and closing quotes of the language, double then single, e.g. "“”‘’"
export function typography(quotes: string): MarkedExtension {
    return {
        hooks: {
            processAllTokens(tokens) {
                blocks(tokens, quotes);
                return tokens;
            },
        },
        renderer: {
            text(token) {
                const before = (token as Typeset).before;
                return token.type === "text" && before !== undefined ? escapeHtml(typeset(token.text, quotes, before)) : false;
            },
        },
    };
}
