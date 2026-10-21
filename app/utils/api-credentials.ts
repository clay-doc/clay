import {effectScope, reactive, watch} from "vue";
import type {Credential} from "#common/openapi";

// What the reader entered to call an API: keys, passwords and tokens, by
// security scheme. All request cells of an API share them. They stay in the
// tab (sessionStorage) unless the reader asks to remember them on the device
// (localStorage); they are only ever sent to the API.

export type SchemeCredential = Credential & { clientId?: string, clientSecret?: string, scopes?: string[], flow?: string };
export type ApiCredentials = { remember: boolean, schemes: Record<string, SchemeCredential> };

const KEY = (api: string) => `clay-api:${api}`;
const stores = new Map<string, ApiCredentials>();

function read(api: string): ApiCredentials | undefined {
    for (const storage of [() => sessionStorage, () => localStorage]) {
        try {
            const saved = JSON.parse(storage().getItem(KEY(api)) ?? "null");
            if (saved && typeof saved === "object" && saved.schemes) return saved;
        } catch {
            // no storage, or nothing usable in it
        }
    }
    return undefined;
}

function save(api: string, credentials: ApiCredentials) {
    try {
        const text = JSON.stringify(credentials);
        const [keep, drop] = credentials.remember ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
        keep.setItem(KEY(api), text);
        drop.removeItem(KEY(api));
    } catch {
        // storage is off: the credentials last as long as the page
    }
}

export function apiCredentials(api: string): ApiCredentials {
    let store = stores.get(api);
    if (!store) {
        store = reactive(read(api) ?? {remember: false, schemes: {}});
        stores.set(api, store);
        // Saved for as long as the page lives: the cell that asked first may be gone
        // when the reader changes them, and its watchers with it
        const saved = store;
        effectScope(true).run(() => watch(saved, value => save(api, value), {deep: true}));
    }
    return store;
}
