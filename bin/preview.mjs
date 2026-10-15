// Serves a built site the way static hosts such as GitHub Pages do: under the
// base URL, "/page" redirects to "/page/", unknown paths get 404.html with 404.
import {createReadStream, existsSync, readFileSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {extname, join, normalize, relative, sep} from "node:path";
import {load} from "js-yaml";
import {createProgress} from "./progress.mjs";

const TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
    ".css": "text/css", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".pdf": "application/pdf",
};

export function basePath(root) {
    const config = load(readFileSync(join(root, "clay.yaml"), "utf8")) ?? {};
    // Same precedence as the build: the environment overrides clay.yaml
    const trimmed = String(process.env.CLAY_BASE_URL || config.baseURL || "").replace(/^\/+|\/+$/g, "");
    return trimmed ? `/${trimmed}/` : "/";
}

// onNotFound hears of each path that has no file
export function createPreviewServer(publicDir, base, {onNotFound} = {}) {
    const send = (res, status, file) => {
        res.writeHead(status, {"content-type": TYPES[extname(file)] ?? "application/octet-stream"});
        createReadStream(file).pipe(res);
    };
    const notFound = (res, pathname) => {
        onNotFound?.(pathname);
        const page = join(publicDir, "404.html");
        if (existsSync(page)) send(res, 404, page);
        else res.writeHead(404).end("Not found");
    };

    return createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        let pathname;
        try {
            pathname = decodeURIComponent(url.pathname);
        } catch {
            return notFound(res, url.pathname);
        }

        if (pathname + "/" === base) return res.writeHead(301, {location: base + url.search}).end();
        if (!pathname.startsWith(base)) return notFound(res, pathname);

        const file = normalize(join(publicDir, pathname.slice(base.length)));
        if (file !== publicDir && !file.startsWith(publicDir + sep)) return notFound(res, pathname);
        if (!existsSync(file)) return notFound(res, pathname);

        if (statSync(file).isDirectory()) {
            if (!pathname.endsWith("/")) return res.writeHead(301, {location: url.pathname + "/" + url.search}).end();
            const index = join(file, "index.html");
            return existsSync(index) ? send(res, 200, index) : notFound(res, pathname);
        }
        send(res, 200, file);
    });
}

export async function preview({root, out, port, host, title}) {
    const publicDir = join(out, "public");
    if (!existsSync(publicDir)) {
        console.error(`No build found in ${publicDir}. Run "clay build" first.`);
        process.exit(1);
    }
    const base = basePath(root);
    const progress = createProgress(title, {mode: "serve"});
    const server = createPreviewServer(publicDir, base, {onNotFound: path => progress.apply({type: "warn", text: `404 ${path}`})});
    progress.apply({type: "step", label: "Starting preview server"});
    try {
        await new Promise((done, fail) => server.once("error", fail).listen(port, host, done));
    } catch (error) {
        progress.apply({type: "error", text: error.code === "EADDRINUSE" ? `Port ${port} is in use; pick another with --port` : error.message});
        progress.finish(1);
        process.exit(1);
    }
    progress.apply({type: "url", label: "Local", url: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}${base}`});
    if (host !== "0.0.0.0") progress.apply({type: "url", label: "Network", url: "use --host to expose"});
    progress.apply({type: "ready", label: `Serving ${relative(process.cwd(), publicDir) || publicDir}`});
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
        progress.finish(0, signal);
        process.exit(0);
    });
}
