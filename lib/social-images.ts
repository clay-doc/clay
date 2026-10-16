import {createHash} from "node:crypto";
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, extname, join, resolve} from "node:path";
import {writeFile} from "node:fs/promises";
import satori, {type SatoriOptions} from "satori";
import {Resvg} from "@resvg/resvg-js";
import {SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH, socialCard, socialImagePath, type SocialCard} from "./social-card";
import type {Site} from "./site";

// Social images: a picture for each page that chats and social networks show
// with links to it, drawn at build time with satori (layout to SVG) and resvg
// (SVG to PNG), in the colors of the dark theme (app/assets/css/themes.css)

const COLORS = {background: "#191414", text: "#cac9c9", muted: "#9a9696", primary: "#009764"};
// Bumped when the look changes, so cached images are drawn again
const DESIGN = "1";

const require = createRequire(import.meta.url);
const SUBSETS = ["latin", "latin-ext", "greek", "greek-ext", "cyrillic", "cyrillic-ext", "vietnamese"];

let fonts: { name: string, data: Buffer, weight: 400 | 700, style: "normal" }[] | undefined;
function loadFonts() {
    const dir = join(dirname(require.resolve("@fontsource/inter/package.json")), "files");
    return fonts ??= SUBSETS.flatMap(subset => ([400, 700] as const).map(weight =>
        ({name: "Inter", data: readFileSync(join(dir, `inter-${subset}-${weight}-normal.woff`)), weight, style: "normal" as const})));
}

type Font = SatoriOptions["fonts"][number];

// Chinese, Japanese and Korean fonts are too large to ship with Clay (50 to 85 MB
// each). The build fetches just the letters it draws from Google Fonts, once:
// they are kept in the cache. Han letters follow the language of the page.
const CJK_FAMILIES: Record<string, string> = {
    "ja-JP": "Noto Sans JP", "ko-KR": "Noto Sans KR", "zh-CN": "Noto Sans SC", "zh-TW": "Noto Sans TC", "zh-HK": "Noto Sans TC",
};

export function cjkLocale(language: string): string | undefined {
    const code = language.toLowerCase();
    if (code.startsWith("ja")) return "ja-JP";
    if (code.startsWith("ko")) return "ko-KR";
    if (/^zh-(tw|hant)/.test(code)) return "zh-TW";
    if (code.startsWith("zh-hk")) return "zh-HK";
    if (code.startsWith("zh")) return "zh-CN";
    return undefined;
}

async function fetchFont(family: string, weight: number, text: string): Promise<Buffer> {
    const query = `family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(`https://fonts.googleapis.com/css2?${query}`)).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) throw new Error(`no font for ${family}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${family}: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

// The fonts for the CJK letters of a card, both weights, used for the language
// satori asks for (lang); throws when they cannot be fetched
async function cjkFonts(locale: string, lang: string | undefined, text: string, cacheDir: string): Promise<Font[]> {
    const family = CJK_FAMILIES[locale];
    if (!family) return [];
    const letters = [...new Set(text.replace(/\s/g, ""))].sort().join("");
    return Promise.all(([400, 700] as const).map(async weight => {
        const key = createHash("sha256").update(`${family} ${weight} ${letters}`).digest("hex").slice(0, 16);
        const file = join(cacheDir, `font-${key}.ttf`);
        if (!existsSync(file)) writeFileSync(file, await fetchFont(family, weight, letters));
        return {name: family, data: readFileSync(file), weight, style: "normal" as const, ...(lang ? {lang: lang as Font["lang"]} : {})};
    }));
}

const MIME: Record<string, string> = {".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"};

// The site's logo as a data URL, or undefined when there is none satori can show
function logoOf(site: Site): string | undefined {
    const logo = site.config.navbar?.logo ?? site.config.favicon;
    if (!logo || /^[a-z]+:\/\//i.test(logo)) return undefined;
    const file = resolve(site.root, logo);
    const type = MIME[extname(file).toLowerCase()];
    if (!type || !file.startsWith(site.root) || !existsSync(file)) return undefined;
    return `data:${type};base64,${readFileSync(file).toString("base64")}`;
}

type Node = { type: string, props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown, props: Record<string, unknown> = {}): Node =>
    ({type, props: {...props, style, children}});

function layout(card: SocialCard, logo: string | undefined): Node {
    return el("div", {
        width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "72px 80px", backgroundColor: COLORS.background, color: COLORS.text, fontFamily: "Inter",
        borderBottom: `12px solid ${COLORS.primary}`,
    }, [
        el("div", {display: "flex", alignItems: "center", gap: 24, fontSize: 34, color: COLORS.muted}, [
            ...(logo ? [el("img", {width: 64, height: 64, objectFit: "contain"}, undefined, {src: logo, width: 64, height: 64})] : []),
            el("div", {display: "flex"}, card.site),
        ]),
        el("div", {display: "flex", flexDirection: "column", gap: 20}, [
            ...(card.section ? [el("div", {display: "flex", fontSize: 30, color: COLORS.primary, fontWeight: 700}, card.section)] : []),
            el("div", {display: "block", fontSize: card.title.length > 40 ? 60 : 72, fontWeight: 700, lineHeight: 1.1, color: "#ffffff", lineClamp: 2}, card.title),
            ...(card.description ? [el("div", {display: "block", fontSize: 32, lineHeight: 1.4, lineClamp: 3}, card.description)] : []),
        ]),
    ]);
}

// Draws a card; cacheDir keeps the fonts fetched for Chinese, Japanese and Korean
export async function drawSocialImage(card: SocialCard, logo: string | undefined, cacheDir: string): Promise<Buffer> {
    const svg = await satori(layout(card, logo) as never, {
        width: SOCIAL_IMAGE_WIDTH, height: SOCIAL_IMAGE_HEIGHT, fonts: loadFonts(),
        // Han letters and punctuation are shared by Chinese, Japanese and Korean: a page's language decides
        loadAdditionalAsset: async (code, segment) => {
            const known = CJK_FAMILIES[code] !== undefined;
            if (!known && !CJK.test(segment)) return [];
            const letters = [card.site, card.section, card.title, card.description].join("").replace(CJK_OTHER, "");
            return cjkFonts(cjkLocale(card.language) ?? (known ? code : "zh-CN"), known ? code : undefined, letters, cacheDir);
        },
    });
    return new Resvg(svg, {fitTo: {mode: "width", value: SOCIAL_IMAGE_WIDTH}}).render().asPng();
}

// Chinese, Japanese and Korean letters and punctuation; CJK_OTHER is everything else, which Inter draws
const CJK = /[\u1100-\u11FF\u3000-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/u;
const CJK_OTHER = /[^\u1100-\u11FF\u3000-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/gu;

// Without the fonts for Chinese, Japanese and Korean (offline), a card keeps only its other texts
const withoutCjk = (card: SocialCard): SocialCard => ({
    ...card, ...Object.fromEntries((["site", "section", "title", "description"] as const).map(key => [key, CJK.test(card[key]) ? "" : card[key]])),
});

// Draws the image of every page into target (published with the site), reusing
// images from cacheDir whose text has not changed. Returns how many were drawn,
// and a warning when fonts could not be fetched.
export async function writeSocialImages(site: Site, target: string, cacheDir: string): Promise<{ drawn: number, total: number, warning?: string }> {
    const logo = logoOf(site);
    const jobs = site.pages.flatMap(page => {
        const card = socialCard(page, site);
        return card ? [{card, path: socialImagePath(page.route)}] : [];
    });
    mkdirSync(cacheDir, {recursive: true});
    let drawn = 0;
    let warning: string | undefined;
    // A few at a time: drawing is mostly synchronous work
    for (let i = 0; i < jobs.length; i += 8) {
        await Promise.all(jobs.slice(i, i + 8).map(async ({card, path}) => {
            const key = createHash("sha256").update(JSON.stringify([DESIGN, card, logo])).digest("hex").slice(0, 16);
            const cached = join(cacheDir, `${key}.png`);
            const file = join(target, path);
            mkdirSync(dirname(file), {recursive: true});
            if (!existsSync(cached)) {
                try {
                    await writeFile(cached, await drawSocialImage(card, logo, cacheDir));
                } catch (error) {
                    // Drawn without those texts, and not kept: the next build tries again
                    warning = `Social images: fonts for Chinese, Japanese and Korean could not be loaded from Google Fonts (${(error as Error).message}); their pages get images without that text`;
                    await writeFile(file, await drawSocialImage(withoutCjk(card), logo, cacheDir));
                    return;
                }
                drawn++;
            }
            copyFileSync(cached, file);
        }));
    }
    return {drawn, total: jobs.length, warning};
}
