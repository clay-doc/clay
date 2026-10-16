import {createHash} from "node:crypto";
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, extname, join, resolve} from "node:path";
import {writeFile} from "node:fs/promises";
import type {SKRSContext2D} from "@napi-rs/canvas";
import {cardFamilies, SOCIAL_IMAGE_HEIGHT as H, SOCIAL_IMAGE_WIDTH as W, socialCard, socialImagePath, type SocialCard} from "./social-card";
import type {Site} from "./site";
import type {ImageFont} from "./fonts";
import {contentColor, mixColors, type ThemeConfiguration} from "../common/theme";

// Social images: a picture for each page that chats and social networks show
// with links to it, drawn at build time with Skia (@napi-rs/canvas), which
// shapes every script, right-to-left text and color emoji, in the colors of the
// dark theme (app/assets/css/themes.css)

export type SocialColors = { background: string, text: string, title: string, muted: string, primary: string };
const COLORS: SocialColors = {background: "#191414", text: "#cac9c9", title: "#ffffff", muted: "#9a9696", primary: "#009764"};

// The colors of the dark theme, with those of "theme" in clay.yaml (common/theme.ts)
export function socialColors(theme: ThemeConfiguration | undefined): SocialColors {
    const hex = (value: string | undefined) => value && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : undefined;
    const background = hex(theme?.dark?.background ?? theme?.background) ?? COLORS.background;
    const text = hex(theme?.dark?.text ?? theme?.text) ?? COLORS.text;
    const primary = hex(theme?.dark?.primary ?? theme?.primary) ?? COLORS.primary;
    if (background === COLORS.background && text === COLORS.text) return {...COLORS, primary};
    return {background, text, primary, title: mixColors(text, contentColor(background), 0.5), muted: mixColors(text, background, 0.3)};
}
// Bumped when the look changes, so cached images are drawn again
const DESIGN = "2";

const require = createRequire(import.meta.url);
type Canvas = typeof import("@napi-rs/canvas");
let canvasModule: Canvas | null | undefined;

// Skia comes as a prebuilt binary for macOS, Linux and Windows; on a platform
// without one, sites are built without social images
export function loadCanvas(): Canvas | undefined {
    if (canvasModule === undefined) {
        try {
            canvasModule = require("@napi-rs/canvas") as Canvas;
        } catch {
            canvasModule = null;
        }
    }
    return canvasModule ?? undefined;
}

// Skia keeps the first font registered under a name, so every font gets its own
const registered = new Set<string>();
function register(canvas: Canvas, data: Buffer, name: string) {
    if (registered.has(name)) return;
    canvas.GlobalFonts.register(data, name);
    registered.add(name);
}

// Inter, as Clay ships it, by script and weight
const SUBSETS = ["latin", "latin-ext", "greek", "greek-ext", "cyrillic", "cyrillic-ext", "vietnamese"];
function interFonts(canvas: Canvas): string[] {
    const dir = join(dirname(require.resolve("@fontsource/inter/package.json")), "files");
    return SUBSETS.map(subset => {
        const name = `Clay Inter ${subset}`;
        for (const weight of [400, 700]) register(canvas, readFileSync(join(dir, `inter-${subset}-${weight}-normal.woff2`)), `${name} ${weight}`);
        return name;
    });
}

// Whole TrueType fonts are too large to ship for every script (Chinese, Japanese
// and Korean are 50 to 85 MB each). The build fetches just the letters it draws
// from Google Fonts, once: they are kept in the cache.
async function fetchFont(family: string, weight: number, text: string): Promise<Buffer> {
    const query = `family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const response = await fetch(`https://fonts.googleapis.com/css2?${query}`);
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(await response.text())?.[1];
    if (!url) throw new Error(`Google Fonts has no ${family} in weight ${weight}`);
    const font = await fetch(url);
    if (!font.ok) throw new Error(`${family}: ${font.status}`);
    return Buffer.from(await font.arrayBuffer());
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

// A family with just the letters of a text, by weight; families without bold
// (like the emoji font) use their regular weight for both
async function scriptFont(canvas: Canvas, family: string, letters: string, cacheDir: string): Promise<string> {
    const name = `Clay ${family} ${hash(letters)}`;
    const files: Partial<Record<400 | 700, Buffer>> = {};
    for (const weight of [400, 700] as const) {
        const file = join(cacheDir, `font-${hash(`${family} ${weight} ${letters}`)}.ttf`);
        if (!existsSync(file)) {
            try {
                writeFileSync(file, await fetchFont(family, weight, letters));
            } catch (error) {
                if (weight === 400) throw error;
                continue;
            }
        }
        files[weight] = readFileSync(file);
    }
    for (const weight of [400, 700] as const) register(canvas, (files[weight] ?? files[400])!, `${name} ${weight}`);
    return name;
}

// The text font from the theme (lib/fonts.ts); Inter draws what it lacks
export type SocialFont = { family: string, fonts: ImageFont[] };

function themeFont(canvas: Canvas, font: SocialFont | undefined): string[] {
    if (!font?.fonts.length) return [];
    const name = `Clay theme ${font.family}`;
    for (const weight of [400, 700] as const) {
        const data = (font.fonts.find(f => f.weight === weight) ?? font.fonts[0])!.data;
        register(canvas, data, `${name} ${weight}`);
    }
    return [name];
}

// Languages written from right to left: the card is laid out mirrored
const RTL = /^(ar|arc|ckb|dv|fa|he|ks|ku-arab|ps|sd|syr|ug|ur|yi)\b/i;

// Breaks a text into at most maxLines lines that fit width, ending with "…" when it is cut
function wrap(ctx: SKRSContext2D, text: string, width: number, maxLines: number, language: string): string[] {
    const lines: string[] = [];
    let line = "";
    for (const {segment} of new Intl.Segmenter(language, {granularity: "word"}).segment(text)) {
        const next = line + segment;
        if (!line.trim() || ctx.measureText(next.trimEnd()).width <= width) {
            line = next;
        } else {
            lines.push(line.trim());
            line = segment.trimStart();
        }
    }
    if (line.trim()) lines.push(line.trim());
    if (lines.length <= maxLines) return lines;
    let last = lines[maxLines - 1]!;
    while (last && ctx.measureText(`${last}…`).width > width) last = [...last].slice(0, -1).join("").trimEnd();
    return [...lines.slice(0, maxLines - 1), `${last}…`];
}

// Inter's metrics: the baseline of a line box of height size × lineHeight, as browsers place it
const ASCENT = 0.96875, CONTENT = 1.2109375;
const baselineIn = (top: number, size: number, lineHeight: number) => top + (size * lineHeight - size * CONTENT) / 2 + size * ASCENT;

// Draws a card: logo and site at the top; section, title and description at the bottom
export async function drawSocialImage(card: SocialCard, logo: Buffer | undefined, cacheDir: string, colors = COLORS,
                                      font?: SocialFont, failed: Set<string> = new Set()): Promise<Buffer> {
    const canvas = loadCanvas();
    if (!canvas) throw new Error("@napi-rs/canvas is not available on this platform");
    const text = [card.site, card.section, card.title, card.description].join("");
    const letters = [...new Set(text.replace(/\s/g, ""))].sort().join("");
    const names = [...themeFont(canvas, font), ...interFonts(canvas)];
    for (const family of cardFamilies(text, card.language) ?? []) {
        if (failed.has(family)) continue;
        names.push(await scriptFont(canvas, family, letters, cacheDir));
    }
    const fonts = (weight: 400 | 700, size: number) => `${weight} ${size}px ${names.map(name => `"${name} ${weight}"`).join(", ")}`;

    const image = canvas.createCanvas(W, H);
    const ctx = image.getContext("2d");
    const rtl = RTL.test(card.language);
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = "start";
    const x = rtl ? W - 80 : 80, width = W - 160;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, H - 12, W, 12);

    // The logo and the site's title, side by side at the top
    let siteX = x;
    if (logo) {
        try {
            const picture = await canvas.loadImage(logo);
            const scale = Math.min(64 / picture.width, 64 / picture.height);
            const [w, h] = [picture.width * scale, picture.height * scale];
            ctx.drawImage(picture, rtl ? x - w : x, 72 + (64 - h) / 2, w, h);
            siteX = rtl ? x - 64 - 24 : x + 64 + 24;
        } catch {
            // a logo Skia cannot read is left out
        }
    }
    ctx.font = fonts(400, 34);
    ctx.fillStyle = colors.muted;
    ctx.fillText(card.site, siteX, baselineIn(72 + (64 - 34 * CONTENT) / 2, 34, CONTENT));

    // From the bottom up: description, title and section, 20 pixels apart
    const titleSize = [...card.title].length > 40 ? 60 : 72;
    ctx.font = fonts(700, titleSize);
    const title = card.title ? wrap(ctx, card.title, width, 2, card.language) : [];
    ctx.font = fonts(400, 32);
    const description = card.description ? wrap(ctx, card.description, width, 3, card.language) : [];
    const blocks = [
        {lines: card.section ? [card.section] : [], weight: 700 as const, size: 30, lineHeight: CONTENT, color: colors.primary},
        {lines: title, weight: 700 as const, size: titleSize, lineHeight: 1.1, color: colors.title},
        {lines: description, weight: 400 as const, size: 32, lineHeight: 1.4, color: colors.text},
    ].filter(block => block.lines.length);
    let top = H - 12 - 72 - blocks.reduce((sum, block) => sum + block.lines.length * block.size * block.lineHeight, 0) - 20 * (blocks.length - 1);
    for (const block of blocks) {
        ctx.font = fonts(block.weight, block.size);
        ctx.fillStyle = block.color;
        for (const line of block.lines) {
            ctx.fillText(line, x, baselineIn(top, block.size, block.lineHeight));
            top += block.size * block.lineHeight;
        }
        top += 20;
    }
    return image.encode("png");
}

const IMAGE_TYPES = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp"]);

// The site's logo, or undefined when there is none to draw
function logoOf(site: Site): Buffer | undefined {
    const logo = site.config.navbar?.logo ?? site.config.favicon;
    if (!logo || /^[a-z]+:\/\//i.test(logo)) return undefined;
    const file = resolve(site.root, logo);
    if (!IMAGE_TYPES.has(extname(file).toLowerCase()) || !file.startsWith(site.root) || !existsSync(file)) return undefined;
    return readFileSync(file);
}

// Draws the image of every page into target (published with the site), reusing
// images from cacheDir whose text has not changed. Returns how many were drawn,
// and a warning when fonts could not be fetched.
export async function writeSocialImages(site: Site, target: string, cacheDir: string, font?: SocialFont): Promise<{ drawn: number, total: number, warning?: string }> {
    const logo = logoOf(site);
    const colors = socialColors(site.config.theme);
    const jobs = site.pages.flatMap(page => {
        const card = socialCard(page, site);
        return card ? [{card, path: socialImagePath(page.route)}] : [];
    });
    mkdirSync(cacheDir, {recursive: true});
    const logoHash = logo ? hash(logo.toString("base64")) : "";
    // Families Google Fonts did not send (offline): their texts are left out
    const failed = new Set<string>();
    let drawn = 0;
    let warning: string | undefined;
    // Without the texts that need fonts Google Fonts did not send
    const without = (card: SocialCard): SocialCard => {
        const keep = (value: string) => cardFamilies(value, card.language)?.some(family => failed.has(family)) ? "" : value;
        return {...card, site: keep(card.site), section: keep(card.section), title: keep(card.title), description: keep(card.description)};
    };
    for (const {card, path} of jobs) {
        const key = hash(JSON.stringify([DESIGN, card, logoHash, colors, font?.family]));
        const cached = join(cacheDir, `${key}.png`);
        const file = join(target, path);
        mkdirSync(dirname(file), {recursive: true});
        if (existsSync(cached)) {
            copyFileSync(cached, file);
            continue;
        }
        const families = cardFamilies([card.site, card.section, card.title, card.description].join(""), card.language) ?? [];
        if (!families.some(family => failed.has(family))) {
            try {
                await writeFile(cached, await drawSocialImage(card, logo, cacheDir, colors, font, failed));
                copyFileSync(cached, file);
                drawn++;
                continue;
            } catch (error) {
                for (const family of families) failed.add(family);
                warning = `Social images: fonts could not be loaded from Google Fonts (${(error as Error).message})`;
            }
        }
        // Drawn without those texts, and not kept: the next build tries again
        await writeFile(file, await drawSocialImage(without(card), logo, cacheDir, colors, font, failed));
    }
    if (warning) warning += `; pages that need ${[...failed].join(", ")} get images without that text`;
    return {drawn, total: jobs.length, warning};
}
