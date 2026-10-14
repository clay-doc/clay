export type Theme = "clay-light" | "clay-dark";

export const THEME_STORAGE_KEY = "clay-theme";

// The chosen theme, or null to follow the system setting. An inline script in
// the page head applies a stored choice before the first paint (nuxt.config.ts).
export function useTheme() {
    const chosen = useState<Theme | null>("theme", () => null);
    const systemDark = useState<boolean>("systemDark", () => true);

    onMounted(() => {
        const applied = document.documentElement.dataset.theme;
        chosen.value = applied === "clay-light" || applied === "clay-dark" ? applied : null;
        systemDark.value = window.matchMedia("(prefers-color-scheme: dark)").matches;
    });

    const theme = computed<Theme>(() => chosen.value ?? (systemDark.value ? "clay-dark" : "clay-light"));

    function toggle() {
        const next: Theme = theme.value === "clay-dark" ? "clay-light" : "clay-dark";
        chosen.value = next;
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // Storage unavailable: the choice lasts for this page view
        }
    }

    return {theme, toggle};
}
