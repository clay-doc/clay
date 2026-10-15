import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import type {AddressInfo} from "node:net";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {basePath, createPreviewServer} from "../../lib/preview";

const publicDir = mkdtempSync(join(tmpdir(), "clay-preview-"));
for (const [path, content] of Object.entries({
    "index.html": "home",
    "404.html": "not found page",
    "guides/index.html": "guides",
    "docs/img/a.svg": "<svg/>",
})) {
    mkdirSync(dirname(join(publicDir, path)), {recursive: true});
    writeFileSync(join(publicDir, path), content);
}

describe("preview server", () => {
    const server = createPreviewServer(publicDir, "/repo/");
    let origin = "";

    beforeAll(async () => {
        await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise(done => server.close(done)));

    const get = (path: string) => fetch(origin + path, {redirect: "manual"});

    it.each([
        ["/repo/", 200, "home"],
        ["/repo/guides/", 200, "guides"],
        ["/repo/docs/img/a.svg", 200, "<svg/>"],
        ["/repo/missing/", 404, "not found page"],
        ["/elsewhere/", 404, "not found page"],
        ["/repo/../../etc/passwd", 404, "not found page"],
    ])("%s answers %i", async (path, status, body) => {
        const res = await get(path);
        expect(res.status).toBe(status);
        expect(await res.text()).toBe(body);
    });

    it.each([
        ["/repo", "/repo/"],
        ["/repo/guides", "/repo/guides/"],
        ["/repo/guides?highlight=x", "/repo/guides/?highlight=x"],
    ])("redirects %s to %s like GitHub Pages", async (path, location) => {
        const res = await get(path);
        expect(res.status).toBe(301);
        expect(res.headers.get("location")).toBe(location);
    });

    it("serves files with their content type", async () => {
        expect((await get("/repo/docs/img/a.svg")).headers.get("content-type")).toBe("image/svg+xml");
    });
});

describe("basePath", () => {
    it("lets CLAY_BASE_URL override clay.yaml, like the build", () => {
        const root = mkdtempSync(join(tmpdir(), "clay-base-"));
        writeFileSync(join(root, "clay.yaml"), "title: T\nbaseURL: /repo/\n");
        process.env.CLAY_BASE_URL = "/other/";
        try {
            expect(basePath(root)).toBe("/other/");
        } finally {
            delete process.env.CLAY_BASE_URL;
        }
    });

    it.each([["/repo/", "/repo/"], ["repo", "/repo/"], ["/", "/"], ["", "/"]])("baseURL %j => %j", (baseURL, expected) => {
        const root = mkdtempSync(join(tmpdir(), "clay-base-"));
        writeFileSync(join(root, "clay.yaml"), `title: T\nbaseURL: "${baseURL}"\n`);
        expect(basePath(root)).toBe(expected);
    });
});
