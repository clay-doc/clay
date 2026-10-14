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
            return token.tokens.map(plainText).join(" ");
        default:
            if ("tokens" in token && token.tokens) return inlineText(token.tokens);
            return "text" in token ? token.text : "";
    }
}

export function inlineText(tokens: Token[]): string {
    return tokens.map(plainText).join("");
}

// Adds GitHub-style ids to headings. The search index slugs headings the
// same way, so result anchors always match the rendered page.
export function headingIds(): MarkedExtension {
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
                const id = slugger.slug(inlineText(tokens));
                return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
            }
        }
    };
}
