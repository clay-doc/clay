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
}

export type LinkPart = {
    title: string;
    icon?: string;
    isDirectory: boolean;
    link: string | undefined;
}

export function getLinkPartsFromCurrentRoute(inRoute: string, rootNode: DocItem): LinkPart[] {
    // in: https://example.com/docs/products/product1
    // out: [ { title: "Products", link: "/docs/products" }, { title: "Product 1", link: "/docs/products/product1" } ]

    const route = inRoute.replace(/^https?:\/\/[^\/]+/, "");
    const parts = route.split("/").filter(part => part.length > 0);
    const result: LinkPart[] = [];

    let currentNode: DocItem | undefined = rootNode;

    for (const part of parts) {
        if (!currentNode || !currentNode.children) {
            break;
        }

        let isDirectory = false;

        const nextNode: DocItem | undefined = currentNode.children.find(child => {
            if (child.displayLink.split('/').pop() === part) {
                isDirectory = !(child.link.endsWith(".md"));
                return true;
            }

            return false
        });

        if (nextNode) {
            result.push({ title: nextNode.title, link: nextNode.displayLink, icon: nextNode.icon, isDirectory });
            currentNode = nextNode;
        } else {
            break;
        }
    }

    return result;
}

export function getCurrentDocItemFromRoute(inRoute: string, rootNode: DocItem): DocItem | undefined {
    const route = inRoute.replace(/^https?:\/\/[^\/]+/, "");
    const parts = route.split("/").filter(part => part.length > 0);

    let currentNode: DocItem | undefined = rootNode;

    for (const part of parts) {
        if (!currentNode || !currentNode.children) {
            break;
        }

        const nextNode: DocItem | undefined = currentNode.children.find(child => {
            return child.displayLink.split('/').pop() === part;
        });

        if (nextNode) {
            currentNode = nextNode;
        } else {
            break;
        }
    }

    return currentNode;
}

export function delimitLinkParts(parts: LinkPart[], count: number): LinkPart[] {
    const sliced = parts.slice(-count);
    // if there were parts cut off, add one part in front that is ...
    if (parts.length > sliced.length) {
        sliced.unshift({ title: "...", link: undefined, isDirectory: true });
    }

    return sliced;
}

// Pages in navigation order, with each folder's page before its contents
export function flattenPages(root: DocItem): DocItem[] {
    return (root.children ?? []).flatMap(item => item.children ? [item, ...flattenPages(item)] : [item]);
}

// The pages before and after a page in navigation order, for prev/next links
export function adjacentPages(root: DocItem, displayLink: string): { previous?: DocItem, next?: DocItem } {
    const pages = flattenPages(root);
    const index = pages.findIndex(page => page.displayLink === displayLink);
    if (index < 0) return {};
    return {previous: pages[index - 1], next: pages[index + 1]};
}
