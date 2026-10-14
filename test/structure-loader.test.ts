import {describe, expect, it} from "vitest";
import {
    adjacentPages,
    delimitLinkParts,
    flattenPages,
    getCurrentDocItemFromRoute,
    getLinkPartsFromCurrentRoute,
    loadFromYamlStructure,
    type LinkPart
} from "../app/assets/structure-loader";

// Same shape as the clay-structure.yaml Clay Oven generates.
const structureYaml = `docs:
    - "index.md#Overview#fa-solid fa-home"
    - "products#Products#fa-solid fa-boxes":
        - "product1.md#Product 1#fa-solid fa-box"
        - "product2.md#Product 2"
`;

const root = loadFromYamlStructure(structureYaml, "docs");

describe("loadFromYamlStructure", () => {
    it("parses files and directories with titles, icons and links", () => {
        expect(root.children).toEqual([
            {
                title: "Overview",
                icon: "fa-solid fa-home",
                link: "/index.md",
                displayLink: "/index",
                children: undefined
            },
            {
                title: "Products",
                icon: "fa-solid fa-boxes",
                link: "/products",
                displayLink: "/products",
                children: [
                    {
                        title: "Product 1",
                        icon: "fa-solid fa-box",
                        link: "/products/product1.md",
                        displayLink: "/products/product1",
                        children: undefined
                    },
                    {
                        title: "Product 2",
                        icon: undefined,
                        link: "/products/product2.md",
                        displayLink: "/products/product2",
                        children: undefined
                    }
                ]
            }
        ]);
    });
});

describe("loadFromYamlStructure with an empty directory", () => {
    it("does not crash on a directory without children", () => {
        const tree = loadFromYamlStructure(`docs:
    - "empty#Empty#fa-solid fa-folder":
    - "a.md#A"
`, "docs");
        expect(tree.children?.map(c => [c.title, c.children])).toEqual([["Empty", []], ["A", undefined]]);
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

describe("last-updated dates", () => {
    it("reads the optional fourth field", () => {
        const tree = loadFromYamlStructure(`docs:
    - "a.md#A#fa-solid fa-file#2026-03-04T05:06:07Z"
    - "b.md#B"
`, "docs");
        expect(tree.children?.map(c => c.updated)).toEqual(["2026-03-04T05:06:07Z", undefined]);
    });
});

describe("prev/next pages", () => {
    it("lists pages in navigation order, skipping directories", () => {
        expect(flattenPages(root).map(p => p.displayLink)).toEqual(["/index", "/products/product1", "/products/product2"]);
    });

    it("finds the neighbours of a page across directories", () => {
        const {previous, next} = adjacentPages(root, "/products/product1");
        expect(previous?.title).toBe("Overview");
        expect(next?.title).toBe("Product 2");
    });

    it("has no previous on the first page and no next on the last", () => {
        expect(adjacentPages(root, "/index").previous).toBeUndefined();
        expect(adjacentPages(root, "/products/product2").next).toBeUndefined();
    });

    it("returns nothing for unknown pages", () => {
        expect(adjacentPages(root, "/missing")).toEqual({});
    });
});
