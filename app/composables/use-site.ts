import {config, nav, navs, versions} from "#clay-site";
import type {Configuration} from "#common/configuration";
import type {DocItem} from "#common/nav";
import type {VersionInfo} from "#common/versions";

// nav is the current docs' navigation; navs has every version's, by name
export type SiteData = { config: Configuration, nav: DocItem, versions: VersionInfo[], navs: Record<string, DocItem> };

// The site's config and navigation. Builds bundle them into the app; during
// development they come from the server, so edits show up without a restart.
export async function useSite(): Promise<Ref<SiteData>> {
    if (import.meta.dev) {
        const {data} = await useFetch<SiteData>("/api/_clay/site", {key: "clay-site"});
        return data as Ref<SiteData>;
    }
    return ref({config, nav, versions, navs});
}
