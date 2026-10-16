import {useClaySite} from "../../utils/use-clay-site";

// Config and navigation, read fresh on every request. Only used during
// development; builds bundle them into the app (see app/composables/use-site.ts).
export default defineEventHandler(() => {
    const {config, configs, nav, versions, languages, editions} = useClaySite();
    return {
        config, configs, nav, languages,
        versions: versions.map(({name, label, dir}) => ({name, label, dir})),
        navs: Object.fromEntries(editions.map(edition => [edition.prefix, edition.nav])),
    };
});
