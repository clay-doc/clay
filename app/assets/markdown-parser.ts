import {Marked} from "marked";
import {createHighlighter} from "shiki";

import {
    transformerNotationDiff,
    transformerNotationHighlight,
    transformerNotationWordHighlight,
    transformerNotationFocus,
    transformerNotationErrorLevel,
    transformerMetaHighlight,
    transformerMetaWordHighlight
} from '@shikijs/transformers'
import markedShiki from "marked-shiki";
import markedAlert from "marked-alert";

export const shikiHighlighter = await createHighlighter({
    langs: [],
    themes: ['dark-plus']
})

export function hasLang(lang: string) {
    return shikiHighlighter.getLoadedLanguages().some((e) => e === lang);
}

export const shikiMark = new Marked()
    .use(markedAlert({
        variants: [
            {
                type: 'caution',
                icon: '<i class="fa-solid fa-triangle-exclamation mr-2"></i>',
                title: 'Caution',
                titleClassName: 'markdown-alert-title text-error'
            },
            {
                type: 'warning',
                icon: '<i class="fa-solid fa-triangle-exclamation mr-2"></i>',
                title: 'Warning',
                titleClassName: 'markdown-alert-title text-warning'
            },
            {
                type: 'important',
                icon: '<i class="fa-solid fa-circle-exclamation mr-2"></i>',
                title: 'Important',
                titleClassName: 'markdown-alert-title text-error'
            },
            {
                type: 'tip',
                icon: '<i class="fa-solid fa-lightbulb mr-2"></i>',
                title: 'Tip',
                titleClassName: 'markdown-alert-title text-primary'
            },
            {
                type: 'note',
                icon: '<i class="fa-solid fa-sticky-note mr-2"></i>',
                title: 'Note',
                titleClassName: 'markdown-alert-title text-base-content'
            },
            {
                type: 'danger',
                icon: '<i class="fa-solid fa-skull-crossbones mr-2"></i>',
                title: 'Danger',
                titleClassName: 'markdown-alert-title text-error'
            }
        ]
    }))
    .use(
        markedShiki({
            highlight(code, lang, props) {
                if (!hasLang(lang)) {
                    return shikiHighlighter.codeToHtml(code, {
                        lang: "text",
                        theme: 'dark-plus',
                        meta: {__raw: props.join(' ')},
                        transformers: [
                            transformerNotationDiff({
                                matchAlgorithm: 'v3'
                            }),
                            transformerNotationHighlight({
                                matchAlgorithm: 'v3'
                            }),
                            transformerNotationWordHighlight({
                                matchAlgorithm: 'v3'
                            }),
                            transformerNotationFocus({
                                matchAlgorithm: 'v3'
                            }),
                            transformerNotationErrorLevel({
                                matchAlgorithm: 'v3'
                            }),
                            transformerMetaHighlight(),
                            transformerMetaWordHighlight()
                        ]
                    });
                }

                return shikiHighlighter.codeToHtml(code, {
                    lang,
                    theme: 'dark-plus',
                    meta: {__raw: props.join(' ')},
                    transformers: [
                        transformerNotationDiff({
                            matchAlgorithm: 'v3'
                        }),
                        transformerNotationHighlight({
                            matchAlgorithm: 'v3'
                        }),
                        transformerNotationWordHighlight({
                            matchAlgorithm: 'v3'
                        }),
                        transformerNotationFocus({
                            matchAlgorithm: 'v3'
                        }),
                        transformerNotationErrorLevel({
                            matchAlgorithm: 'v3'
                        }),
                        transformerMetaHighlight(),
                        transformerMetaWordHighlight()
                    ]
                });
            }
        })
    )