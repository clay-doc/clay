import type {BundledLanguage} from "shiki";

export type Configuration = {
    title: string,
    favicon: string,
    fontawesomeKit?: string,
    lang?: string,
    editURL?: string, // e.g. "https://github.com/org/repo/edit/main/docs/"
    navbar: NavbarConfiguration,
    index: IndexConfiguration,
    langs: BundledLanguage[]
}

// Link to edit a doc in its repository, e.g. editURL + "guides/setup.md"
export function editLink(config: Configuration | undefined, docLink: string): string | undefined {
    if (!config?.editURL) return undefined;
    return config.editURL.replace(/\/*$/, "/") + docLink.replace(/^\/+/, "");
}

// Icons come from a Font Awesome kit when one is configured, otherwise from the
// free Font Awesome icons
export function hasFontawesomeKit(config: Configuration | undefined): boolean {
    const kit = config?.fontawesomeKit?.trim();
    return !!kit && /^[a-z0-9]+$/i.test(kit);
}

export type NavbarConfiguration = {
    logo: string,
    source: {
        name: string,
        icon: string,
        link: string
    },
    links: {
        name: string,
        icon: string,
        link: string
    }[]
}

export type IndexConfiguration = {
    title: string,
    description: string,
    icon: string,
}