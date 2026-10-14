// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest";
import {contentBuildId, fetchContent} from "../app/assets/content-fetch";

describe("fetchContent", () => {
    afterEach(() => {
        document.head.innerHTML = "";
        vi.unstubAllGlobals();
    });

    const stubFetch = () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    };

    it("bypasses the cache without a build id", async () => {
        const fetchMock = stubFetch();
        await fetchContent("/docs/a.md");
        expect(fetchMock).toHaveBeenCalledWith("/docs/a.md", {cache: "no-store"});
    });

    it("versions the URL with the build id and lets the browser cache it", async () => {
        document.head.innerHTML = '<meta name="clay-build" content="abc 123">';
        const fetchMock = stubFetch();

        expect(contentBuildId()).toBe("abc 123");
        await fetchContent("/docs/a.md");
        await fetchContent("/search?x=1");
        expect(fetchMock).toHaveBeenNthCalledWith(1, "/docs/a.md?v=abc%20123", {cache: "force-cache"});
        expect(fetchMock).toHaveBeenNthCalledWith(2, "/search?x=1&v=abc%20123", {cache: "force-cache"});
    });

    it("ignores an empty build id", async () => {
        document.head.innerHTML = '<meta name="clay-build" content="">';
        const fetchMock = stubFetch();
        await fetchContent("/a");
        expect(fetchMock).toHaveBeenCalledWith("/a", {cache: "no-store"});
    });
});
