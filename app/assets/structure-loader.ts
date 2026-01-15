import yaml from "js-yaml";

type YamlItem = string | Record<string, YamlItem[]>;

export type DocItem = {
    title: string;
    icon?: string;
    link: string;
    displayLink: string;
    children: DocItem[] | undefined;
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

export function loadFromYamlStructure(structure: string): DocItem {
    const base = yaml.load(structure) as YamlItem;
    /*
    - "index.md#Home"
    - "help.md#Help"
    - products#Products:
        - "product1.md#Product 1"
        - "product2.md#Product 2"
    - about#About:
        - "team.md#Team"
        - "company.md#Company"
     */

    function parseItem(item: YamlItem, currentLink: string): DocItem {
        if (typeof item === "string") {
            // Parsing to item with link and title
            const [linkPart, titlePart, iconPart] = item.split("#");
            const link = currentLink + linkPart?.trim() || "unset";
            const icon = iconPart ? iconPart.trim() : undefined;
            const displayLink = link.replace(/\.md$/, "");
            const title = titlePart ? titlePart.trim() : link;
            return { title, link, displayLink, icon, children: undefined };
        } else {
            // Parsing to item with title, link and children
            const key = Object.keys(item)[0]!!;
            const itemChildren = item[key]!!;
            const [linkPart, titlePart, iconPart] = key.split("#");
            const link = currentLink + linkPart?.trim() || "unset";
            const icon = iconPart ? iconPart.trim() : undefined;
            const title = titlePart ? titlePart.trim() : link;

            const actualLink = link === "docs" ? "" : link;

            const children = itemChildren.map((child) => parseItem(child, actualLink + "/"));
            return { title, link, displayLink: link, children, icon };
        }
    }

    return parseItem(base, "")
}


