// "clay edit": a full-screen editor for the order, titles and icons of pages
// and folders, and for the settings in clay.yaml. The model lives in lib/editor.ts.
import {emitKeypressEvents} from "node:readline";
import {createJiti} from "jiti";
import {GRAY, MINT, SAGE, rgb} from "./colors.mjs";

const color = !("NO_COLOR" in process.env);
const paint = (code, text) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
const sage = text => paint(rgb(...SAGE), text);
const mint = text => paint(rgb(...MINT), text);
const gray = text => paint(rgb(...GRAY), text);
const bold = text => paint("1", text);
const yellow = text => paint("33", text);

const HELP = {
    pages: "↑↓ select · m move · ←→ fold · ⏎ title · i icon · tab settings · s save · q quit",
    moving: "↑↓ move · ⏎ drop",
    settings: "↑↓ select · ⏎ edit · d remove link · tab pages · s save · q quit",
};

const chars = text => [...text];
const width = text => chars(text.replace(/\x1b\[[0-9;]*m/g, "")).length;
const pad = (text, size) => text + " ".repeat(Math.max(size - width(text), 0));

// Cuts a line with color codes to the terminal width
function fit(line, columns) {
    let visible = 0;
    let out = "";
    for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
        if (part.startsWith("\x1b[")) {
            out += part;
            continue;
        }
        for (const char of part) {
            if (visible >= columns) return out + (color ? "\x1b[0m" : "");
            out += char;
            visible++;
        }
    }
    return out;
}

export async function edit(root) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error("clay edit needs an interactive terminal.");
        process.exit(1);
    }
    const editor = await createJiti(import.meta.url).import("../lib/editor.ts");

    let original = editor.loadDocsTree(root);
    let tree = structuredClone(original);
    let settings = editor.loadSettings(root);
    let savedDoc = editor.loadSettings(root).doc;
    const collapsed = new Set();
    let tab = "pages";
    let selected = {pages: 0, settings: 1};
    let scroll = 0;
    let input = null; // {label, value: [...chars], cursor, placeholder, done(value)}
    let message = "";
    let confirmQuit = false;
    let moving = false; // the selected entry is picked up and moves with ↑↓

    // Visible tree rows with what is needed to move them
    const pageRows = () => {
        const rows = [];
        const walk = (nodes, depth, parent) => nodes.forEach((node, index) => {
            rows.push({node, depth, siblings: nodes, index, parent});
            if (node.isDir && !collapsed.has(node.path)) walk(node.children, depth + 1, node);
        });
        walk(tree, 0, null);
        return rows;
    };
    const settingRows = () => editor.settingRows(settings.doc);
    const selectable = row => row.kind !== "section";

    const changeCount = () => editor.docsChanges(original, tree).length + (editor.settingsChanged(settings) ? 1 : 0);
    const changedPaths = () => new Set(editor.docsChanges(original, tree).map(change => change.path));

    function render() {
        const columns = process.stdout.columns || 80;
        const height = Math.max((process.stdout.rows || 24) - 5, 3);
        const tabs = ["pages", "settings"].map(name => {
            const label = name[0].toUpperCase() + name.slice(1);
            return name === tab ? bold(sage(label)) : gray(label);
        }).join("   ");
        const lines = [`${gray("┌")}  ${bold("Clay")} ${gray("· edit")}   ${tabs}`, gray("│")];

        let body;
        if (tab === "pages") {
            const changed = changedPaths();
            const rows = pageRows();
            const titleWidth = Math.min(Math.max(...rows.map(({node, depth}) => depth * 3 + 2 + width(node.title ?? node.fallbackTitle)), 10) + 2, 48);
            body = rows.map(({node, depth}, i) => {
                const isSelected = i === selected.pages;
                const marker = node.isDir ? (collapsed.has(node.path) ? "▸" : "▾") : "◆";
                const title = node.title ?? gray(node.fallbackTitle);
                const label = `${gray("│  ".repeat(depth))}${isSelected ? mint(marker) : sage(marker)} ${isSelected ? bold(title) : title}`;
                const icon = node.icon ? gray(node.icon) : "";
                const status = `${changed.has(node.path) ? ` ${yellow("•")}` : ""}${isSelected && moving ? ` ${sage("↕ moving")}` : ""}`;
                return `${isSelected ? sage("›") : " "} ${pad(label, titleWidth)}${icon}${status}`;
            });
        } else {
            const rows = settingRows();
            const labelWidth = Math.max(...rows.map(row => width(row.label))) + 4;
            body = rows.map((row, i) => {
                const isSelected = i === selected.settings;
                const cursor = isSelected ? sage("›") : " ";
                if (row.kind === "section") return `  ${bold(row.label)}`;
                if (row.kind === "add-link") return `${cursor}   ${sage("+")} ${isSelected ? bold(row.label) : row.label}`;
                const value = editor.getSetting(settings.doc, row.path);
                const changed = value !== editor.getSetting(savedDoc, row.path);
                const label = pad(isSelected ? bold(row.label) : row.label, labelWidth);
                return `${cursor}   ${label}${value || gray("—")}${changed ? ` ${yellow("•")}` : ""}`;
            });
        }

        // Keep the selection in view
        const current = selected[tab];
        if (current < scroll) scroll = current;
        if (current >= scroll + height) scroll = current - height + 1;
        scroll = Math.max(Math.min(scroll, body.length - height), 0);
        lines.push(...body.slice(scroll, scroll + height).map(line => `${gray("│")} ${line}`));
        lines.push(gray("│"));

        if (input) {
            const value = input.value.length || !input.placeholder ? input.value : null;
            const text = value
                ? value.map((char, i) => i === input.cursor ? paint("7", char) : char).join("") + (input.cursor === value.length ? paint("7", " ") : "")
                : paint("7", " ") + gray(input.placeholder);
            lines.push(`${gray("└")}  ${input.label}: ${text}`, `   ${gray("⏎ apply · esc cancel · empty resets")}`);
        } else if (confirmQuit) {
            lines.push(`${gray("└")}  ${yellow(`${changeCount()} unsaved change(s).`)} s save and quit · d discard · esc keep editing`, "");
        } else {
            const count = changeCount();
            lines.push(`${gray("└")}  ${gray(HELP[moving ? "moving" : tab])}`, `   ${message || (count ? yellow(`${count} unsaved change(s)`) : gray("No changes"))}`);
        }

        process.stdout.write("\x1b[H" + lines.map(line => fit(line, columns) + "\x1b[K").join("\n") + "\x1b[J");
    }

    function ask(label, value, placeholder, done) {
        input = {label, value: chars(value ?? ""), cursor: chars(value ?? "").length, placeholder, done};
    }

    function save() {
        const written = [...editor.saveDocs(root, editor.docsChanges(original, tree)), ...(editor.saveSettings(root, settings) ? ["clay.yaml"] : [])];
        original = editor.loadDocsTree(root);
        tree = structuredClone(original);
        settings = editor.loadSettings(root);
        savedDoc = editor.loadSettings(root).doc;
        message = written.length ? sage(`Saved ${written.length} file(s): ${written.join(", ")}`) : gray("Nothing to save");
    }

    function quit() {
        process.stdout.write("\x1b[?25h\x1b[?1049l");
        process.exit(0);
    }

    function onInput(text, key) {
        if (key.name === "return") {
            const value = input.value.join("").trim();
            const done = input.done;
            input = null;
            done(value);
        } else if (key.name === "escape" || (key.ctrl && key.name === "c")) input = null;
        else if (key.name === "backspace") {
            if (input.cursor > 0) input.value.splice(--input.cursor, 1);
        } else if (key.name === "delete") input.value.splice(input.cursor, 1);
        else if (key.name === "left") input.cursor = Math.max(input.cursor - 1, 0);
        else if (key.name === "right") input.cursor = Math.min(input.cursor + 1, input.value.length);
        else if (key.name === "home" || (key.ctrl && key.name === "a")) input.cursor = 0;
        else if (key.name === "end" || (key.ctrl && key.name === "e")) input.cursor = input.value.length;
        else if (key.ctrl && key.name === "u") {
            input.value.splice(0, input.cursor);
            input.cursor = 0;
        } else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) {
            input.value.splice(input.cursor, 0, ...chars(text));
            input.cursor += chars(text).length;
        }
    }

    function onPages(key) {
        const rows = pageRows();
        const row = rows[selected.pages];
        if (!row) return;
        const select = node => selected.pages = Math.max(pageRows().findIndex(r => r.node === node), 0);

        // Moves stay within the folder; terminals that keep Shift/Alt+arrows to themselves use "m"
        if ((key.name === "up" || key.name === "down") && (moving || key.shift || key.meta)) {
            const target = row.index + (key.name === "up" ? -1 : 1);
            if (target < 0 || target >= row.siblings.length) return;
            [row.siblings[row.index], row.siblings[target]] = [row.siblings[target], row.siblings[row.index]];
            select(row.node);
        } else if (moving) {
            if (["return", "space", "escape", "m"].includes(key.name)) moving = false;
        } else if (key.name === "m" || key.name === "space") moving = true;
        else if (key.name === "up" || key.name === "k") selected.pages = Math.max(selected.pages - 1, 0);
        else if (key.name === "down" || key.name === "j") selected.pages = Math.min(selected.pages + 1, rows.length - 1);
        else if (key.name === "left") {
            if (row.node.isDir && !collapsed.has(row.node.path)) collapsed.add(row.node.path);
            else if (row.parent) select(row.parent);
        } else if (key.name === "right" && row.node.isDir) collapsed.delete(row.node.path);
        else if (key.name === "return" || key.name === "t") {
            const from = row.node.isDir ? "folder name" : "first heading";
            ask("Title", row.node.title, `${row.node.fallbackTitle} (from the ${from})`, value => row.node.title = value || undefined);
        } else if (key.name === "i") {
            ask("Icon", row.node.icon, `${row.node.isDir ? "fa-solid fa-folder" : "fa-solid fa-file"} (default)`, value => row.node.icon = value || undefined);
        }
    }

    function onSettings(key) {
        const rows = settingRows();
        const row = rows[selected.settings];
        const step = delta => {
            let i = selected.settings + delta;
            while (rows[i] && !selectable(rows[i])) i += delta;
            if (rows[i]) selected.settings = i;
        };

        if (key.name === "up" || key.name === "k") step(-1);
        else if (key.name === "down" || key.name === "j") step(1);
        else if (key.name === "return" && row.kind === "add-link") {
            editor.addLink(settings.doc);
            selected.settings = settingRows().findIndex(r => r.kind === "add-link") - 3;
        } else if (key.name === "return") {
            ask(row.label, editor.getSetting(settings.doc, row.path), "not set", value => editor.setSetting(settings.doc, row.path, value));
        } else if ((key.name === "d" || key.name === "delete") && row.link !== undefined) {
            editor.removeLink(settings.doc, row.link);
            const updated = settingRows();
            selected.settings = Math.min(selected.settings, updated.length - 1);
            while (selected.settings > 0 && !selectable(updated[selected.settings])) selected.settings--;
        }
    }

    function onKey(text, key = {}) {
        message = "";
        if (input) onInput(text, key);
        else if (moving) onPages(key);
        else if (confirmQuit) {
            if (key.name === "s") {
                save();
                quit();
            } else if (key.name === "d" || (key.ctrl && key.name === "c")) quit();
            else if (key.name === "escape") confirmQuit = false;
        } else if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
            if (changeCount() > 0) confirmQuit = true;
            else quit();
        } else if (key.name === "s") save();
        else if (key.name === "tab") {
            tab = tab === "pages" ? "settings" : "pages";
            scroll = 0;
        } else if (tab === "pages") onPages(key);
        else onSettings(key);
        render();
    }

    process.stdout.write("\x1b[?1049h\x1b[?25l");
    process.on("exit", () => process.stdout.write("\x1b[?25h\x1b[?1049l"));
    process.stdout.on("resize", render);
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", (text, key) => {
        try {
            onKey(text, key);
        } catch (error) {
            message = paint("31", error.message);
            render();
        }
    });
    render();
}
