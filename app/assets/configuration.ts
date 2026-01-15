import type {BundledLanguage} from "shiki";

export type Configuration = {
    title: string,
    favicon: string,
    fontawesomeKit: string,
    navbar: NavbarConfiguration,
    index: IndexConfiguration,
    langs: BundledLanguage[]
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

export const DEFAULT_CONFIGURATION: Configuration = {
    title: "",
    favicon: "",
    fontawesomeKit: "",
    navbar: {
        logo: "",
        source: {
            name: "",
            icon: "",
            link: ""
        },
        links: []
    },
    index: {
        title: "",
        description: "",
        icon: ""
    },
    langs: []
}