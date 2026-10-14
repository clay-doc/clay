import type {Configuration} from "#common/configuration";
import type {LanguageInfo} from "#common/editions";
import {absoluteUrl, breadcrumbs, pageTitle, resolveOrigin, truncate} from "#common/seo";

export type SeoInput = {
    title?: string;          // page title, without the site title
    description?: string;
    route: string;
    type?: "article" | "website";
    updated?: string;        // ISO 8601
    trail?: { title: string, route: string }[]; // breadcrumb trail, including the page
};

// Title, description, canonical URL, translations (hreflang), Open Graph tags and
// breadcrumbs of a page
export function useClaySeo(input: MaybeRefOrGetter<SeoInput>) {
    const basePath = useRuntimeConfig().app.baseURL;
    const configRef = inject("config") as Ref<Configuration>;
    const alternates = inject("alternates") as Ref<{ language: string, route: string }[]>;
    const canonicalRoute = inject("canonicalRoute") as Ref<string | undefined>;
    const languages = inject("languages") as Ref<LanguageInfo[]>;

    useHead(() => {
        const config = configRef.value;
        const {origin} = resolveOrigin(config.siteURL, basePath);
        const page = toValue(input);
        const title = pageTitle(page.title, config.title);
        const description = truncate(page.description || config.index?.description || "");
        const url = absoluteUrl(origin, basePath, page.route);
        // An untranslated page repeats its original; search engines should show that one
        const canonical = absoluteUrl(origin, basePath, canonicalRoute.value ?? page.route);
        const translations = origin ? alternates.value.map(alternate => ({
            rel: "alternate", hreflang: alternate.language, href: absoluteUrl(origin, basePath, alternate.route)!,
        })) : [];
        const defaultTranslation = translations.find(t => t.hreflang === languages.value[0]?.code);
        const jsonLd = page.trail ? breadcrumbs(page.trail, origin, basePath) : undefined;

        return {
            title,
            meta: [
                {name: "description", content: description},
                {property: "og:type", content: page.type ?? "website"},
                {property: "og:title", content: title},
                {property: "og:description", content: description},
                {property: "og:site_name", content: config.title},
                {name: "twitter:card", content: "summary"},
                ...(url ? [{property: "og:url", content: url}] : []),
                ...(page.updated ? [{property: "article:modified_time", content: page.updated}] : []),
            ],
            link: [
                ...(canonical ? [{rel: "canonical", href: canonical}] : []),
                ...translations,
                ...(defaultTranslation ? [{rel: "alternate", hreflang: "x-default", href: defaultTranslation.href}] : []),
            ],
            script: jsonLd ? [{type: "application/ld+json", innerHTML: jsonLd}] : [],
        };
    });
}
