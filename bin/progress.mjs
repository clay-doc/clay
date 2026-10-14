// Build progress for "clay build": parses the output of "nuxt generate" into
// steps and shows them as a tree, with a spinner on the step that is running.
import {GRAY, MINT, SAGE, rgb} from "./colors.mjs";

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

// Turns one line of Nuxt output into progress events (none for noise)
export function createBuildParser() {
    let routes = 0;
    let inErrors = false;
    const errors = new Set();

    return function parse(raw) {
        const text = raw.replace(ANSI, "").replace(/^\[nitro\]/, "").trim();
        let match;

        // Nitro lists each failed route again after "Errors prerendering:"
        if (inErrors && !/^ERROR\s/.test(text)) return text ? [{type: "error", text}] : [];
        inErrors = false;

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
        if ((match = text.match(/^\[clay\]\s+(?:WARN|⚠)\s+(.*)$/))) return [{type: "warn", text: match[1]}];
        if ((match = text.match(/^\[clay\].*?(\d+) pages? in (.+?)(?:; (.+))?$/))) {
            return [{type: "done", label: `Loaded ${match[1]} ${match[1] === "1" ? "page" : "pages"} from ${match[2]}`, detail: match[3]}];
        }
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

// Renders progress events; without a terminal (e.g. in CI) it prints finished steps only
export function createProgress(title, {stream = process.stdout, now = Date.now} = {}) {
    const tty = Boolean(stream.isTTY);
    const color = tty && !("NO_COLOR" in process.env);
    const paint = (code, text) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
    const sage = text => paint(rgb(...SAGE), text);
    const gray = text => paint(rgb(...GRAY), text);
    const bar = gray("│");

    const started = now();
    let current = null;
    let outDir = null;
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
    const complete = label => {
        const {detail, started: stepStarted, warnings} = current;
        const info = [detail, duration(now() - stepStarted)].filter(Boolean).join(" · ");
        current = null;
        print([`${sage("●")}  ${label}  ${gray(info)}`, ...warnings.map(warning => `${bar}  ${paint("33", "▲")} ${warning}`), bar]);
    };

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
                    // Nuxt keeps working until the next step is announced
                    start("Building");
                    current.idle = true;
                    break;
                case "warn":
                    if (current) current.warnings.push(event.text);
                    else print([`${bar}  ${paint("33", "▲")} ${event.text}`]);
                    break;
                case "error":
                    errors.push(event.text);
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
            if (code === 0) {
                stream.write(`${gray("└")}  Built ${outDir ?? "the site"} in ${total}\n`);
            } else {
                const failed = step && !step.idle ? step.label : "Build";
                stream.write([
                    `${paint("31", "✖")}  ${failed}`,
                    ...(step?.warnings ?? []).map(warning => `${bar}  ${paint("33", "▲")} ${warning}`),
                    ...errors.map(error => `${bar}  ${paint("31", error)}`),
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
