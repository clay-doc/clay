// Tabs and code groups (server/utils/components.ts). Picking a tab picks the
// tab of the same name in every group on the page, and is remembered, so a
// reader who chose "pnpm" once sees pnpm everywhere.

const STORAGE_KEY = "clay-tabs";
const REMEMBERED = 20;

const tabsOf = (group: Element) => [...group.querySelectorAll<HTMLElement>(":scope > [role=tablist] > [role=tab]")];

// The line under the picked tab, which slides when another one is picked.
// Without animate it jumps, e.g. once the fonts have loaded.
function placeLine(group: Element, animate: boolean) {
    const list = group.querySelector<HTMLElement>(":scope > [role=tablist]");
    const tab = tabsOf(group).find(t => t.getAttribute("aria-selected") === "true");
    if (!list || !tab) return;
    let line = list.querySelector<HTMLElement>(":scope > .clay-tab-indicator");
    if (!line) {
        line = Object.assign(document.createElement("span"), {className: "clay-tab-indicator"});
        line.setAttribute("aria-hidden", "true");
        list.append(line);
    }
    // As wide as the tab's text, like daisyUI's own line
    const padding = parseFloat(getComputedStyle(tab).paddingLeft) || 0;
    if (!animate) line.style.transition = "none";
    line.style.left = `${tab.offsetLeft + padding}px`;
    line.style.width = `${tab.offsetWidth - 2 * padding}px`;
    if (!animate) {
        void line.offsetWidth;
        line.style.transition = "";
    }
}

export function selectTab(tab: HTMLElement) {
    const group = tab.closest("[data-tabs]");
    if (!group) return;
    for (const other of tabsOf(group)) {
        const selected = other === tab;
        other.setAttribute("aria-selected", String(selected));
        other.tabIndex = selected ? 0 : -1;
        other.classList.toggle("tab-active", selected);
        group.querySelector(`#${CSS.escape(other.getAttribute("aria-controls") ?? "")}`)?.toggleAttribute("hidden", !selected);
    }
    placeLine(group, true);
}

// Picks the tab named label in every group under root that has one
export function selectLabel(root: ParentNode, label: string) {
    for (const group of root.querySelectorAll("[data-tabs]")) {
        const tab = tabsOf(group).find(t => t.textContent?.trim() === label);
        if (tab) selectTab(tab);
    }
}

function remembered(): string[] {
    try {
        const labels = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        return Array.isArray(labels) ? labels.filter(l => typeof l === "string") : [];
    } catch {
        return [];
    }
}

export function remember(label: string) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([label, ...remembered().filter(l => l !== label)].slice(0, REMEMBERED)));
    } catch {
        // Storage unavailable: the choice lasts for this page
    }
}

// Shows the most recently chosen of each group's tabs, and their lines
export function restoreTabs(root: ParentNode) {
    const labels = remembered();
    const groups = [...root.querySelectorAll("[data-tabs]")];
    for (const group of groups) {
        const tabs = tabsOf(group);
        const tab = labels.map(label => tabs.find(t => t.textContent?.trim() === label)).find(Boolean);
        if (tab) selectTab(tab);
        placeLine(group, false);
    }
    // Tabs change their width when the web fonts arrive
    document.fonts?.ready.then(() => groups.forEach(group => group.isConnected && placeLine(group, false)));
}

// Arrow keys, Home and End move between the tabs of a group
export function tabKeydown(event: KeyboardEvent): HTMLElement | undefined {
    const tab = (event.target as HTMLElement).closest<HTMLElement>("[role=tab]");
    const group = tab?.closest("[data-tabs]");
    if (!tab || !group) return undefined;
    const tabs = tabsOf(group);
    const i = tabs.indexOf(tab);
    const next = {ArrowRight: tabs[(i + 1) % tabs.length], ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length], Home: tabs[0], End: tabs.at(-1)}[event.key];
    if (!next) return undefined;
    event.preventDefault();
    next.focus();
    return next;
}

// Opens the tabs and folded details an element is hidden in, e.g. a search hit
export function reveal(element: Element) {
    for (let el: Element | null = element; el; el = el.parentElement) {
        if (el.matches("[role=tabpanel][hidden]")) {
            const tab = el.closest("[data-tabs]")?.querySelector<HTMLElement>(`#${CSS.escape(el.getAttribute("aria-labelledby") ?? "")}`);
            if (tab) selectTab(tab);
        }
        if (el instanceof HTMLDetailsElement) el.open = true;
    }
}
