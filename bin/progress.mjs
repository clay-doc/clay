// Build progress for "clay build": parses the output of "nuxt generate" into
// steps and shows them as a tree, with a spinner on the step that is running.
import {GRAY, MINT, SAGE, rgb} from "./colors.mjs";

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

// One line of Nuxt output without colors. In CI, Nuxt's logger writes "[info] …",
// "[warn] [clay] …" and "[error] …" instead of icons and badges; these turn
// into the usual form.
function normalize(raw) {
    let text = raw.replace(ANSI, "").trim();
    const level = text.match(/^\[(info|success|start|ready|log|debug|warn|error|fail|fatal)\]\s*/);
    if (level) {
        text = text.slice(level[0].length);
        if (level[1] === "warn" && text.startsWith("[clay]")) text = text.replace(/^\[clay\]\s*/, "[clay] WARN ");
        else if (level[1] === "warn") text = `WARN ${text}`;
        else if (["error", "fail", "fatal"].includes(level[1])) text = `ERROR ${text}`;
    }
    return text.replace(/^\[nitro\]/, "").trim();
}

const CLAY_WARNING = /^\[clay\]\s+(?:WARN|⚠)\s+(.*)$/;
const CLAY_LOADED = /^\[clay\].*?(\d+) pages? in (.+?)(?:; (.+))?$/;
const loaded = match => ({type: "done", label: `Loaded ${match[1]} ${match[1] === "1" ? "page" : "pages"} from ${match[2]}`, detail: match[3]});

// Turns one line of Nuxt output into progress events (none for noise)
export function createBuildParser() {
    let routes = 0;
    let inErrors = false;
    let failedRequest = null; // a page that failed to render; its cause follows on the next line
    const errors = new Set();

    return function parse(raw) {
        const text = normalize(raw);
        let match;

        // Nitro lists each failed route again after "Errors prerendering:"
        if (inErrors && !/^ERROR\s/.test(text)) return text ? [{type: "error", text}] : [];
        inErrors = false;

        // The cause of a failed page, reported once for all pages it breaks
        // (in CI the cause carries an [error] prefix of its own)
        if (failedRequest && text && !text.startsWith("at ") && !/^ERROR\s+\[request error\]/.test(text)) {
            const page = failedRequest;
            const cause = text.replace(/^ERROR\s+/, "");
            failedRequest = null;
            if (errors.has(cause)) return [];
            errors.add(cause);
            return [{type: "error", text: `${cause} (rendering ${page})`}];
        }
        if ((match = text.match(/^ERROR\s+\[request error\].*?\[GET\]\s+https?:\/\/[^/]+(\S*)/))) {
            failedRequest = match[1] || "/";
            return [];
        }
        if (/^ERROR\s/.test(text)) {
            const message = text.replace(/^ERROR\s+/, "");
            if (errors.has(message)) return [];
            errors.add(message);
            return [{type: "error", text: message}];
        }
        if (text === "Errors prerendering:") {
            inErrors = true;
            return [];
        }
        if ((match = text.match(CLAY_WARNING))) return [{type: "warn", text: match[1]}];
        if ((match = text.match(CLAY_LOADED))) return [loaded(match)];
        if (/Building Nuxt for production/.test(text)) return [{type: "step", label: "Loading docs"}];
        if ((match = text.match(/Building (client|server)\.\.\./))) return [{type: "step", label: `Building ${match[1]}`}];
        if ((match = text.match(/(\d+) modules transformed/))) return [{type: "detail", text: `${match[1]} modules`}];
        if ((match = text.match(/(Client|Server) built in/))) return [{type: "done", label: `Built ${match[1].toLowerCase()}`}];
        if (/Initializing prerenderer/.test(text)) {
            routes = 0;
            return [{type: "step", label: "Prerendering pages"}];
        }
        if (/^├─ \S+/.test(text) && !text.endsWith("(skipped)")) {
            routes++;
            return [{type: "detail", text: `${routes} ${routes === 1 ? "route" : "routes"}`}];
        }
        if ((match = text.match(/Prerendered (\d+) routes?/))) return [{type: "done", label: "Prerendered pages", detail: `${match[1]} routes`}];
        if ((match = text.match(/Generated public (.+)$/))) return [{type: "output", dir: match[1]}];
        return [];
    };
}

// Turns one line of "nuxt dev" output into events: steps while the server
// starts, then a log of reloads, warnings and errors (none for noise)
export function createDevParser() {
    let ready = false;
    let skip = 0; // lines of a notice to leave out
    let failedRequest = null; // a page that failed to render; its cause follows on the next line

    return function parse(raw) {
        const text = normalize(raw);
        let match;
        if (skip > 0 && text) {
            skip--;
            return [];
        }
        if (!text || text === "│" || text.startsWith("at ")) return [];

        if (failedRequest && !/^ERROR\s+\[request error\]/.test(text)) {
            const page = failedRequest;
            failedRequest = null;
            return [{type: "error", text: `${text.replace(/^ERROR\s+/, "")} (rendering ${page})`}];
        }
        if ((match = text.match(/^ERROR\s+\[request error\].*?\[GET\]\s+https?:\/\/[^/]+(\S*)/))) {
            failedRequest = match[1] || "/";
            return [];
        }
        if ((match = text.match(/^ERROR\s+(.*)$/))) return [{type: "error", text: match[1]}];
        // A reminder to update browser data, which is up to Clay's releases
        if (/^WARN\s+Browserslist/.test(text)) {
            skip = 2;
            return [];
        }
        if ((match = text.match(/^WARN\s+(.*)$/))) return [{type: "warn", text: match[1]}];

        if (/^(?:●\s+)?Nuxt \d/.test(text)) return [{type: "step", label: "Loading docs"}];
        if ((match = text.match(/^➜\s+(Local|Network):\s+(.+)$/))) return [{type: "url", label: match[1], url: match[2]}];
        if ((match = text.match(CLAY_WARNING))) return [{type: "warn", text: match[1]}];
        if ((match = text.match(CLAY_LOADED))) return [loaded(match)];
        if ((match = text.match(/^\[clay\]\s+\S+\s+Reloaded (.+)$/))) return [{type: "log", icon: "↻", text: `Reloaded ${match[1]}`}];
        if (/Nitro server built in/.test(text)) {
            if (ready) return [];
            ready = true;
            return [{type: "ready", label: "Started dev server"}];
        }
        // Vite's and Nitro's own progress, and the banner of daisyUI
        if (/Vite (client|server) (built|warmed up)|\bhmr\b|daisyUI/i.test(text)) return [];
        return [{type: "log", text}];
    };
}

// Spinner and shimmer from granum: an arc turning while a highlight sweeps the text
const ARC_FRAMES = ["◜", "◠", "◝", "◞", "◡", "◟"];
const SHIMMER_BRIGHT = MINT;
const SHIMMER_DIM = SAGE;
const SHIMMER_WIDTH = 5;
const FRAME_MS = 60;

function shimmer(text, pos) {
    return [...text].map((char, i) => {
        const blend = Math.min(Math.abs(i - pos) / SHIMMER_WIDTH, 1);
        const [r, g, b] = SHIMMER_BRIGHT.map((bright, c) => Math.round(bright + (SHIMMER_DIM[c] - bright) * blend));
        return `\x1b[${rgb(r, g, b)}m${char}`;
    }).join("") + "\x1b[39m";
}

function duration(ms) {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const clock = ms => new Date(ms).toTimeString().slice(0, 8);

// Renders progress events; without a terminal (e.g. in CI) it prints finished steps only.
// "build" ends with the result; "serve" (dev and preview) starts a server, shows
// its address once it is ready and then logs what happens until it stops.
// hint follows a failure, e.g. how to see the full output.
export function createProgress(title, {stream = process.stdout, now = Date.now, mode = "build", hint = ""} = {}) {
    const serve = mode === "serve";
    const tty = Boolean(stream.isTTY);
    const color = tty && !("NO_COLOR" in process.env);
    const paint = (code, text) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
    const sage = text => paint(rgb(...SAGE), text);
    const gray = text => paint(rgb(...GRAY), text);
    const bar = gray("│");

    const started = now();
    let current = null;
    let outDir = null;
    let ready = false;
    const urls = [];
    let frame = 0;
    let timer = null;
    const errors = [];

    const spinnerLine = () => {
        const text = `${ARC_FRAMES[frame % ARC_FRAMES.length]}  ${current.label}${current.detail ? ` · ${current.detail}` : ""}`;
        const fitted = [...text].slice(0, Math.max((stream.columns || 80) - 1, 10)).join("");
        const span = fitted.length + SHIMMER_WIDTH * 2;
        return color ? shimmer(fitted, (frame % span) - SHIMMER_WIDTH) : fitted;
    };
    const draw = () => {
        if (tty && current) stream.write(`\r\x1b[2K${spinnerLine()}`);
    };
    // Permanent output goes above the spinner
    const print = lines => {
        if (tty) stream.write("\r\x1b[2K");
        stream.write(lines.map(line => `${line}\n`).join(""));
        draw();
    };
    const restoreCursor = () => tty && stream.write("\x1b[?25h");

    const start = label => {
        current = {label, detail: null, started: now(), warnings: []};
        draw();
    };
    const complete = (label, lines = []) => {
        const {detail, started: stepStarted, warnings} = current;
        const info = [detail, duration(now() - stepStarted)].filter(Boolean).join(" · ");
        current = null;
        print([`${sage("●")}  ${label}  ${gray(info)}`, ...warnings.map(warning => `${bar}  ${paint("33", "▲")} ${warning}`), ...lines, bar]);
    };
    // Once a server runs, each event is a line of its own, with the time
    const log = (icon, text) => print([`${bar}  ${icon ? `${icon} ` : ""}${text}  ${gray(clock(now()))}`]);

    print([`${gray("┌")}  ${paint("1", title)}`, bar]);
    if (tty) {
        stream.write("\x1b[?25l");
        process.on("exit", restoreCursor);
        timer = setInterval(() => {
            frame++;
            draw();
        }, FRAME_MS);
        timer.unref();
    }

    return {
        apply(event) {
            switch (event.type) {
                case "step":
                    if (current && !current.idle) complete(current.label);
                    start(event.label);
                    break;
                case "detail":
                    if (current) current.detail = event.text;
                    break;
                case "done":
                    if (!current) start(event.label);
                    if (event.detail) current.detail = event.detail;
                    complete(event.label);
                    if (ready) break;
                    // Nuxt keeps working until the next step is announced
                    start(serve ? "Starting dev server" : "Building");
                    current.idle = true;
                    break;
                case "url":
                    urls.push(event);
                    break;
                case "ready":
                    // How long the server took to start, from the very beginning
                    if (!current) start(event.label);
                    current.started = started;
                    complete(event.label, urls.map(({label, url}) =>
                        `${bar}  ${gray("➜")} ${`${label}:`.padEnd(9)}${/^https?:/.test(url) ? paint("1", url) : gray(url)}`));
                    ready = true;
                    break;
                case "log":
                    if (ready) log(event.icon ? sage(event.icon) : "", event.icon ? event.text : gray(event.text));
                    break;
                case "warn":
                    if (ready) log(paint("33", "▲"), event.text);
                    else if (current) current.warnings.push(event.text);
                    else print([`${bar}  ${paint("33", "▲")} ${event.text}`]);
                    break;
                case "error":
                    // A server keeps running after most errors, so they show right away
                    if (serve) ready ? log(paint("31", "✖"), paint("31", event.text)) : print([`${bar}  ${paint("31", "✖")} ${paint("31", event.text)}`]);
                    else errors.push(event.text);
                    break;
                case "output":
                    outDir = event.dir;
                    break;
            }
        },
        finish(code, signal) {
            clearInterval(timer);
            const step = current;
            current = null;
            if (tty) stream.write("\r\x1b[2K");
            const total = duration(now() - started);
            if (serve && (code === 0 || signal || code === 130)) {
                stream.write(`${gray("└")}  Stopped\n`);
            } else if (serve) {
                stream.write([
                    `${paint("31", "✖")}  ${step && !step.idle ? step.label : "Server"}`,
                    bar,
                    `${gray("└")}  Stopped after ${total}.${hint ? ` ${hint}` : ""}`,
                ].map(line => `${line}\n`).join(""));
            } else if (code === 0) {
                stream.write(`${gray("└")}  Built ${outDir ?? "the site"} in ${total}\n`);
            } else {
                const failed = step && !step.idle ? step.label : "Build";
                stream.write([
                    `${paint("31", "✖")}  ${failed}`,
                    ...(step?.warnings ?? []).map(warning => `${bar}  ${paint("33", "▲")} ${warning}`),
                    // Nitro lists every failed page; the first ones show the pattern
                    ...errors.slice(0, 16).map(error => `${bar}  ${paint("31", error)}`),
                    ...(errors.length > 16 ? [`${bar}  ${gray(`… ${errors.length - 16} more lines`)}`] : []),
                    bar,
                    signal
                        ? `${gray("└")}  Build cancelled`
                        : `${gray("└")}  Build failed after ${total}. Run "clay build --verbose" for the full output.`,
                ].map(line => `${line}\n`).join(""));
            }
            restoreCursor();
        },
    };
}
