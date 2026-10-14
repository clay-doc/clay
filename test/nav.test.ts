import {describe, expect, it} from "vitest";
import {
    adjacentPages,
    delimitLinkParts,
    flattenPages,
    getCurrentDocItemFromRoute,
    getLinkPartsFromCurrentRoute,
    type LinkPart
} from "../common/nav";
import {buildNav, type DocNode} from "../lib/site";

const file = (path: string, frontMatter: DocNode["frontMatter"] = {}, extra: Partial<DocNode> = {}): DocNode =>
    ({name: path.split("/").pop()!, path, isDir: false, markdown: "", frontMatter, children: [], ...extra});
const dir = (path: string, children: DocNode[]): DocNode =>
    ({name: path.split("/").pop()!, path, isDir: true, frontMatter: {}, children});

const tree = dir("", [
    file("overview.md", {title: "Overview", icon: "fa-solid fa-home"}, {updated: "2026-03-04T05:06:07Z"}),
    dir("products", [
        file("products/product1.md", {title: "Product 1", icon: "fa-solid fa-box"}),
        file("products/product2.md", {title: "Product 2"}),
    ]),
]);
tree.children[1]!.index = file("products/index.md", {title: "Products", icon: "fa-solid fa-boxes"});
const root = buildNav(tree);

describe("buildNav", () => {
    it("builds the navigation tree with titles, icons, links and dates", () => {
        expect(root.children).toEqual([
            {title: "Overview", icon: "fa-solid fa-home", link: "/overview.md", displayLink: "/overview", children: undefined, updated: "2026-03-04T05:06:07Z", source: "overview.md"},
            {
                title: "Products",
                icon: "fa-solid fa-boxes",
                link: "/products",
                displayLink: "/products",
                children: [
                    {title: "Product 1", icon: "fa-solid fa-box", link: "/products/product1.md", displayLink: "/products/product1", children: undefined, source: "products/product1.md"},
                    {title: "Product 2", icon: "fa-solid fa-file", link: "/products/product2.md", displayLink: "/products/product2", children: undefined, source: "products/product2.md"},
                ]
            }
        ]);
    });

    it("leaves out directories without pages and files that are not markdown", () => {
        const nav = buildNav(dir("", [dir("images", [file("images/a.png")]), dir("empty", []), file("notes.txt"), file("a.md")]));
        expect(nav.children?.map(c => c.displayLink)).toEqual(["/a"]);
    });
});

describe("getLinkPartsFromCurrentRoute", () => {
    it("builds breadcrumb parts for a nested page", () => {
        expect(getLinkPartsFromCurrentRoute("/products/product1", root)).toEqual([
            {title: "Products", link: "/products", icon: "fa-solid fa-boxes", isDirectory: true},
            {title: "Product 1", link: "/products/product1", icon: "fa-solid fa-box", isDirectory: false}
        ]);
    });

    it("ignores the origin of a full URL", () => {
        expect(getLinkPartsFromCurrentRoute("https://example.com/products", root))
            .toEqual([{title: "Products", link: "/products", icon: "fa-solid fa-boxes", isDirectory: true}]);
    });

    it("stops at the first unknown segment", () => {
        expect(getLinkPartsFromCurrentRoute("/missing/product1", root)).toEqual([]);
    });
});

describe("getCurrentDocItemFromRoute", () => {
    it("finds a nested page", () => {
        expect(getCurrentDocItemFromRoute("/products/product2", root)?.title).toBe("Product 2");
    });

    it("returns the deepest match for an unknown segment", () => {
        expect(getCurrentDocItemFromRoute("/products/missing", root)?.title).toBe("Products");
    });
});

describe("delimitLinkParts", () => {
    const part = (title: string): LinkPart => ({title, link: "/" + title, isDirectory: true});
    const parts = ["a", "b", "c", "d", "e"].map(part);

    it("keeps the last parts and prefixes an ellipsis", () => {
        expect(delimitLinkParts(parts, 3).map(p => p.title)).toEqual(["...", "c", "d", "e"]);
    });

    it("returns all parts when within the limit", () => {
        expect(delimitLinkParts(parts.slice(0, 2), 3)).toEqual(parts.slice(0, 2));
    });
});

describe("prev/next pages", () => {
    it("lists pages in navigation order, skipping directories", () => {
        expect(flattenPages(root).map(p => p.displayLink)).toEqual(["/overview", "/products/product1", "/products/product2"]);
    });

    it("finds the neighbours of a page across directories", () => {
        const {previous, next} = adjacentPages(root, "/products/product1");
        expect(previous?.title).toBe("Overview");
        expect(next?.title).toBe("Product 2");
    });

    it("has no previous on the first page and no next on the last", () => {
        expect(adjacentPages(root, "/overview").previous).toBeUndefined();
        expect(adjacentPages(root, "/products/product2").next).toBeUndefined();
    });

    it("returns nothing for unknown pages", () => {
        expect(adjacentPages(root, "/missing")).toEqual({});
    });
});
