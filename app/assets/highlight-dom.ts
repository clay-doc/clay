import {highlight} from "./search-index";

const MARK_CLASS = "search-hit";

export function clearHighlights(root: HTMLElement) {
    for (const mark of root.querySelectorAll(`mark.${MARK_CLASS}`)) {
        mark.replaceWith(mark.textContent ?? "");
    }
    root.normalize();
}

// Wraps whole-word matches of terms in <mark>, returns the marks in document order.
export function highlightTerms(root: HTMLElement, terms: string[]): HTMLElement[] {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

    const marks: HTMLElement[] = [];
    for (const node of textNodes) {
        const segments = highlight(node.data, terms);
        if (!segments.some(s => s.match)) continue;

        const fragment = root.ownerDocument.createDocumentFragment();
        for (const segment of segments) {
            if (segment.match) {
                const mark = root.ownerDocument.createElement("mark");
                mark.className = MARK_CLASS;
                mark.textContent = segment.text;
                fragment.append(mark);
                marks.push(mark);
            } else {
                fragment.append(segment.text);
            }
        }
        node.replaceWith(fragment);
    }

    return marks;
}

const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

// First mark inside the section that starts at anchor (an h2/h3, as split by the
// search index), or the first mark on the page when there is no anchor.
export function firstMarkInSection(root: HTMLElement, marks: HTMLElement[], anchor: HTMLElement | null): HTMLElement | undefined {
    if (!anchor) return marks[0];

    const headings = [...root.querySelectorAll("h2, h3")];
    const index = headings.indexOf(anchor);
    const end = index >= 0 ? headings[index + 1] : undefined;

    return marks.find(mark => follows(anchor, mark) && (!end || follows(mark, end)));
}
