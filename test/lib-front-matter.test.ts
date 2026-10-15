import {describe, expect, it} from "vitest";
import {parseFrontMatter, stripFrontMatter} from "../lib/front-matter";

describe("parseFrontMatter", () => {
    it.each([
        ["title and icon", "---\ntitle: Getting Started\nicon: fa-solid fa-rocket\n---\n# Hi", {title: "Getting Started", icon: "fa-solid fa-rocket"}],
        ["description", "---\ndescription: How to set up Clay\n---", {description: "How to set up Clay"}],
        ["no front matter", "# Hi\n\nText", {}],
        ["unknown keys ignored", "---\nauthor: me\ntitle: T\n---", {title: "T"}],
        ["colon in value", "---\ntitle: Clay: The Guide\n---", {title: "Clay: The Guide"}],
        ["surrounding whitespace", "---\n  title:   Spaced   \n---", {title: "Spaced"}],
        ["CRLF line endings", "---\r\ntitle: T\r\nicon: I\r\n---\r\n", {title: "T", icon: "I"}],
        ["quoted values", "---\ntitle: \"Quoted: Title\"\nicon: 'fa-solid fa-x'\n---", {title: "Quoted: Title", icon: "fa-solid fa-x"}],
        ["byte order mark", "﻿---\ntitle: T\n---", {title: "T"}],
        ["horizontal rule is not front matter", "# Doc\n\n---\ntitle: not a title\n---\n", {}],
        ["unclosed front matter", "---\ntitle: T\n# Doc", {}],
        ["order", "---\norder: 2\n---", {order: 2}],
        ["negative order", "---\norder: -1\n---", {order: -1}],
        ["invalid order ignored", "---\norder: first\n---", {}],
    ])("%s", (_name, content, expected) => {
        expect(parseFrontMatter(content)).toEqual(expected);
    });
});

describe("stripFrontMatter", () => {
    it.each([
        ["---\ntitle: T\n---\n# Doc\n", "# Doc\n"],
        ["# Doc\n\n---\nmore\n", "# Doc\n\n---\nmore\n"],
        ["", ""],
    ])("%j", (content, expected) => {
        expect(stripFrontMatter(content)).toBe(expected);
    });

    it("reads list and hero, and cards as the old name of list", () => {
        expect(parseFrontMatter("---\nlist: true\nhero: false\n---\n")).toEqual({list: true, hero: false});
        expect(parseFrontMatter("---\ncards: true\n---\n")).toEqual({list: true});
        expect(parseFrontMatter("---\nlist: yes\n---\n")).toEqual({});
    });
});
