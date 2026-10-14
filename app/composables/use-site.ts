import {config, configs, languages, nav, navs, versions} from "#clay-site";
import type {Configuration} from "#common/configuration";
import type {DocItem} from "#common/nav";
import type {LanguageInfo, VersionInfo} from "#common/editions";

// config and nav are those of the current docs in the default language; navs
// has every edition's navigation by URL prefix ("/1.x/de"), configs every language's config
export type SiteData = {
    config: Configuration, nav: DocItem,
    versions: VersionInfo[], languages: LanguageInfo[],
    navs: Record<string, DocItem>, configs: Record<string, Configuration>,
};

// The site's config and navigation. Builds bundle them into the app; during
// development they come from the server, so edits show up without a restart.
export async function useSite(): Promise<Ref<SiteData>> {
    if (import.meta.dev) {
        const {data} = await useFetch<SiteData>("/api/_clay/site", {key: "clay-site"});
        return data as Ref<SiteData>;
    }
    return ref({config, nav, versions, languages, navs, configs});
}
