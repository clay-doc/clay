// @vitest-environment happy-dom
import {describe, expect, it} from "vitest";
import {clearHighlights, firstMarkInSection, highlightTerms} from "../../app/utils/highlight-dom";

function container(html: string) {
    const root = document.createElement("div");
    root.innerHTML = html;
    return root;
}

describe("highlightTerms", () => {
    it("wraps whole-word matches across elements in document order", () => {
        const root = container("<h2>Reflector</h2><p>The <strong>reflector</strong> finds commands; reflectors too.</p>");
        const marks = highlightTerms(root, ["reflector"]);

        expect(marks.map(m => m.textContent)).toEqual(["Reflector", "reflector"]);
        expect(root.querySelector("strong")!.innerHTML).toBe('<mark class="search-hit">reflector</mark>');
        expect(root.textContent).toBe("ReflectorThe reflector finds commands; reflectors too.");
    });

    it("marks text inside highlighted code spans", () => {
        const root = container('<pre><code><span style="color:red">loadLanguage</span><span>(lang)</span></code></pre>');
        expect(highlightTerms(root, ["loadlanguage"]).map(m => m.textContent)).toEqual(["loadLanguage"]);
    });

    it("leaves request cells and the empty text nodes Vue keeps in them alone", () => {
        const root = container('<p>pets</p><div class="clay-request"><code>/pets</code></div>');
        const anchor = root.querySelector(".clay-request")!.appendChild(document.createTextNode(""));
        expect(highlightTerms(root, ["pets"])).toHaveLength(1);
        clearHighlights(root);
        expect(anchor.parentNode).toBe(root.querySelector(".clay-request"));
        expect(root.querySelector("p")!.childNodes).toHaveLength(1);
    });

    it("does nothing without terms", () => {
        const root = container("<p>Plain text</p>");
        expect(highlightTerms(root, [])).toEqual([]);
        expect(root.innerHTML).toBe("<p>Plain text</p>");
    });

    it("escapes the inserted text", () => {
        const root = container("<p>a &lt;b&gt; tag</p>");
        highlightTerms(root, ["b"]);
        expect(root.innerHTML).toBe('<p>a &lt;<mark class="search-hit">b</mark>&gt; tag</p>');
    });
});

describe("clearHighlights", () => {
    it("restores the original markup", () => {
        const original = "<h2>Install</h2><p>Install the <em>install</em> script.</p>";
        const root = container(original);
        highlightTerms(root, ["install"]);
        clearHighlights(root);

        expect(root.innerHTML).toBe(original);
        expect(root.querySelector("p")!.childNodes.length).toBe(3);
    });

    it("allows highlighting different terms afterwards", () => {
        const root = container("<p>alpha beta</p>");
        highlightTerms(root, ["alpha"]);
        clearHighlights(root);
        expect(highlightTerms(root, ["beta"]).map(m => m.textContent)).toEqual(["beta"]);
        expect(root.querySelectorAll("mark")).toHaveLength(1);
    });
});

describe("firstMarkInSection", () => {
    const html = `
        <p>term in intro</p>
        <h2 id="one">One</h2><p>nothing here</p>
        <h3 id="two">Two</h3><p>the term is here</p><h4>Sub</h4><p>term again</p>
        <h2 id="three">Three</h2><p>term later</p>`;

    it("returns the first mark within the anchored section", () => {
        const root = container(html);
        const marks = highlightTerms(root, ["term"]);
        const mark = firstMarkInSection(root, marks, root.querySelector("#two"));
        expect(mark?.parentElement?.textContent).toBe("the term is here");
    });

    it("does not jump into the next section", () => {
        const root = container(html);
        const marks = highlightTerms(root, ["term"]);
        expect(firstMarkInSection(root, marks, root.querySelector("#one"))).toBeUndefined();
    });

    it("uses the first mark on the page without an anchor", () => {
        const root = container(html);
        const marks = highlightTerms(root, ["term"]);
        expect(firstMarkInSection(root, marks, null)).toBe(marks[0]);
    });
});
