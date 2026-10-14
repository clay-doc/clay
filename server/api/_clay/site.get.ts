import {useClaySite} from "../../utils/site";

// Config and navigation, read fresh on every request. Only used during
// development; builds bundle them into the app (see app/composables/use-site.ts).
export default defineEventHandler(() => {
    const {config, nav, versions} = useClaySite();
    return {
        config, nav,
        versions: versions.map(({name, label}) => ({name, label})),
        navs: Object.fromEntries(versions.map(version => [version.name, version.nav])),
    };
});
