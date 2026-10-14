import type {Messages} from "./i18n";

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
    index?: IndexConfiguration,
    langs?: string[], // obsolete: code languages are detected automatically
}

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

export type IndexConfiguration = {
    title?: string,
    description?: string,
    icon?: string,
}

// Link to edit a doc in its repository, e.g. editURL + "guides/setup.md". Docs
// of an older version are in versions/<name>/docs/, next to docs/, so editURL
// has to end in "docs/" to find them.
export function editLink(config: Configuration | undefined, docLink: string, version = ""): string | undefined {
    if (!config?.editURL) return undefined;
    let base = config.editURL.replace(/\/*$/, "/");
    if (version) {
        if (!base.endsWith("/docs/")) return undefined;
        base = base.replace(/docs\/$/, `versions/${version}/docs/`);
    }
    return base + docLink.replace(/^\/+/, "");
}

// Icons come from a Font Awesome kit when one is configured, otherwise from the
// free Font Awesome icons
export function hasFontawesomeKit(config: Configuration | undefined): boolean {
    const kit = config?.fontawesomeKit?.trim();
    return !!kit && /^[a-z0-9]+$/i.test(kit);
}
