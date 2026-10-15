// Whether a page should play its entrance: after navigating in the app, but
// not when it was rendered on the server and is only being hydrated
export function usePageEnter(): boolean {
    return import.meta.client && !useNuxtApp().isHydrating;
}
