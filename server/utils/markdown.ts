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
import {messagesFor, type Messages} from "../../common/i18n";
import {codeTitle, transformerCopyButton} from "./code-block";
import {componentSyntax} from "../../common/markdown-components";
import {componentRenderers, fileTree, mermaidDiagram} from "./components";
import {typography} from "../../common/typography";
import {LIGHT_PLUS_CONTRAST} from "../../common/code-colors";
import type {CellResolver} from "./request-cell";


const transformers = (messages: Messages, title?: string): ShikiTransformer[] => [
    transformerNotationDiff({matchAlgorithm: "v3"}),
    transformerNotationHighlight({matchAlgorithm: "v3"}),
    transformerNotationWordHighlight({matchAlgorithm: "v3"}),
    transformerNotationFocus({matchAlgorithm: "v3"}),
    transformerNotationErrorLevel({matchAlgorithm: "v3"}),
    transformerMetaHighlight(),
    transformerMetaWordHighlight(),
    transformerCopyButton(messages.copyCode, title)
];

type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;

const isLoaded = (highlighter: Highlighter, lang: string) => highlighter.getLoadedLanguages().includes(lang);

// Shiki only highlights languages it has loaded: load the ones a doc uses.
// Unknown languages are shown as plain text.
async function loadLanguages(highlighter: Highlighter, tokens: Token[], lexer: Marked) {
    const langs = new Set<string>();
    lexer.walkTokens(tokens, token => {
        if (token.type === "code" && token.lang) langs.add(codeTitle(token.lang).lang);
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

// Alert titles and the copy button are in the language of the doc
function createRenderer(highlighter: Highlighter, messages: Messages, cells?: CellResolver) {
    let diagrams = 0;
    return new Marked()
    .use(headingIds(messages.sectionLink))
    .use(componentSyntax(), componentRenderers(messages, cells))
    // Arrows, dashes and the quotes of the page's language in its text
    .use(typography(messages.quotes))
    .use(markedAlert({
        variants: [
            {type: "caution", icon: '<i class="fa-solid fa-triangle-exclamation mr-2"></i>', title: messages.alertCaution, titleClassName: "markdown-alert-title text-error"},
            {type: "warning", icon: '<i class="fa-solid fa-triangle-exclamation mr-2"></i>', title: messages.alertWarning, titleClassName: "markdown-alert-title text-warning"},
            {type: "important", icon: '<i class="fa-solid fa-circle-exclamation mr-2"></i>', title: messages.alertImportant, titleClassName: "markdown-alert-title text-error"},
            {type: "tip", icon: '<i class="fa-solid fa-lightbulb mr-2"></i>', title: messages.alertTip, titleClassName: "markdown-alert-title text-primary"},
            {type: "note", icon: '<i class="fa-solid fa-sticky-note mr-2"></i>', title: messages.alertNote, titleClassName: "markdown-alert-title text-base-content"},
            {type: "danger", icon: '<i class="fa-solid fa-skull-crossbones mr-2"></i>', title: messages.alertDanger, titleClassName: "markdown-alert-title text-error"}
        ]
    }))
    .use(markedShiki({
        highlight(code, info, props) {
            const {title, lang, meta} = codeTitle([info, ...props].join(" "));
            // Code blocks that are drawn instead of highlighted
            if (lang === "mermaid") return mermaidDiagram(code, ++diagrams);
            if (lang === "tree") return fileTree(code);
            return highlighter.codeToHtml(code, {
                // Very long blocks, like an API's example responses, stay plain: coloring them takes seconds
                lang: lang && isLoaded(highlighter, lang) && code.length <= LONG_CODE ? lang : "text",
                // Both themes as CSS variables; assets/css/code.css picks one per site theme
                themes: {light: "light-plus", dark: "dark-plus"},
                colorReplacements: {"light-plus": LIGHT_PLUS_CONTRAST},
                defaultColor: false,
                meta: {__raw: meta},
                transformers: transformers(messages, title)
            });
        }
    }));
}

const LONG_CODE = 20_000;


// Created on first use (top-level await is not available in the server build)
let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter() {
    highlighterPromise ??= createHighlighter({langs: ["text"], themes: ["dark-plus", "light-plus"]});
    return highlighterPromise;
}

// Markdown to HTML with headings ids, alerts, components and highlighted code
// blocks; cells finds what request cells send
export async function renderMarkdown(markdown: string, messages: Messages = messagesFor("en"), cells?: CellResolver): Promise<string> {
    const highlighter = await getHighlighter();
    const lexer = new Marked({gfm: true}, componentSyntax());
    await loadLanguages(highlighter, lexer.lexer(markdown), lexer);
    // A renderer per document: heading ids are numbered per document, and
    // documents are rendered concurrently during the build
    return createRenderer(highlighter, messages, cells).parse(markdown, {gfm: true, breaks: true});
}
