import GithubSlugger from "github-slugger";
import type {MarkedExtension, Token} from "marked";

// Plain text of a markdown token, e.g. "Install `foo` [here](x)" => "Install foo here".
export function plainText(token: Token): string {
    switch (token.type) {
        case "space":
        case "hr":
        case "br":
            return " ";
        case "html":
            return token.text.replace(/<[^>]*>/g, " ");
        case "list":
            return token.items.map(plainText).join(" ");
        case "table":
            return [...token.header, ...token.rows.flat()].map(cell => inlineText(cell.tokens)).join(" ");
        case "blockquote":
        case "list_item":
            return (token.tokens ?? []).map(plainText).join(" ");
        // Components (markdown-components.ts): containers and tabs are read with their title or label
        case "container":
        case "tab":
            return [token.title ?? token.label ?? "", token.text ?? "", ...(token.tokens ?? []).map(plainText)].join(" ");
        case "math":
        case "mathBlock":
        case "badge":
            return token.text;
        default:
            if ("tokens" in token && token.tokens) return inlineText(token.tokens);
            return "text" in token ? token.text : "";
    }
}

export function inlineText(tokens: Token[]): string {
    return tokens.map(plainText).join("");
}

// The text of a heading for its id: badges are labels next to it, not part of
// its name, so "## Setup :badge[New]" is #setup
export function headingText(tokens: Token[]): string {
    return inlineText(tokens.filter(token => token.type !== "badge")).trim();
}

// Adds GitHub-style ids to headings, and to sections (## and deeper) a "#"
// link to them. The search index slugs headings the same way, so result
// anchors always match the rendered page.
export function headingIds(linkLabel = "Link to this section"): MarkedExtension {
    const slugger = new GithubSlugger();
    return {
        hooks: {
            preprocess(markdown) {
                slugger.reset();
                return markdown;
            }
        },
        renderer: {
            heading({tokens, depth}) {
                const id = slugger.slug(headingText(tokens));
                const link = depth > 1 ? `<a class="heading-anchor" href="#${id}" aria-label="${linkLabel}">#</a>` : "";
                return `<h${depth} id="${id}">${link}${this.parser.parseInline(tokens)}</h${depth}>\n`;
            }
        }
    };
}
