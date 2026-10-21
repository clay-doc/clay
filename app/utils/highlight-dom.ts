import {highlight} from "../../common/search";

const MARK_CLASS = "search-hit";

// Only where marks were: request cells (RequestCell.vue) keep empty text nodes
// that Vue needs, which normalizing the whole page would remove
export function clearHighlights(root: HTMLElement) {
    const parents = new Set<Node>();
    for (const mark of root.querySelectorAll(`mark.${MARK_CLASS}`)) {
        if (mark.parentNode) parents.add(mark.parentNode);
        mark.replaceWith(mark.textContent ?? "");
    }
    for (const parent of parents) parent.normalize();
}

// Wraps whole-word matches of terms in <mark>, returns the marks in document order.
export function highlightTerms(root: HTMLElement, terms: string[]): HTMLElement[] {
    // Request cells are drawn by Vue, which must keep their text as it is
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => node.parentElement?.closest(".clay-request") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
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
