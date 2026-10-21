import type {CellScheme, OAuthFlow} from "#common/openapi";

// Signing in to an API with OAuth 2.0 or OpenID Connect, from a request cell.
// Flows that go through the provider's page open it in a popup, which comes
// back to /_clay/oauth-callback.html (modules/clay.ts); that page hands its
// address to this one. Authorization codes are exchanged with PKCE.

export const CALLBACK_PATH = "_clay/oauth-callback.html";

export type SignIn = {
    scheme: CellScheme;
    flow: string; // "authorizationCode", "implicit", "clientCredentials", "password"; OpenID Connect uses the first
    clientId: string;
    clientSecret?: string;
    scopes: string[];
    user?: string;
    password?: string;
    redirectUri: string;
};

const randomText = (bytes = 32) => base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

function base64Url(data: Uint8Array): string {
    return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challengeOf(verifier: string): Promise<string> {
    return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

// The endpoints of an OpenID Connect provider, from its discovery document
async function discover(url: string): Promise<OAuthFlow> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const config = await response.json();
    return {authorizationUrl: config.authorization_endpoint, tokenUrl: config.token_endpoint, scopes: {}};
}

// The address the popup comes back with, once the provider is done
function waitForCallback(popup: Window, state: string): Promise<URL> {
    return new Promise((resolve, reject) => {
        const channel = "BroadcastChannel" in window ? new BroadcastChannel("clay-oauth") : undefined;
        const finish = (href: unknown) => {
            if (typeof href !== "string") return;
            const url = new URL(href);
            const params = new URLSearchParams(url.hash.slice(1));
            if ((url.searchParams.get("state") ?? params.get("state")) !== state) return;
            cleanup();
            resolve(url);
        };
        const onMessage = (event: MessageEvent) => {
            if (event.origin === location.origin && event.data?.type === "clay-oauth") finish(event.data.url);
        };
        const onChannel = (event: MessageEvent) => finish(event.data?.url);
        // The reader closed the popup without signing in
        const timer = setInterval(() => {
            if (popup.closed) {
                cleanup();
                reject(new Error("closed"));
            }
        }, 500);
        const cleanup = () => {
            clearInterval(timer);
            window.removeEventListener("message", onMessage);
            channel?.close();
        };
        window.addEventListener("message", onMessage);
        channel?.addEventListener("message", onChannel);
    });
}

async function requestToken(tokenUrl: string, fields: Record<string, string | undefined>, sign: SignIn): Promise<string> {
    const body = new URLSearchParams(Object.entries(fields).filter((entry): entry is [string, string] => !!entry[1]));
    const headers: Record<string, string> = {"Content-Type": "application/x-www-form-urlencoded", Accept: "application/json"};
    if (sign.clientSecret) headers.Authorization = `Basic ${btoa(`${encodeURIComponent(sign.clientId)}:${encodeURIComponent(sign.clientSecret)}`)}`;
    else body.set("client_id", sign.clientId);
    const response = await fetch(tokenUrl, {method: "POST", headers, body});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.access_token !== "string") throw new Error(data.error_description ?? data.error ?? String(response.status));
    return data.access_token;
}

// Signs in and returns the access token
export async function signIn(sign: SignIn): Promise<string> {
    const flow = sign.scheme.type === "openIdConnect" ? await discover(sign.scheme.openIdConnectUrl!) : sign.scheme.flows?.[sign.flow as keyof NonNullable<CellScheme["flows"]>];
    if (!flow) throw new Error(sign.flow);
    const scope = sign.scopes.join(" ") || undefined;
    if (sign.flow === "clientCredentials") return requestToken(flow.tokenUrl!, {grant_type: "client_credentials", scope}, sign);
    if (sign.flow === "password") return requestToken(flow.tokenUrl!, {grant_type: "password", username: sign.user, password: sign.password, scope}, sign);

    // Through the provider's page: an authorization code with PKCE, or a token at once (implicit)
    const implicit = sign.flow === "implicit";
    const state = randomText(16);
    const verifier = randomText();
    const url = new URL(flow.authorizationUrl!);
    url.searchParams.set("response_type", implicit ? "token" : "code");
    url.searchParams.set("client_id", sign.clientId);
    url.searchParams.set("redirect_uri", sign.redirectUri);
    url.searchParams.set("state", state);
    if (scope) url.searchParams.set("scope", scope);
    if (!implicit) {
        url.searchParams.set("code_challenge", await challengeOf(verifier));
        url.searchParams.set("code_challenge_method", "S256");
    }
    const popup = window.open(url, "clay-oauth", "popup,width=520,height=680");
    if (!popup) throw new Error("popup");
    const back = await waitForCallback(popup, state);
    const fragment = new URLSearchParams(back.hash.slice(1));
    const error = back.searchParams.get("error") ?? fragment.get("error");
    if (error) throw new Error(back.searchParams.get("error_description") ?? fragment.get("error_description") ?? error);
    if (implicit) {
        const token = fragment.get("access_token");
        if (!token) throw new Error("access_token");
        return token;
    }
    return requestToken(flow.tokenUrl!, {
        grant_type: "authorization_code", code: back.searchParams.get("code") ?? undefined,
        redirect_uri: sign.redirectUri, code_verifier: verifier,
    }, sign);
}
