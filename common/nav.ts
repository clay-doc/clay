export type DocItem = {
    title: string;
    icon?: string;
    link: string;
    displayLink: string;
    children: DocItem[] | undefined;
    updated?: string; // last-updated date (ISO 8601), when the docs have git history
    source?: string; // file of a page, relative to docs/, e.g. "guides/setup.de.md"
    untranslated?: boolean; // shown in the default language, no translation exists
    hasIndex?: boolean; // a folder whose page is its index.md
    method?: string; // an API operation: "GET", "POST", ...
    deprecated?: boolean; // an API operation that is deprecated
    route?: string; // an API: its route in the edition, which can have several parts ("/api/petstore")
    collapsed?: boolean; // a folder that starts closed in the sidebar, e.g. an API's schemas
    apis?: DocItem[]; // the root: the APIs (OpenAPI), below the docs
}

export type LinkPart = {
    title: string;
    icon?: string;
    isDirectory: boolean;
    link: string | undefined;
}

// The entries a route leads through, from the top: folders and the page.
// An API's route can have several parts, so its pages are found below it.
function entriesOnRoute(inRoute: string, rootNode: DocItem): { item: DocItem, isDirectory: boolean }[] {
    const route = inRoute.replace(/^https?:\/\/[^\/]+/, "");
    const parts = route.split("/").filter(part => part.length > 0);
    const result: { item: DocItem, isDirectory: boolean }[] = [];
    let currentNode: DocItem | undefined = rootNode;

    const api = rootNode.apis?.find(api => {
        const own = (api.route ?? "").split("/").filter(Boolean);
        return own.length > 0 && own.every((part, i) => parts[i] === part);
    });
    if (api) {
        result.push({item: api, isDirectory: true});
        currentNode = api;
        parts.splice(0, (api.route ?? "").split("/").filter(Boolean).length);
    }

    for (const part of parts) {
        if (!currentNode || !currentNode.children) {
            break;
        }

        const nextNode: DocItem | undefined = currentNode.children.find(child => child.displayLink.split('/').pop() === part);

        if (nextNode) {
            result.push({item: nextNode, isDirectory: !(nextNode.link.endsWith(".md"))});
            currentNode = nextNode;
        } else {
            break;
        }
    }

    return result;
}

export function getLinkPartsFromCurrentRoute(inRoute: string, rootNode: DocItem): LinkPart[] {
    // in: https://example.com/docs/products/product1
    // out: [ { title: "Products", link: "/docs/products" }, { title: "Product 1", link: "/docs/products/product1" } ]
    return entriesOnRoute(inRoute, rootNode).map(({item, isDirectory}) => ({title: item.title, link: item.displayLink, icon: item.icon, isDirectory}));
}

export function getCurrentDocItemFromRoute(inRoute: string, rootNode: DocItem): DocItem | undefined {
    return entriesOnRoute(inRoute, rootNode).at(-1)?.item ?? rootNode;
}

export function delimitLinkParts(parts: LinkPart[], count: number): LinkPart[] {
    const sliced = parts.slice(-count);
    // if there were parts cut off, add one part in front that is ...
    if (parts.length > sliced.length) {
        sliced.unshift({ title: "...", link: undefined, isDirectory: true });
    }

    return sliced;
}

// Pages in navigation order, with each folder's page before its contents; the APIs follow the docs
export function flattenPages(root: DocItem): DocItem[] {
    return [...(root.children ?? []), ...(root.apis ?? [])].flatMap(item => item.children ? [item, ...flattenPages({...item, apis: undefined})] : [item]);
}

// The pages before and after a page in navigation order, for prev/next links
export function adjacentPages(root: DocItem, displayLink: string): { previous?: DocItem, next?: DocItem } {
    const pages = flattenPages(root);
    const index = pages.findIndex(page => page.displayLink === displayLink);
    if (index < 0) return {};
    return {previous: pages[index - 1], next: pages[index + 1]};
}
