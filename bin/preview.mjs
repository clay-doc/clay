// Serves a built site the way static hosts such as GitHub Pages do: under the
// base URL, "/page" redirects to "/page/", unknown paths get 404.html with 404.
import {createReadStream, existsSync, readFileSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {extname, join, normalize, sep} from "node:path";
import {load} from "js-yaml";

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

export function createPreviewServer(publicDir, base) {
    const send = (res, status, file) => {
        res.writeHead(status, {"content-type": TYPES[extname(file)] ?? "application/octet-stream"});
        createReadStream(file).pipe(res);
    };
    const notFound = res => {
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
            return notFound(res);
        }

        if (pathname + "/" === base) return res.writeHead(301, {location: base + url.search}).end();
        if (!pathname.startsWith(base)) return notFound(res);

        const file = normalize(join(publicDir, pathname.slice(base.length)));
        if (file !== publicDir && !file.startsWith(publicDir + sep)) return notFound(res);
        if (!existsSync(file)) return notFound(res);

        if (statSync(file).isDirectory()) {
            if (!pathname.endsWith("/")) return res.writeHead(301, {location: url.pathname + "/" + url.search}).end();
            const index = join(file, "index.html");
            return existsSync(index) ? send(res, 200, index) : notFound(res);
        }
        send(res, 200, file);
    });
}

export async function preview({root, out, port, host}) {
    const publicDir = join(out, "public");
    if (!existsSync(publicDir)) {
        console.error(`No build found in ${publicDir}. Run "clay build" first.`);
        process.exit(1);
    }
    const base = basePath(root);
    const server = createPreviewServer(publicDir, base);
    await new Promise(done => server.listen(port, host, done));
    console.log(`Previewing ${publicDir}\n  ➜ http://${host === "0.0.0.0" ? "localhost" : host}:${port}${base}`);
}
