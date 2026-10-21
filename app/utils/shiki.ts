import type {HighlighterCore, ThemedToken} from "shiki/core";
import {LIGHT_PLUS_CONTRAST} from "#common/code-colors";

// Shiki in the browser, for request cells (RequestCell.vue): the colors of the
// code blocks for bodies being written, requests written out, responses and
// code samples. It loads when a page has a cell, and each language when first
// needed, so pages without cells carry none of it.

const LANGUAGES = {
    json: () => import("shiki/langs/json.mjs"),
    xml: () => import("shiki/langs/xml.mjs"),
    yaml: () => import("shiki/langs/yaml.mjs"),
    http: () => import("shiki/langs/http.mjs"),
    shellscript: () => import("shiki/langs/shellscript.mjs"),
    javascript: () => import("shiki/langs/javascript.mjs"),
    python: () => import("shiki/langs/python.mjs"),
};
export type Language = keyof typeof LANGUAGES;

// Very long text stays plain: coloring it as one types would be slow
const LONG_TEXT = 20_000;

let core: Promise<HighlighterCore> | undefined;
let ready: HighlighterCore | undefined;
const loading = new Map<Language, Promise<void>>();
// Bumped when a language has loaded, so what shows text colors it
const loaded = ref(0);

function load(language: Language) {
    if (loading.has(language)) return;
    core ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(([{createHighlighterCore}, {createJavaScriptRegexEngine}]) =>
        createHighlighterCore({
            themes: [import("shiki/themes/light-plus.mjs"), import("shiki/themes/dark-plus.mjs")],
            langs: [],
            engine: createJavaScriptRegexEngine(),
        }));
    loading.set(language, core.then(async highlighter => {
        await highlighter.loadLanguage((await LANGUAGES[language]()).default);
        ready = highlighter;
        loaded.value++;
    }).catch(() => {
        // Without the language, the text stays plain
    }));
}

// The language of a body or response by its media type
export function languageOf(mediaType: string): Language | undefined {
    if (/json/i.test(mediaType)) return "json";
    if (/xml|html/i.test(mediaType)) return "xml";
    if (/yaml/i.test(mediaType)) return "yaml";
    return undefined;
}

// The text in tokens with the colors of both themes (code.css picks one), or
// undefined until Shiki and the language have loaded. Reactive: what reads it
// is drawn again once they have.
export function highlight(text: string, language: Language | undefined): ThemedToken[][] | undefined {
    void loaded.value;
    if (!language || !import.meta.client || text.length > LONG_TEXT) return undefined;
    if (!ready?.getLoadedLanguages().includes(language)) {
        load(language);
        return undefined;
    }
    return ready.codeToTokens(text, {
        lang: language,
        themes: {light: "light-plus", dark: "dark-plus"},
        colorReplacements: {"light-plus": LIGHT_PLUS_CONTRAST},
        defaultColor: false,
    }).tokens;
}
