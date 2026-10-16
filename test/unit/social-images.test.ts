import {existsSync, mkdtempSync, readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {loadSite} from "../../lib/site";
import {cardFamilies, hanFamily, socialCard, socialImagePath, type SocialCard} from "../../lib/social-card";
import {drawSocialImage, loadCanvas, writeSocialImages} from "../../lib/social-images";

const site = loadSite("playground", {gitDates: false, env: {}});
const page = (route: string) => site.pages.find(p => p.route === route)!;
const cache = () => mkdtempSync(join(tmpdir(), "clay-social-"));
const card = (title: string, language = "en", description = ""): SocialCard => ({site: "Clay", section: "Guides", title, description, language});

// Pixels in a part of the image that differ from the background: text was drawn there
async function inked(png: Buffer, x: number, y: number, width: number, height: number): Promise<number> {
    const canvas = loadCanvas()!;
    const image = await canvas.loadImage(png);
    const ctx = canvas.createCanvas(1200, 630).getContext("2d");
    ctx.drawImage(image, 0, 0);
    const {data} = ctx.getImageData(x, y, width, height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i]! - 0x19) + Math.abs(data[i + 1]! - 0x14) + Math.abs(data[i + 2]! - 0x14) > 60) count++;
    return count;
}

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

    it("are made for every script that has a font, and emoji", () => {
        const titled = (title: string) => ({...page("/reference/feature-tour"), title});
        for (const title of ["クイックスタート：最初のサイト", "스니펫과 변수", "البدء", "התחלה", "शुरुआत", "เริ่มต้น", "Launch 🚀", "Ελληνικά, Русский"]) {
            expect(socialCard(titled(title), site), title).toBeDefined();
        }
        // Old Italic has no font on Google Fonts' list here
        expect(socialCard(titled("𐌀𐌁𐌂"), site)).toBeUndefined();
    });

    it("name the fonts a text needs besides Inter", () => {
        expect(cardFamilies("Tabs and Code Groups › Ελληνικά", "en")).toEqual([]);
        expect(cardFamilies("علامات التبويب npm", "ar")).toEqual(["Noto Sans Arabic"]);
        expect(cardFamilies("Quick Start ⚡ ✅", "en")).toEqual(["Noto Color Emoji"]);
        expect(cardFamilies("タブとコード", "ja")).toEqual(["Noto Sans JP"]);
        expect(cardFamilies("标签页和代码组：", "zh-CN")).toEqual(["Noto Sans SC"]);
        expect(cardFamilies("हिन्दी, עברית", "en")).toEqual(["Noto Sans Devanagari", "Noto Sans Hebrew"]);
    });

    it("pick the font of a language for Han letters", () => {
        expect(["ja", "ko", "zh", "zh-TW", "zh-Hant", "zh-HK", "de"].map(hanFamily))
            .toEqual(["Noto Sans JP", "Noto Sans KR", "Noto Sans SC", "Noto Sans TC", "Noto Sans TC", "Noto Sans TC", "Noto Sans SC"]);
    });
});

describe("social images", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("are drawn as PNG images with Clay's own font, offline", async () => {
        vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
        const png = await drawSocialImage(card("Setup", "en", "How to set up."), undefined, cache());
        expect(png.subarray(1, 4).toString()).toBe("PNG");
        // The title, at the left, and nothing at the right of a short title
        expect(await inked(png, 80, 380, 300, 100)).toBeGreaterThan(500);
        expect(await inked(png, 800, 380, 320, 100)).toBe(0);
    });

    it("draw right-to-left pages mirrored, and other scripts and emoji with fonts from Google Fonts", async () => {
        const dir = cache();
        const arabic = await drawSocialImage(card("علامات التبويب", "ar"), undefined, dir);
        // Right-to-left: the title ends at the right edge
        expect(await inked(arabic, 820, 380, 300, 140)).toBeGreaterThan(500);
        expect(await inked(arabic, 80, 380, 300, 140)).toBe(0);
        for (const text of ["टैब और कोड समूह", "Launch 🚀✅"]) {
            const png = await drawSocialImage(card(text), undefined, dir);
            expect(await inked(png, 80, 380, 300, 140), text).toBeGreaterThan(500);
        }
        // The fonts were fetched once, with just these letters
        expect(readdirSync(dir).filter(file => file.startsWith("font-")).length).toBeGreaterThanOrEqual(3);
    }, 60_000);

    it("leave out texts whose fonts cannot be fetched, and do not keep those images", async () => {
        vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
        const dir = cache(), target = mkdtempSync(join(tmpdir(), "clay-social-site-"));
        const arabic = {...page("/reference/feature-tour"), title: "علامات التبويب", language: "en"};
        const result = await writeSocialImages({...site, pages: [page("/reference/feature-tour"), arabic]}, target, dir);
        expect(result.warning).toMatch(/Noto Sans Arabic get images without that text/);
        expect(existsSync(join(target, "_clay/social/reference/feature-tour.png"))).toBe(true);
        // Only the image with all its text is kept for the next build
        expect(readdirSync(dir).filter(file => file.endsWith(".png"))).toHaveLength(1);
        expect(result.drawn).toBe(1);
    });
});
