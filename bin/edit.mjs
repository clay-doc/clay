// "clay edit": a full-screen editor for the docs of every version and language
// (pages, folders, their front matter, order, translations) and for the
// settings in clay.yaml. Changes are written right away. The model lives in
// lib/editor.ts.
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
const red = text => paint("31", text);

const HELP = {
    pages: "⏎ details · n page · f folder · m order · o move · r rename · x delete · v/V version · l language · tab · q",
    translate: "c translate",
    moving: "↑↓ move · ⏎ drop · esc cancel",
    details: "↑↓ select · ⏎ edit · esc back",
    pick: "↑↓ select · ⏎ move here · esc cancel",
    settings: "⏎ edit · d remove link · l language · tab pages · q quit",
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

// Front matter fields the details view edits; cards and hero only apply to index.md
const FIELDS = [
    {key: "title", label: "Title", type: "text"},
    {key: "icon", label: "Icon", type: "text"},
    {key: "description", label: "Description", type: "text"},
    {key: "order", label: "Order", type: "number", defaultOnly: true},
    {key: "cards", label: "Cards of the folder's pages", type: "boolean", index: true},
    {key: "hero", label: "Large header (hero)", type: "boolean", index: true},
];

export async function edit(root) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error("clay edit needs an interactive terminal.");
        process.exit(1);
    }
    const editor = await createJiti(import.meta.url).import("../lib/editor.ts");
    let {versions, languages} = editor.editorContext(root);
    const edition = {version: "", language: languages[0]};
    const isDefaultLanguage = () => edition.language === languages[0];

    let tree = editor.loadDocsTree(root, edition);
    let settings = editor.loadSettings(root);
    const collapsed = new Set();
    let tab = "pages";
    let mode = "list"; // list, moving, details, pick, confirm
    const selected = {pages: 0, settings: 1, details: 0, pick: 0};
    let scroll = 0;
    let input = null; // {label, value: [...chars], cursor, placeholder, done(value)}
    let confirm = null; // {question, yes()}
    let picks = []; // folders to move an entry into
    let message = "";

    // Visible tree rows with what is needed to move them
    const pageRows = () => {
        const rows = [];
        const walk = (nodes, depth, parent) => nodes.forEach((node, index) => {
            rows.push({node, depth, siblings: nodes, index, parent});
            if (node.kind === "folder" && !collapsed.has(node.path)) walk(node.children, depth + 1, node);
        });
        walk(tree, 0, null);
        return rows;
    };
    const currentRow = () => pageRows()[selected.pages];
    const detailFields = node => FIELDS.filter(field => (!field.index || node.kind !== "page") && (!field.defaultOnly || isDefaultLanguage()))
        .filter(field => !(field.key === "order" && node.kind === "start"));
    const settingRows = () => editor.settingRows(settings.doc);
    const selectable = row => row.kind !== "section";
    const editionLabel = () => `${edition.version || "latest"} · ${edition.language}`;

    // Reloads the tree after a write, keeping the selection on the same entry
    function reload(path = currentRow()?.node.path) {
        tree = editor.loadDocsTree(root, edition);
        const index = pageRows().findIndex(row => row.node.path === path);
        selected.pages = Math.max(index, 0);
    }

    function run(action) {
        try {
            action();
        } catch (error) {
            message = red(error.message);
        }
    }

    const done = (text, files = []) => message = sage(`${text}${files.length ? `: ${files.join(", ")}` : ""}`);
    const reportBroken = broken => broken.length === 0 ? "" : ` · ${yellow(`${broken.length} link(s) broke`)}: ${broken[0]}${broken.length > 1 ? " …" : ""}`;

    function render() {
        const columns = process.stdout.columns || 80;
        const height = Math.max((process.stdout.rows || 24) - 5, 3);
        const tabs = ["pages", "settings"].map(name => {
            const label = name[0].toUpperCase() + name.slice(1);
            return name === tab ? bold(sage(label)) : gray(label);
        }).join("   ");
        const lines = [`${gray("┌")}  ${bold("Clay")} ${gray("· edit")}   ${tabs}   ${gray(editionLabel())}`, gray("│")];

        let body;
        let current = 0;
        if (mode === "details") {
            const node = currentRow().node;
            const fields = detailFields(node);
            lines.push(`${gray("│")}   ${bold(node.frontMatter.title ?? node.fallbackTitle)} ${gray(node.file)}${node.exists ? "" : ` ${yellow("(not created yet)")}`}`, gray("│"));
            body = fields.map((field, i) => {
                const value = field.key === "order" ? node.order : node.frontMatter[field.key];
                const shown = value === undefined ? gray("—") : String(value);
                return `${i === selected.details ? sage("›") : " "}   ${pad(i === selected.details ? bold(field.label) : field.label, 30)}${shown}`;
            });
            current = selected.details;
        } else if (mode === "pick") {
            lines.push(`${gray("│")}   Move ${bold(currentRow().node.name)} to:`, gray("│"));
            body = picks.map((folder, i) => `${i === selected.pick ? sage("›") : " "}   ${i === selected.pick ? bold(`docs/${folder}`) : `docs/${folder}`}`);
            current = selected.pick;
        } else if (tab === "pages") {
            const rows = pageRows();
            const titleWidth = Math.min(Math.max(...rows.map(({node, depth}) => depth * 3 + 2 + width(node.frontMatter.title ?? node.fallbackTitle)), 10) + 2, 48);
            body = rows.map(({node, depth}, i) => {
                const isSelected = i === selected.pages;
                const marker = node.kind === "start" ? "⌂" : node.kind === "folder" ? (collapsed.has(node.path) ? "▸" : "▾") : "◆";
                const title = node.frontMatter.title ?? gray(node.fallbackTitle);
                const label = `${gray("│  ".repeat(depth))}${isSelected ? mint(marker) : sage(marker)} ${isSelected ? bold(title) : title}`;
                const missing = !node.exists && (node.kind === "page" || !isDefaultLanguage()) ? ` ${yellow("untranslated")}` : "";
                const icon = node.frontMatter.icon ? gray(node.frontMatter.icon) : "";
                return `${isSelected ? sage("›") : " "} ${pad(label, titleWidth)}${icon}${missing}${isSelected && mode === "moving" ? ` ${sage("↕ moving")}` : ""}`;
            });
            current = selected.pages;
        } else {
            const rows = settingRows();
            const labelWidth = Math.max(...rows.map(row => width(row.label))) + 4;
            body = rows.map((row, i) => {
                const isSelected = i === selected.settings;
                const cursor = isSelected ? sage("›") : " ";
                if (row.kind === "section") return `  ${bold(row.label)}`;
                if (row.kind === "add-link") return `${cursor}   ${sage("+")} ${isSelected ? bold(row.label) : row.label}`;
                const value = editor.getSetting(settings.doc, row.path, edition.language);
                return `${cursor}   ${pad(isSelected ? bold(row.label) : row.label, labelWidth)}${value || gray("—")}`;
            });
            current = selected.settings;
        }

        // Keep the selection in view
        const room = height - (lines.length - 2);
        if (current < scroll) scroll = current;
        if (current >= scroll + room) scroll = current - room + 1;
        scroll = Math.max(Math.min(scroll, body.length - room), 0);
        lines.push(...body.slice(scroll, scroll + room).map(line => `${gray("│")} ${line}`));
        lines.push(gray("│"));

        if (input) {
            const value = input.value.length || !input.placeholder ? input.value : null;
            const text = value
                ? value.map((char, i) => i === input.cursor ? paint("7", char) : char).join("") + (input.cursor === value.length ? paint("7", " ") : "")
                : paint("7", " ") + gray(input.placeholder);
            lines.push(`${gray("└")}  ${input.label}: ${text}`, `   ${gray("⏎ apply · esc cancel · empty removes")}`);
        } else if (confirm) {
            lines.push(`${gray("└")}  ${yellow(confirm.question)} ${gray("y yes · n no")}`, "");
        } else {
            let help = mode === "list" ? HELP[tab] : HELP[mode];
            if (mode === "list" && tab === "pages" && !isDefaultLanguage()) help = `${HELP.translate} · ${help}`;
            lines.push(`${gray("└")}  ${gray(help)}`, `   ${message}`);
        }

        process.stdout.write("\x1b[H" + lines.map(line => fit(line, columns) + "\x1b[K").join("\n") + "\x1b[J");
    }

    function ask(label, value, placeholder, onDone) {
        input = {label, value: chars(value ?? ""), cursor: chars(value ?? "").length, placeholder, done: onDone};
    }

    function quit() {
        process.stdout.write("\x1b[?25h\x1b[?1049l");
        process.exit(0);
    }

    function onInput(text, key) {
        if (key.name === "return") {
            const value = input.value.join("").trim();
            const onDone = input.done;
            input = null;
            run(() => onDone(value));
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

    // Sets one front matter field of an entry and shows what was written
    function setField(node, key, value) {
        if (key === "order") {
            const written = editor.setFields(root, {...edition, language: languages[0]}, {...node, file: node.kind === "page" ? node.path : `${node.path}/index.md`}, {order: value});
            done("Saved", [written]);
        } else {
            done("Saved", [editor.setFields(root, edition, node, {[key]: value})]);
        }
        reload(node.path);
    }

    // The folder new entries go into: the selected folder, or the folder of the selected page
    function targetFolder(row) {
        if (row.node.kind === "folder") return {folder: row.node.path, siblings: row.node.children};
        return {folder: row.parent?.path ?? "", siblings: row.siblings};
    }

    function create(kind) {
        if (!isDefaultLanguage()) {
            message = yellow(`New ${kind === "page" ? "pages" : "folders"} are created in ${languages[0]}; translate them afterwards`);
            return;
        }
        const row = currentRow();
        const {folder, siblings} = row ? targetFolder(row) : {folder: "", siblings: tree};
        ask(`New ${kind} in docs/${folder}${folder ? "/" : ""} · title`, "", "", title => {
            if (!title) return;
            ask("File name", editor.slugify(title), "", slug => {
                if (!slug) return;
                const file = kind === "page"
                    ? editor.createPage(root, edition.version, folder, title, editor.slugify(slug), siblings)
                    : editor.createFolder(root, edition.version, folder, title, editor.slugify(slug), siblings);
                collapsed.delete(folder);
                done("Created", [file]);
                reload(kind === "page" ? file.replace(/^.*?docs\//, "") : file.replace(/^.*?docs\//, "").replace(/\/index\.md$/, ""));
            });
        });
    }

    function onPages(key) {
        const rows = pageRows();
        const row = rows[selected.pages];
        if (!row) return;
        const node = row.node;
        const select = target => selected.pages = Math.max(pageRows().findIndex(r => r.node === target), 0);
        const movable = node.kind !== "start";

        if (mode === "moving") {
            if (key.name === "up" || key.name === "down") {
                const target = row.index + (key.name === "up" ? -1 : 1);
                // The start page stays first
                if (target < 0 || target >= row.siblings.length || row.siblings[target].kind === "start") return;
                [row.siblings[row.index], row.siblings[target]] = [row.siblings[target], row.siblings[row.index]];
                select(node);
            } else if (["return", "space", "m"].includes(key.name)) {
                mode = "list";
                const written = editor.reorder(root, edition.version, row.siblings);
                done(written.length ? "Saved the order" : "Order unchanged", written);
                reload(node.path);
            } else if (key.name === "escape") {
                mode = "list";
                reload(node.path);
            }
            return;
        }

        if (key.name === "up" || key.name === "k") selected.pages = Math.max(selected.pages - 1, 0);
        else if (key.name === "down" || key.name === "j") selected.pages = Math.min(selected.pages + 1, rows.length - 1);
        else if (key.name === "left") {
            if (node.kind === "folder" && !collapsed.has(node.path)) collapsed.add(node.path);
            else if (row.parent) select(row.parent);
        } else if (key.name === "right" && node.kind === "folder") collapsed.delete(node.path);
        else if (key.name === "return") {
            mode = "details";
            selected.details = 0;
        } else if (key.name === "t") {
            ask("Title", node.frontMatter.title, `${node.fallbackTitle} (default)`, value => setField(node, "title", value || null));
        } else if (key.name === "i") {
            ask("Icon", node.frontMatter.icon, "default icon", value => setField(node, "icon", value || null));
        } else if (key.name === "m" || key.name === "space") {
            if (!movable) message = yellow("The start page stays first");
            else if (!isDefaultLanguage()) message = yellow(`The order is the same in every language; change it in ${languages[0]}`);
            else mode = "moving";
        } else if (key.name === "n") create("page");
        else if (key.name === "f") create("folder");
        else if (key.name === "c") {
            if (isDefaultLanguage()) message = yellow("Switch to another language with l to translate");
            else if (node.exists) message = yellow(`${node.file} already exists`);
            else {
                done("Created a copy to translate", [editor.createTranslation(root, edition, node)]);
                reload(node.path);
            }
        } else if (key.name === "r" && movable) {
            const folder = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : "";
            const name = node.kind === "page" ? node.name.replace(/\.md$/i, "") : node.name;
            ask("New file name", name, "", slug => {
                if (!slug || slug === name) return;
                const {moved, broken} = editor.moveEntry(root, edition.version, node, folder, editor.slugify(slug));
                message = sage(`Renamed ${moved.join(", ")}`) + reportBroken(broken);
                reload(node.kind === "page" ? `${folder ? folder + "/" : ""}${editor.slugify(slug)}.md` : `${folder ? folder + "/" : ""}${editor.slugify(slug)}`);
            });
        } else if (key.name === "o" && movable) {
            const folders = [""];
            const walk = nodes => nodes.forEach(n => {
                if (n.kind !== "folder" || n === node) return;
                folders.push(n.path);
                walk(n.children);
            });
            walk(tree);
            picks = folders;
            selected.pick = 0;
            mode = "pick";
        } else if ((key.name === "x" || key.name === "delete") && movable) {
            const what = node.kind === "folder"
                ? `docs/${node.path}/ and all ${editor.countFiles(root, edition.version, node.path)} files in it`
                : `docs/${node.path} and its translations`;
            confirm = {
                question: `Delete ${what}?`,
                yes: () => {
                    const {deleted, broken} = editor.deleteEntry(root, edition.version, node);
                    message = sage(`Deleted ${deleted.join(", ")}`) + reportBroken(broken);
                    reload(row.parent?.path ?? "");
                },
            };
        }
    }

    function onDetails(key) {
        const node = currentRow().node;
        const fields = detailFields(node);
        const field = fields[selected.details];
        if (key.name === "escape" || key.name === "left") mode = "list";
        else if (key.name === "up" || key.name === "k") selected.details = Math.max(selected.details - 1, 0);
        else if (key.name === "down" || key.name === "j") selected.details = Math.min(selected.details + 1, fields.length - 1);
        else if (key.name === "return" && field) {
            if (field.type === "boolean") setField(node, field.key, node.frontMatter[field.key] ? null : true);
            else if (field.type === "number") {
                ask(field.label, node.order === undefined ? "" : String(node.order), "none", value => {
                    if (value !== "" && !/^-?\d+$/.test(value)) throw new Error("The order is a whole number");
                    setField(node, "order", value === "" ? null : Number(value));
                });
            } else {
                ask(field.label, node.frontMatter[field.key], field.key === "title" ? `${node.fallbackTitle} (default)` : "not set",
                    value => setField(node, field.key, value || null));
            }
        }
    }

    function onPick(key) {
        if (key.name === "escape") mode = "list";
        else if (key.name === "up" || key.name === "k") selected.pick = Math.max(selected.pick - 1, 0);
        else if (key.name === "down" || key.name === "j") selected.pick = Math.min(selected.pick + 1, picks.length - 1);
        else if (key.name === "return") {
            const node = currentRow().node;
            const folder = picks[selected.pick];
            mode = "list";
            const slug = node.kind === "page" ? node.name.replace(/\.md$/i, "") : node.name;
            const {moved, broken} = editor.moveEntry(root, edition.version, node, folder, slug);
            message = sage(`Moved ${moved.join(", ")}`) + reportBroken(broken);
            collapsed.delete(folder);
            reload(node.kind === "page" ? `${folder ? folder + "/" : ""}${node.name}` : `${folder ? folder + "/" : ""}${node.name}`);
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
        const save = () => {
            if (editor.saveSettings(root, settings)) done("Saved", ["clay.yaml"]);
            settings = editor.loadSettings(root);
        };

        if (key.name === "up" || key.name === "k") step(-1);
        else if (key.name === "down" || key.name === "j") step(1);
        else if (key.name === "return" && row.kind === "add-link") {
            editor.addLink(settings.doc);
            save();
            selected.settings = settingRows().findIndex(r => r.kind === "add-link") - 3;
        } else if (key.name === "return") {
            ask(row.label, editor.getSetting(settings.doc, row.path, edition.language), "not set", value => {
                editor.setSetting(settings.doc, row.path, value, edition.language);
                save();
            });
        } else if ((key.name === "d" || key.name === "delete") && row.link !== undefined) {
            editor.removeLink(settings.doc, row.link);
            save();
            const updated = settingRows();
            selected.settings = Math.min(selected.settings, updated.length - 1);
            while (selected.settings > 0 && !selectable(updated[selected.settings])) selected.settings--;
        }
    }

    // V saves docs/ as a new version in docs-archive/
    function newVersion() {
        ask("Save the current docs as version", "", "e.g. 2.x", name => {
            if (!name) return;
            done("Saved", [editor.createVersion(root, name)]);
            ({versions, languages} = editor.editorContext(root));
        });
    }

    // v and l cycle through the versions and languages
    function switchEdition(key) {
        if (key.name === "v") {
            if (versions.length < 2) return void (message = gray("There are no older versions; V saves one"));
            edition.version = versions[(versions.indexOf(edition.version) + 1) % versions.length];
        } else {
            if (languages.length < 2) return void (message = gray(`The site has one language; add more with "languages" in clay.yaml`));
            edition.language = languages[(languages.indexOf(edition.language) + 1) % languages.length];
        }
        collapsed.clear();
        tree = editor.loadDocsTree(root, edition);
        selected.pages = 0;
        message = sage(`Editing ${editionLabel()}`);
    }

    function onKey(text, key = {}) {
        message = "";
        if (input) onInput(text, key);
        else if (confirm) {
            const {yes} = confirm;
            if (key.name === "y") {
                confirm = null;
                run(yes);
            } else if (key.name === "n" || key.name === "escape") confirm = null;
        } else if (mode === "details") run(() => onDetails(key));
        else if (mode === "pick") run(() => onPick(key));
        else if (mode === "moving") run(() => onPages(key));
        else if (key.name === "q" || (key.ctrl && key.name === "c")) quit();
        else if (key.name === "tab") {
            tab = tab === "pages" ? "settings" : "pages";
            scroll = 0;
        } else if (key.name === "v" && key.shift) newVersion();
        else if (key.name === "v" || key.name === "l") run(() => switchEdition(key));
        else if (tab === "pages") run(() => onPages(key));
        else run(() => onSettings(key));
        render();
    }

    process.stdout.write("\x1b[?1049h\x1b[?25l");
    process.on("exit", () => process.stdout.write("\x1b[?25h\x1b[?1049l"));
    process.stdout.on("resize", render);
    // Esc alone is told apart from arrow keys after this pause (Node's default is 500ms)
    emitKeypressEvents(process.stdin, {escapeCodeTimeout: 30});
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", (text, key) => onKey(text, key));
    render();
}
