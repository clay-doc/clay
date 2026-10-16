import type {Configuration} from "#common/configuration";
import type {LanguageInfo} from "#common/editions";
import {absoluteUrl, breadcrumbs, ogLocale, pageTitle, resolveOrigin, SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH, truncate, websiteData} from "#common/seo";
import type {Edition} from "#common/editions";
import {markdownRoute, normalizePath} from "#common/route-path";
import linkConcat from "#common/link-concat";

export type SeoInput = {
    title?: string;          // page title, without the site title
    description?: string;
    route: string;
    type?: "article" | "website";
    updated?: string;        // ISO 8601
    trail?: { title: string, route: string }[]; // breadcrumb trail, including the page
    image?: string;          // path of the page's social image (lib/social-images.ts)
};

// Title, description, canonical URL, translations (hreflang), Open Graph tags and
// breadcrumbs of a page, and where language models find it as Markdown
export function useClaySeo(input: MaybeRefOrGetter<SeoInput>) {
    const basePath = useRuntimeConfig().app.baseURL;
    const configRef = inject("config") as Ref<Configuration>;
    const alternates = inject("alternates") as Ref<{ language: string, route: string }[]>;
    const canonicalRoute = inject("canonicalRoute") as Ref<string | undefined>;
    const languages = inject("languages") as Ref<LanguageInfo[]>;
    const edition = inject("edition") as Ref<Edition>;

    const markdownFor = (route: string) => markdownRoute(normalizePath(route), normalizePath(route) === (edition.value.prefix || "/"));

    useHead(() => {
        const config = configRef.value;
        const {origin} = resolveOrigin(config.siteURL, basePath);
        const page = toValue(input);
        const title = pageTitle(page.title, config.title);
        const description = truncate(page.description || "");
        const url = absoluteUrl(origin, basePath, page.route);
        // An untranslated page repeats its original; search engines should show that one
        const canonical = absoluteUrl(origin, basePath, canonicalRoute.value ?? page.route);
        const translations = origin ? alternates.value.map(alternate => ({
            rel: "alternate" as const, hreflang: alternate.language, href: absoluteUrl(origin, basePath, alternate.route)!,
        })) : [];
        const defaultTranslation = translations.find(t => t.hreflang === languages.value[0]?.code);
        const language = edition.value.language.code;
        // Start pages (of the site, a version or a language) name the site; other pages show their place in it
        const start = normalizePath(page.route) === (edition.value.prefix || "/");
        const jsonLd = start && url ? websiteData(config.title, url, language) : page.trail ? breadcrumbs(page.trail, origin, basePath) : undefined;
        // Link previews need the image's full address
        const image = origin && page.image ? origin + linkConcat(basePath, page.image) : undefined;

        return {
            title,
            meta: [
                {name: "description", content: description},
                {property: "og:type", content: page.type ?? "website"},
                {property: "og:title", content: title},
                {property: "og:description", content: description},
                {property: "og:site_name", content: config.title},
                {property: "og:locale", content: ogLocale(language)},
                ...alternates.value.filter(alternate => alternate.language !== language)
                    .map(alternate => ({property: "og:locale:alternate", content: ogLocale(alternate.language)})),
                {name: "twitter:card", content: image ? "summary_large_image" : "summary"},
                ...(image ? [
                    {property: "og:image", content: image},
                    {property: "og:image:width", content: String(SOCIAL_IMAGE_WIDTH)},
                    {property: "og:image:height", content: String(SOCIAL_IMAGE_HEIGHT)},
                    {property: "og:image:alt", content: title},
                ] : []),
                ...(url ? [{property: "og:url", content: url}] : []),
                ...(page.updated ? [{property: "article:modified_time", content: page.updated}] : []),
            ],
            link: [
                ...(canonical ? [{rel: "canonical" as const, href: canonical}] : []),
                ...translations,
                ...(defaultTranslation ? [{rel: "alternate" as const, hreflang: "x-default", href: defaultTranslation.href}] : []),
                // Tools that look for the sitemap in the page, where robots.txt is out of reach (sites under a base path)
                ...(origin ? [{rel: "sitemap" as const, type: "application/xml", href: `${origin}${basePath.replace(/\/?$/, "/")}sitemap.xml`}] : []),
                // The page as Markdown, and the index of all pages for language models (server/middleware/agent-docs.ts)
                {rel: "alternate" as const, type: "text/markdown", title: "Markdown", href: `${origin ?? ""}${linkConcat(basePath, markdownFor(page.route))}`},
                {rel: "alternate" as const, type: "text/plain", title: "llms.txt", href: `${origin ?? ""}${linkConcat(basePath, `${edition.value.prefix}/llms.txt`)}`},
            ],
            script: jsonLd ? [{type: "application/ld+json", innerHTML: jsonLd}] : [],
        };
    });
}
