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
import {transformerCopyButton} from "./code-block";
import {componentSyntax} from "../../common/markdown-components";
import {componentRenderers, fileTree, mermaidDiagram} from "./components";


const transformers = (messages: Messages): ShikiTransformer[] => [
    transformerNotationDiff({matchAlgorithm: "v3"}),
    transformerNotationHighlight({matchAlgorithm: "v3"}),
    transformerNotationWordHighlight({matchAlgorithm: "v3"}),
    transformerNotationFocus({matchAlgorithm: "v3"}),
    transformerNotationErrorLevel({matchAlgorithm: "v3"}),
    transformerMetaHighlight(),
    transformerMetaWordHighlight(),
    transformerCopyButton(messages.copyCode)
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

// Alert titles and the copy button are in the language of the doc
function createRenderer(highlighter: Highlighter, messages: Messages) {
    let diagrams = 0;
    return new Marked()
    .use(headingIds(messages.sectionLink))
    .use(componentSyntax(), componentRenderers(messages))
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
        highlight(code, lang, props) {
            // Code blocks that are drawn instead of highlighted
            if (lang === "mermaid") return mermaidDiagram(code, ++diagrams);
            if (lang === "tree") return fileTree(code);
            return highlighter.codeToHtml(code, {
                lang: lang && isLoaded(highlighter, lang) ? lang : "text",
                // Both themes as CSS variables; tailwind.css picks one per site theme
                themes: {light: "light-plus", dark: "dark-plus"},
                colorReplacements: {"light-plus": LIGHT_PLUS_CONTRAST},
                defaultColor: false,
                meta: {__raw: props.join(" ")},
                transformers: transformers(messages)
            });
        }
    }));
}

// Colors of light-plus that are too faint on the lighter backgrounds (highlighted
// and diff lines), each darkened just enough for a contrast of 4.5:1 on all of them
const LIGHT_PLUS_CONTRAST: Record<string, string> = {
    "#008000": "#006400", "#098658": "#076240", "#e50000": "#ae0000", "#cd3131": "#a02626", "#795e26": "#695221",
    "#267f99": "#1b5b6e", "#af00db": "#8f00b4", "#0070c1": "#005797", "#d16969": "#844242", "#ee0000": "#ae0000",
};

// Created on first use (top-level await is not available in the server build)
let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter() {
    highlighterPromise ??= createHighlighter({langs: ["text"], themes: ["dark-plus", "light-plus"]});
    return highlighterPromise;
}

// Markdown to HTML with headings ids, alerts, components and highlighted code blocks
export async function renderMarkdown(markdown: string, messages: Messages = messagesFor("en")): Promise<string> {
    const highlighter = await getHighlighter();
    const lexer = new Marked({gfm: true}, componentSyntax());
    await loadLanguages(highlighter, lexer.lexer(markdown), lexer);
    // A renderer per document: heading ids are numbered per document, and
    // documents are rendered concurrently during the build
    return createRenderer(highlighter, messages).parse(markdown, {gfm: true, breaks: true});
}
