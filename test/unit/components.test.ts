import {describe, expect, it} from "vitest";
import {Marked} from "marked";
import {renderDoc} from "../../server/utils/render-doc";
import {componentSyntax} from "../../common/markdown-components";
import {plainText} from "../../common/markdown-text";
import {fileTree} from "../../server/utils/components";
import {serverDocument} from "../../server/utils/sanitize";

// Through the whole pipeline, sanitizer included, like a page is rendered
const render = async (markdown: string) => (await renderDoc(markdown, "/guides/page", "/")).html;
const dom = async (markdown: string) => {
    const template = serverDocument.createElement("template");
    template.innerHTML = await render(markdown);
    return template.content;
};

describe("tabs", () => {
    const tabs = `::: tabs
== npm
Run **npm**.
== pnpm
Run pnpm.
:::`;

    it("render a tab list and one panel per tab, the first one shown", async () => {
        const root = await dom(tabs);
        const buttons = [...root.querySelectorAll("[role=tab]")];
        expect(buttons.map(b => b.textContent)).toEqual(["npm", "pnpm"]);
        expect(buttons.map(b => b.getAttribute("aria-selected"))).toEqual(["true", "false"]);
        const panels = [...root.querySelectorAll("[role=tabpanel]")];
        expect(panels.map(p => p.hasAttribute("hidden"))).toEqual([false, true]);
        expect(panels[0]!.innerHTML).toContain("<strong>npm</strong>");
        expect(panels[0]!.getAttribute("aria-labelledby")).toBe(buttons[0]!.id);
        expect(buttons[1]!.getAttribute("aria-controls")).toBe(panels[1]!.id);
    });

    it("number their ids per page", async () => {
        const root = await dom(`${tabs}\n\n${tabs}`);
        const ids = [...root.querySelectorAll("[id]")].map(el => el.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("leave a container without tabs or end as text", async () => {
        expect(await render("::: tabs\nNo labels\n:::")).toContain("::: tabs");
        expect(await render("::: tabs\n== a\nnot closed")).toContain("::: tabs");
    });

    it("keep ::: and == inside code blocks", async () => {
        const root = await dom("::: tabs\n== Syntax\n```md\n::: details\n== x\n:::\n```\n:::");
        expect(root.querySelectorAll("[role=tab]")).toHaveLength(1);
        expect(root.querySelector("pre")!.textContent).toBe("::: details\n== x\n:::");
    });
});

describe("code groups", () => {
    it("make a tab of each code block, named by its [label] or language", async () => {
        const root = await dom("::: code-group\n```sh [npm]\nnpm i clay-doc\n```\n```yaml\na: 1\n```\n:::");
        expect([...root.querySelectorAll("[role=tab]")].map(b => b.textContent)).toEqual(["npm", "yaml"]);
        expect(root.querySelector(".clay-code-group")).not.toBeNull();
        // Highlighted as sh, without the label
        expect(root.querySelectorAll("[role=tabpanel] pre.shiki")).toHaveLength(2);
        expect(root.querySelector("pre")!.textContent).toBe("npm i clay-doc");
        // One tab of shell code makes the group a terminal, with a window's buttons
        expect(root.querySelector(".clay-code-group.is-terminal.has-dots")).not.toBeNull();
    });

    it("without shell code have plain tabs", async () => {
        const root = await dom("::: code-group\n```ts\nconst a = 1;\n```\n```js\nconst a = 1;\n```\n:::");
        expect(root.querySelector(".clay-code-group")!.className).toBe("clay-tabs clay-code-group");
    });
});

describe("code block file names", () => {
    it("show the name in brackets above the code, highlighted in the language", async () => {
        const root = await dom("```yaml [clay.yaml] {2}\ntitle: Docs\nlang: en\n```");
        expect(root.querySelector(".code-block.has-title > .code-title")!.textContent).toBe("clay.yaml");
        expect(root.querySelector("pre.shiki")!.textContent).toBe("title: Docs\nlang: en");
        // The rest of the info string still works
        expect(root.querySelectorAll(".line.highlighted")).toHaveLength(1);
    });

    it("keep slashes and spaces of the name out of the line notations", async () => {
        const root = await dom("```md [docs/guides/my page.md]\nsee guides here\n```");
        expect(root.querySelector(".code-title")!.textContent).toBe("docs/guides/my page.md");
        expect(root.querySelector(".highlighted-word")).toBeNull();
    });

    it("work without a language", async () => {
        const root = await dom("``` [notes.txt]\nplain\n```");
        expect(root.querySelector(".code-title")!.textContent).toBe("notes.txt");
        expect(root.querySelector("pre")!.textContent).toBe("plain");
    });

    it("leave blocks without a name as they were", async () => {
        const root = await dom("```ts\nconst a = 1;\n```");
        expect(root.querySelector(".code-title")).toBeNull();
        expect(root.querySelector(".code-block")!.className).toBe("code-block");
    });
});

describe("shell code", () => {
    const commands = (root: DocumentFragment) => [...root.querySelectorAll(".line")].map(line => line.classList.contains("command"));

    it("looks like a terminal, with commands marked for their \"$\", which is not copied", async () => {
        const root = await dom("```bash\n# Install\nnpm i clay-doc \\\n  --save\n\nnpx clay build\n```");
        expect(root.querySelector(".code-block.is-terminal.has-bar > .code-terminal")!.getAttribute("aria-hidden")).toBe("true");
        expect(commands(root)).toEqual([false, true, false, false, true]);
        expect(root.querySelector("pre")!.textContent).toBe("# Install\nnpm i clay-doc \\\n  --save\n\nnpx clay build");
    });

    it("skips the text of heredocs", async () => {
        const root = await dom("```sh\ncat <<EOF > a.txt\nhello\nEOF\nls\n```");
        expect(commands(root)).toEqual([true, false, false, true]);
    });

    it("keeps prompts that are written, and sessions with output as they are", async () => {
        expect(commands(await dom("```sh\n$ ls\na.txt\n```"))).toEqual([false, false]);
        const session = await dom("```console\n$ ls\na.txt\n```");
        expect(session.querySelector(".code-terminal")).not.toBeNull();
        expect(commands(session)).toEqual([false, false]);
    });

    it("has no bar without the window's buttons (\"windowDots: false\"); code groups keep the bar of their tabs", async () => {
        const template = serverDocument.createElement("template");
        template.innerHTML = (await renderDoc("```bash\nnpx clay dev\n```\n\n::: code-group\n```sh [npm]\nnpm i clay-doc\n```\n:::",
            "/guides/page", "/", "", undefined, undefined, undefined, undefined, false)).html;
        expect(template.content.querySelector(".code-terminal")).toBeNull();
        expect(commands(template.content)).toEqual([true, true]);
        expect(template.content.querySelector(".clay-code-group")!.className).toBe("clay-tabs clay-code-group is-terminal");
    });

    it("is a script when it has a file name", async () => {
        const root = await dom("```bash [deploy.sh]\nnpm run build\n```");
        expect(root.querySelector(".code-terminal")).toBeNull();
        expect(root.querySelector(".code-title")!.textContent).toBe("deploy.sh");
        expect(commands(root)).toEqual([false]);
    });
});

describe("containers", () => {
    it("steps wrap their list", async () => {
        const root = await dom("::: steps\n1. Install\n2. Build\n:::");
        expect(root.querySelectorAll(".clay-steps > ol > li")).toHaveLength(2);
    });

    it("details fold their content under a title, with a default title", async () => {
        const root = await dom("::: details Why *not*?\nBecause.\n:::\n\n::: details\nText\n:::");
        const [first, second] = root.querySelectorAll("details");
        expect(first!.querySelector(".clay-details-title")!.innerHTML).toBe("Why <em>not</em>?");
        expect(first!.textContent).toContain("Because.");
        expect(second!.querySelector(".clay-details-title")!.textContent).toBe("Details");
    });

    it("nest, with the same number of colons or more", async () => {
        const root = await dom("::: details Outer\n::: tabs\n== A\nInner\n:::\n:::\n\n:::: details Four\n::: steps\n1. One\n:::\n::::");
        expect(root.querySelector("details [role=tab]")!.textContent).toBe("A");
        expect(root.querySelectorAll("details")).toHaveLength(2);
        expect(root.querySelector("details:last-of-type .clay-steps li")!.textContent).toBe("One");
    });

    it("leave unknown names as text", async () => {
        expect(await render("::: unknown\nText\n:::")).toContain("::: unknown");
    });

    it("headings inside get their ids and links", async () => {
        const root = await dom("::: details More\n## Inside\n:::");
        expect(root.querySelector("details h2")!.id).toBe("inside");
    });
});

describe("cards", () => {
    it("turn each list item into a link with title, icon and text", async () => {
        const root = await dom("::: cards\n- [Setup](setup.md) {fa-solid fa-rocket}\n  Install **Clay**, see [here](x.md).\n- [Site](https://example.com)\n:::");
        const cards = [...root.querySelectorAll("a.clay-card")];
        expect(cards).toHaveLength(2);
        expect(cards[0]!.getAttribute("href")).toBe("/guides/setup");
        expect(cards[0]!.getAttribute("data-route")).toBe("/guides/setup");
        expect(cards[0]!.querySelector("i")!.className).toBe("clay-card-icon fa-solid fa-rocket");
        expect(cards[0]!.querySelector(".clay-card-title")!.textContent).toBe("Setup");
        // No links inside the card's link
        expect(cards[0]!.querySelector(".clay-card-text")!.innerHTML).toBe("Install <strong>Clay</strong>, see here.");
        expect(cards[1]!.getAttribute("href")).toBe("https://example.com");
        expect(cards[1]!.querySelector("i, .clay-card-text")).toBeNull();
    });

    it("take icon and text from the linked page when they have none", async () => {
        const pages = (route: string) => route === "/guides/setup" ? {icon: "fa-solid fa-gear", description: "All about setup."} : undefined;
        const html = (await renderDoc("::: cards\n- [Setup](setup.md)\n- [Own](setup.md) {fa-solid fa-star}\n  Mine.\n:::", "/guides/page", "/", "", "/guides/page", undefined, pages)).html;
        const template = serverDocument.createElement("template");
        template.innerHTML = html;
        const [first, second] = template.content.querySelectorAll("a.clay-card");
        expect(first!.querySelector("i")!.className).toBe("clay-card-icon fa-solid fa-gear");
        expect(first!.querySelector(".clay-card-text")!.textContent).toBe("All about setup.");
        expect(second!.querySelector("i")!.className).toBe("clay-card-icon fa-solid fa-star");
        expect(second!.querySelector(".clay-card-text")!.textContent).toBe("Mine.");
    });
});

describe("math", () => {
    it("renders inline and block math with KaTeX, as HTML and MathML", async () => {
        const root = await dom("Energy: $E = mc^2$.\n\n$$\n\\int_0^1 x\\,dx\n$$");
        expect(root.querySelector("p .katex math")).not.toBeNull();
        expect(root.querySelector(".clay-math .katex-display")).not.toBeNull();
        // KaTeX positions with inline styles, which the sanitizer keeps for it
        expect(root.querySelector(".katex-html [style]")).not.toBeNull();
    });

    it("leaves prices alone", async () => {
        const html = await render("It costs $5 and $10, or $ 3 $.");
        expect(html).not.toContain("katex");
    });

    it("shows broken formulas instead of failing", async () => {
        expect(await render("$\\frac{1$")).toContain("katex-error");
    });
});

describe("prompts", () => {
    it("show their text as written, with a title and a copy button", async () => {
        const root = await dom("::: prompt\nAdd a page about **deploying**.\nUse <b>bold</b> sparingly.\n:::\n\n::: prompt For Claude Code\nRun clay check.\n:::");
        const [first, second] = root.querySelectorAll(".clay-prompt");
        expect(first!.querySelector(".clay-prompt-title")!.textContent).toBe("Suggested prompt");
        expect(first!.querySelector("pre")!.textContent).toBe("Add a page about **deploying**.\nUse <b>bold</b> sparingly.");
        expect(first!.querySelector("button.copy-code")!.getAttribute("aria-label")).toBe("Copy prompt");
        expect(second!.querySelector(".clay-prompt-title")!.textContent).toBe("For Claude Code");
    });

    it("are found by the search", () => {
        const lexer = new Marked({gfm: true}, componentSyntax());
        expect(lexer.lexer("::: prompt\nDeploy the site\n:::").map(plainText).join(" ")).toContain("Deploy the site");
    });
});

describe("badges", () => {
    it("render with the color of their type", async () => {
        const root = await dom("## API :badge[New]\n\nOld :badge[Deprecated]{warning} :badge[x]{nope}");
        const badges = [...root.querySelectorAll(".badge")];
        expect(badges.map(b => b.textContent)).toEqual(["New", "Deprecated", "x"]);
        expect(badges[0]!.className).toContain("badge-primary");
        expect(badges[1]!.className).toContain("badge-warning");
        expect(badges[2]!.className).toContain("badge-primary");
        // A badge is a label next to the heading, not part of its #link
        expect(root.querySelector("h2")!.id).toBe("api");
    });
});

describe("file trees", () => {
    const tree = (source: string) => {
        const template = serverDocument.createElement("template");
        template.innerHTML = fileTree(source);
        return template.content;
    };
    const names = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map(e => e.textContent);
    // The names of a list's own entries
    const top = (list: Element) => [...list.children].map(li => li.querySelector(".file-tree-name")!.textContent);

    it("nest entries by their indentation; folders with entries fold, open", () => {
        const root = tree("docs/\n  index.md  # the start page\n  guides\n    setup.md\n  img/\nclay.yaml\n...");
        expect(top(root.querySelector(".file-tree > ul")!)).toEqual(["docs", "clay.yaml", "..."]);
        expect(root.querySelectorAll("details[open]")).toHaveLength(2);
        expect(names(root, "details details li .file-tree-name")).toEqual(["setup.md"]);
        expect(root.querySelector(".file-tree-comment")!.textContent).toBe("the start page");
        // An empty folder is a folder too
        expect(names(root, "span.file-tree-folder .file-tree-name")).toEqual(["img"]);
    });

    it("pick an icon by file type", () => {
        const root = tree("a.md\nb.png\nc.yaml\nd.txt\n...");
        expect([...root.querySelectorAll("li i")].map(i => i.className)).toEqual([
            "fa-brands fa-markdown", "fa-regular fa-file-image", "fa-regular fa-file-code", "fa-regular fa-file-lines",
        ]);
    });

    it("read the output of the tree command", () => {
        const root = tree("docs\n├── guides\n│   └── setup.md\n└── index.md");
        expect(names(root, "details details li .file-tree-name")).toEqual(["setup.md"]);
        expect(top(root.querySelector(".file-tree > ul > li > details > ul")!)).toEqual(["guides", "index.md"]);
    });

    it("are drawn for ```tree blocks, escaped", async () => {
        const root = await dom("```tree\n<b>x</b>\n```");
        expect(root.querySelector(".file-tree .file-tree-name")!.textContent).toBe("<b>x</b>");
    });
});

describe("diagrams", () => {
    it("are drawn when the site is built, in the theme's colors, with ids of their own", async () => {
        const html = await render("```mermaid\ngraph LR\n  A[Write] --> B\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```");
        const template = serverDocument.createElement("template");
        template.innerHTML = html;
        const svgs = template.content.querySelectorAll(".mermaid-diagram:not([data-client]) svg");
        expect(svgs).toHaveLength(2);
        expect(svgs[0]!.textContent).toContain("Write");
        // Colors and fonts come from the site's stylesheet, nothing from elsewhere
        expect(html).not.toContain("<style");
        expect(html).not.toContain("googleapis");
        expect(svgs[0]!.getAttribute("style")).toBeNull();
        const ids = [...template.content.querySelectorAll("[id]")].map(el => el.id);
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
        expect(svgs[0]!.querySelector("[marker-end]")!.getAttribute("marker-end")).toMatch(/^url\(#diagram-1-/);
    });

    it("leave kinds the build cannot draw to the browser, with their source", async () => {
        const root = await dom("```mermaid\npie title Pets\n  \"Dogs\" : 3\n```");
        expect(root.querySelector(".mermaid-diagram[data-client] pre")!.textContent).toBe('pie title Pets\n  "Dogs" : 3');
    });
});

describe("plain text of components", () => {
    it("reads titles, labels, content, math and badges", () => {
        const lexer = new Marked({gfm: true}, componentSyntax());
        const text = lexer.lexer("::: details Why\nBecause $x$ :badge[New]\n:::\n\n::: tabs\n== npm\nRun it\n:::").map(plainText).join(" ");
        expect(text.replace(/\s+/g, " ").trim()).toBe("Why Because x New npm Run it");
    });
});

describe("fields and endpoints", () => {
    it("show fields as name, type and flags, with their text and nested fields", async () => {
        const root = await dom("::: fields\n- `name` string **required** *read-only*\n\n  The pet's *name*.\n\n  - `first` string\n- `old` · integer · ~~deprecated~~\n- [Person](/person) *one of*\n:::");
        // The top-level fields: nested ones are in a .clay-fields too
        const [name, old, person] = [...root.querySelectorAll(".clay-fields:not(.clay-fields-nested) > .clay-field")];
        expect(name!.querySelector(".clay-field-name")?.textContent).toBe("name");
        expect(name!.querySelector(".clay-field-type")?.textContent).toBe("string");
        expect([...name!.querySelectorAll(".clay-field-flag")].map(f => [f.textContent, f.classList.contains("clay-field-required")])).toEqual([["required", true], ["read-only", false]]);
        expect(name!.querySelector(".clay-field-text")?.innerHTML).toContain("<em>name</em>");
        expect(name!.querySelector(".clay-fields-nested .clay-field-name")?.textContent).toBe("first");
        expect(old!.querySelector(".clay-field-deprecated")?.textContent).toBe("deprecated");
        expect(person!.querySelector(".clay-field-name")).toBeNull();
        expect(person!.querySelector(".clay-field-type a")?.getAttribute("data-route")).toBe("/person");
    });

    it("take types with links and code, and leave other items as they are", async () => {
        const root = await dom("::: fields\n- `owner` [Person](/p) | `null`\n- Just text\n:::");
        const [owner, text] = [...root.querySelectorAll(".clay-fields > .clay-field")];
        expect(owner!.querySelector(".clay-field-type")?.innerHTML).toBe('<a href="/p" data-route="/p">Person</a> | <code>null</code>');
        expect(text!.querySelector(".clay-field-type")?.textContent).toBe("Just text");
    });

    it("show endpoints with their method, path and title, linked to their page", async () => {
        const root = await dom("::: endpoints\n- `GET /pets` [List pets](/pets)\n- `DELETE /pets/{id}` [Delete](/delete) ~~deprecated~~\n- `POST` Sent to you\n:::");
        const rows = [...root.querySelectorAll(".clay-endpoints .clay-endpoint")];
        expect(rows.map(r => [r.querySelector(".clay-method")?.className, r.querySelector(".clay-endpoint-path")?.textContent, r.querySelector(".clay-endpoint-title")?.textContent]))
            .toEqual([["clay-method clay-method-get", "/pets", "List pets"], ["clay-method clay-method-delete", "/pets/{id}", "Delete"], ["clay-method clay-method-post", undefined, "Sent to you"]]);
        expect(rows[0]!.getAttribute("data-route")).toBe("/pets");
        expect(rows[1]!.classList.contains("clay-endpoint-deprecated")).toBe(true);
        expect(rows[2]!.tagName).toBe("DIV");
        // Any case, and the path in a code span of its own
        const other = (await dom("::: endpoints\n- `get` `/pets` [List](/pets)\n:::")).querySelector(".clay-endpoint")!;
        expect([other.querySelector(".clay-method")?.textContent, other.querySelector(".clay-endpoint-path")?.textContent]).toEqual(["GET", "/pets"]);
    });

    it("color the tabs of responses by status, and keep them to their group", async () => {
        const root = await dom("::: tabs status\n== 200\nOK\n== 404\nMissing\n== default\nError\n:::");
        expect(root.querySelector("[data-tabs]")?.hasAttribute("data-tabs-local")).toBe(true);
        expect([...root.querySelectorAll("[role=tab]")].map(t => t.className.match(/clay-status-\w+/)?.[0])).toEqual(["clay-status-2", "clay-status-4", "clay-status-default"]);
        expect((await dom("::: tabs\n== a\nA\n:::")).querySelector("[data-tabs-local], .clay-status")).toBeNull();
    });
});
