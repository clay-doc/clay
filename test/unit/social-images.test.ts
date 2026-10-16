import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {loadSite} from "../../lib/site";
import {socialCard, socialImagePath} from "../../lib/social-card";
import {cjkLocale, drawSocialImage} from "../../lib/social-images";

const site = loadSite("playground", {gitDates: false, env: {}});
const page = (route: string) => site.pages.find(p => p.route === route)!;

describe("social cards", () => {
    it("show the site, section, title and description of a page", () => {
        expect(socialCard(page("/reference/feature-tour"), site)).toEqual({
            site: "Clay", section: "Reference", title: "Feature Tour",
            description: "Every Markdown feature Clay renders, on one page.", language: "en",
        });
        expect(socialImagePath("/reference/feature-tour")).toBe("/_clay/social/reference/feature-tour.png");
        expect(socialImagePath("/")).toBe("/_clay/social/index.png");
    });

    it("are only made with siteURL and without socialImages: false", () => {
        const configs = (config: object) => ({...site, configs: {en: {...site.config, ...config}, de: {...site.config, ...config}}});
        expect(socialCard(page("/reference/feature-tour"), configs({siteURL: undefined}))).toBeUndefined();
        expect(socialCard(page("/reference/feature-tour"), configs({socialImages: false}))).toBeUndefined();
    });

    it("are made for Chinese, Japanese and Korean, not for scripts the fonts lack", () => {
        const titled = (title: string) => ({...page("/reference/feature-tour"), title});
        expect(socialCard(titled("クイックスタート：最初のサイト"), site)).toBeDefined();
        expect(socialCard(titled("스니펫과 변수"), site)).toBeDefined();
        expect(socialCard(titled("البدء"), site)).toBeUndefined();
        expect(socialCard(titled("Launch 🚀"), site)).toBeUndefined();
    });

    it("pick the font of a language for Han letters", () => {
        expect(["ja", "ko", "zh", "zh-TW", "zh-Hant", "zh-HK", "de"].map(cjkLocale)).toEqual(["ja-JP", "ko-KR", "zh-CN", "zh-TW", "zh-TW", "zh-HK", undefined]);
    });

    it("are drawn as PNG images", async () => {
        const png = await drawSocialImage({site: "Clay", section: "Guides", title: "Setup", description: "How to set up.", language: "en"},
            undefined, mkdtempSync(join(tmpdir(), "clay-social-")));
        expect(png.subarray(1, 4).toString()).toBe("PNG");
    });
});
