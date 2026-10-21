import type {Messages} from "./i18n";
import type {ThemeConfiguration} from "./theme";
import type {AnalyticsConfiguration} from "./analytics";

// clay.yaml; only the title is required
export type Configuration = {
    title: string,
    favicon?: string,
    baseURL?: string, // path the site is served under, e.g. "/my-project/"
    siteURL?: string, // origin, e.g. "https://my-org.github.io"
    lang?: string,
    editURL?: string, // e.g. "https://github.com/org/repo/edit/main/docs/"
    fontawesomeKit?: string,
    version?: string, // label of the current docs in the version switcher, e.g. "2.x"
    languages?: string[], // language codes; the first is the default language
    messages?: Record<string, Partial<Messages>>, // interface texts by language
    navbar?: NavbarConfiguration,
    footer?: FooterConfiguration, // below every page: columns of links and a line of text
    variables?: Record<string, string | number | boolean>, // {{name}} in the docs, e.g. version: "4.0.0"
    head?: HeadConfiguration,
    generate?: string[], // commands that write docs before every build, e.g. API reference from code
    theme?: ThemeConfiguration, // the site's own colors, corners and fonts
    analytics?: AnalyticsConfiguration, // page views and events, without cookies
    socialImages?: boolean, // an image for each page in link previews; on with siteURL unless false
    pageActions?: PageActionsConfiguration, // the page menu below the contents; each entry false hides it
    openapi?: ApiConfiguration[], // OpenAPI documents, each with pages below the docs in the navigation
    langs?: string[], // obsolete: code languages are detected automatically
}

// An OpenAPI document (lib/openapi.ts): its file, and where its pages go, e.g. "api/petstore"
export type ApiConfiguration = { spec: string, route?: string, title?: string, icon?: string };

// Extra tags in the head of every page, e.g. a chat widget's script or a
// site verification; each tag is its attributes, a script's code is "code"
export type HeadTag = Record<string, string | number | boolean>;
export type HeadConfiguration = {
    script?: HeadTag[],
    link?: HeadTag[],
    meta?: HeadTag[],
}

// The entries of the page menu (PageActions.vue), all shown unless set to false
export const PAGE_ACTIONS = ["copyMarkdown", "openMarkdown", "chatgpt", "claude"] as const;
export type PageAction = typeof PAGE_ACTIONS[number];
export type PageActionsConfiguration = Partial<Record<PageAction, boolean>>;

export function showsPageAction(config: Configuration | undefined, action: PageAction): boolean {
    return config?.pageActions?.[action] !== false;
}

// The footer below every page (ContentFooter.vue): columns of links, each with a
// title, and a line of text, e.g. a copyright notice. Without it, pages have none.
export type FooterConfiguration = {
    columns?: { title: string, links: { name: string, link: string, icon?: string }[] }[],
    text?: string,
    madeWithClay?: boolean, // "Made with ♥ and Clay" below the text; shown unless false
};

export type NavbarConfiguration = {
    logo?: string,
    source?: {
        name: string,
        icon: string,
        link: string
    },
    links?: {
        name: string,
        icon: string,
        link: string
    }[]
}


// Link to edit a doc in its repository, e.g. editURL + "guides/setup.md". With
// versions, the docs are in docs/latest/ and docs/<name>/ (dir, see VersionInfo),
// so editURL has to end in "docs/" to find them.
export function editLink(config: Configuration | undefined, docLink: string, dir = "docs"): string | undefined {
    if (!config?.editURL) return undefined;
    let base = config.editURL.replace(/\/*$/, "/");
    if (dir !== "docs") {
        if (!base.endsWith("/docs/")) return undefined;
        base = base.replace(/docs\/$/, `${dir}/`);
    }
    return base + docLink.replace(/^\/+/, "");
}

// Icons come from a Font Awesome kit when one is configured, otherwise from the
// free Font Awesome icons
export function hasFontawesomeKit(config: Configuration | undefined): boolean {
    const kit = config?.fontawesomeKit?.trim();
    return !!kit && /^[a-z0-9]+$/i.test(kit);
}
