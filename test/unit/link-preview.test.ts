import {describe, expect, it} from "vitest";
import {loadSearchIndex} from "../../common/search";
import {createSearchIndex, splitIntoSections} from "../../server/utils/search-index";
import {linkPreview} from "../../app/utils/link-preview";

const index = loadSearchIndex(JSON.stringify(createSearchIndex([
    ...splitIntoSections("# Setup\n\nClay needs a few files.\n\n## Install\n\nRun the installer.", {link: "/guides/setup", title: "Setup", path: "Guides"}),
    ...splitIntoSections("# Deploy\n\n## First\n\nPick a host.\n\n## Second\n\nUpload the files.", {link: "/guides/deploy", title: "Deploy", path: "Guides"}),
    ...splitIntoSections("# Getting Started with Clay\n\nWelcome.", {link: "/start", title: "Getting Started", path: ""}),
    ...splitIntoSections("# Long\n\n" + "word ".repeat(100), {link: "/long", title: "Long", path: ""}),
])));

describe("linkPreview", () => {
    it("shows a page's intro without its title", () => {
        expect(linkPreview(index, "/guides/setup")).toEqual({path: "Guides", title: "Setup", text: "Clay needs a few files."});
    });

    it("drops a \"# heading\" that differs from the page's title", () => {
        expect(linkPreview(index, "/start")).toEqual({path: "", title: "Getting Started", text: "Welcome."});
    });

    it("shows the section a link leads to, below its page", () => {
        expect(linkPreview(index, "/guides/setup?highlight=x#install")).toEqual({path: "Guides › Setup", title: "Install", text: "Run the installer."});
    });

    it("falls back to the page for an unknown section", () => {
        expect(linkPreview(index, "/guides/setup#missing")?.title).toBe("Setup");
    });

    it("shows the first section of a page without an intro", () => {
        expect(linkPreview(index, "/guides/deploy/")).toEqual({path: "Guides", title: "Deploy", text: "Pick a host."});
    });

    it("cuts long text", () => {
        const text = linkPreview(index, "/long")!.text;
        expect(text.length).toBeLessThanOrEqual(300);
        expect(text.endsWith("…")).toBe(true);
    });

    it("has nothing for pages not in the index", () => {
        expect(linkPreview(index, "/missing")).toBeUndefined();
    });
});
