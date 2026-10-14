import {useClaySite} from "../../utils/site";

// Config and navigation, read fresh on every request. Only used during
// development; builds bundle them into the app (see app/composables/use-site.ts).
export default defineEventHandler(() => {
    const {config, nav} = useClaySite();
    return {config, nav};
});
