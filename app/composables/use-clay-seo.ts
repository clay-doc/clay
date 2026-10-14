import type {Configuration} from "#common/configuration";
import {absoluteUrl, breadcrumbs, pageTitle, resolveOrigin, truncate} from "#common/seo";

export type SeoInput = {
    title?: string;          // page title, without the site title
    description?: string;
    route: string;
    type?: "article" | "website";
    updated?: string;        // ISO 8601
    trail?: { title: string, route: string }[]; // breadcrumb trail, including the page
};

// Title, description, canonical URL, Open Graph tags and breadcrumbs of a page
export function useClaySeo(input: MaybeRefOrGetter<SeoInput>) {
    const basePath = useRuntimeConfig().app.baseURL;
    const configRef = inject("config") as Ref<Configuration>;

    useHead(() => {
        const config = configRef.value;
        const {origin} = resolveOrigin(config.siteURL, basePath);
        const page = toValue(input);
        const title = pageTitle(page.title, config.title);
        const description = truncate(page.description || config.index?.description || "");
        const url = absoluteUrl(origin, basePath, page.route);
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
            link: url ? [{rel: "canonical", href: url}] : [],
            script: jsonLd ? [{type: "application/ld+json", innerHTML: jsonLd}] : [],
        };
    });
}
