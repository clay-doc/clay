import {Marked, type Token} from "marked";
import {createHighlighter, type ShikiTransformer} from "shiki";
import {
    transformerMetaHighlight,
    transformerMetaWordHighlight,
    transformerNotationDiff,
    transformerNotationErrorLevel,
    transformerNotationFocus,
    transformerNotationHighlight,
    transformerNotationWordHighlight
} from "@shikijs/transformers";
import markedShiki from "marked-shiki";
import markedAlert from "marked-alert";
import {headingIds} from "../../common/markdown-text";
import {transformerCopyButton} from "./code-block";


const transformers = (): ShikiTransformer[] => [
    transformerNotationDiff({matchAlgorithm: "v3"}),
    transformerNotationHighlight({matchAlgorithm: "v3"}),
    transformerNotationWordHighlight({matchAlgorithm: "v3"}),
    transformerNotationFocus({matchAlgorithm: "v3"}),
    transformerNotationErrorLevel({matchAlgorithm: "v3"}),
    transformerMetaHighlight(),
    transformerMetaWordHighlight(),
    transformerCopyButton()
];

type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;

const isLoaded = (highlighter: Highlighter, lang: string) => highlighter.getLoadedLanguages().includes(lang);

// Shiki only highlights languages it has loaded: load the ones a doc uses.
// Unknown languages are shown as plain text.
async function loadLanguages(highlighter: Highlighter, tokens: Token[], lexer: Marked) {
    const langs = new Set<string>();
    lexer.walkTokens(tokens, token => {
        if (token.type === "code" && token.lang) langs.add(token.lang.split(/\s/)[0]!);
    });
    for (const lang of langs) {
        if (isLoaded(highlighter, lang)) continue;
        try {
            await highlighter.loadLanguage(lang as Parameters<typeof highlighter.loadLanguage>[0]);
        } catch {
            // not a language Shiki knows
        }
    }
}

function createRenderer(highlighter: Highlighter) {
    return new Marked()
    .use(headingIds())
    .use(markedAlert({
        variants: [
            {type: "caution", icon: '<i class="fa-solid fa-triangle-exclamation mr-2"></i>', title: "Caution", titleClassName: "markdown-alert-title text-error"},
            {type: "warning", icon: '<i class="fa-solid fa-triangle-exclamation mr-2"></i>', title: "Warning", titleClassName: "markdown-alert-title text-warning"},
            {type: "important", icon: '<i class="fa-solid fa-circle-exclamation mr-2"></i>', title: "Important", titleClassName: "markdown-alert-title text-error"},
            {type: "tip", icon: '<i class="fa-solid fa-lightbulb mr-2"></i>', title: "Tip", titleClassName: "markdown-alert-title text-primary"},
            {type: "note", icon: '<i class="fa-solid fa-sticky-note mr-2"></i>', title: "Note", titleClassName: "markdown-alert-title text-base-content"},
            {type: "danger", icon: '<i class="fa-solid fa-skull-crossbones mr-2"></i>', title: "Danger", titleClassName: "markdown-alert-title text-error"}
        ]
    }))
    .use(markedShiki({
        highlight(code, lang, props) {
            return highlighter.codeToHtml(code, {
                lang: lang && isLoaded(highlighter, lang) ? lang : "text",
                // Both themes as CSS variables; tailwind.css picks one per site theme
                themes: {light: "light-plus", dark: "dark-plus"},
                defaultColor: false,
                meta: {__raw: props.join(" ")},
                transformers: transformers()
            });
        }
    }));
}

// Created on first use (top-level await is not available in the server build)
let renderer: Promise<{ highlighter: Highlighter, marked: Marked }> | undefined;

function getRenderer() {
    renderer ??= createHighlighter({langs: ["text"], themes: ["dark-plus", "light-plus"]})
        .then(highlighter => ({highlighter, marked: createRenderer(highlighter)}));
    return renderer;
}

// Markdown to HTML with headings ids, alerts and highlighted code blocks
export async function renderMarkdown(markdown: string): Promise<string> {
    const {highlighter, marked} = await getRenderer();
    const lexer = new Marked({gfm: true});
    await loadLanguages(highlighter, lexer.lexer(markdown), lexer);
    return marked.parse(markdown, {gfm: true, breaks: true});
}
