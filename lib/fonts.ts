import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import type {ThemeConfiguration} from "../common/theme";

// The fonts named in "theme" (common/theme.ts). A font on Google Fonts is
// downloaded when the site is built and published with it, so readers get it
// without having it installed, and their browsers never contact Google. Fonts
// that are not on Google Fonts, like Georgia, are used when readers have them.

// Google sends woff2 files split by script to browsers, and whole TrueType files
// to other programs, which is what social images need
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const GENERIC = new Set(["serif", "sans-serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "cursive", "fantasy"]);

export type ImageFont = { name: string, data: Buffer, weight: 400 | 700 };
export type ThemeFonts = {
    faces: string, // @font-face rules, with the files under <base>/_clay/fonts/
    files: { name: string, data: Buffer }[], // to publish in _clay/fonts/
    image?: { family: string, fonts: ImageFont[] }, // the text font for social images
};

// The first font of a font-family list, unless it is a generic one
export function firstFamily(value: string | undefined): string | undefined {
    const first = value?.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
    return first && !GENERIC.has(first.toLowerCase()) ? first : undefined;
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

// A file from Google Fonts, kept in the cache
async function cached(cacheDir: string, name: string, download: () => Promise<Buffer>): Promise<Buffer> {
    const file = join(cacheDir, name);
    if (existsSync(file)) return readFileSync(file);
    const data = await download();
    writeFileSync(file, data);
    return data;
}

async function fetchText(url: string, userAgent?: string): Promise<string | undefined> {
    const response = await fetch(url, userAgent ? {headers: {"user-agent": userAgent}} : {});
    return response.ok ? response.text() : undefined;
}

async function fetchData(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

// The CSS of a family in regular and bold, or of whatever weight it has;
// undefined when Google Fonts does not have it
async function familyCss(cacheDir: string, family: string, userAgent?: string): Promise<string | undefined> {
    const name = `css-${hash(`${family} ${userAgent ?? "ttf"}`)}.css`;
    const file = join(cacheDir, name);
    if (existsSync(file)) return readFileSync(file, "utf8") || undefined;
    const base = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`;
    const css = await fetchText(`${base}:wght@400;700&display=swap`, userAgent) ?? await fetchText(`${base}&display=swap`, userAgent) ?? "";
    writeFileSync(file, css);
    return css || undefined;
}

// Downloads the theme's fonts; warnings receives fonts that could not be downloaded
export async function loadThemeFonts(theme: ThemeConfiguration | undefined, basePath: string, cacheDir: string, warnings: string[]): Promise<ThemeFonts> {
    const result: ThemeFonts = {faces: "", files: []};
    const families = [...new Set([firstFamily(theme?.font), firstFamily(theme?.codeFont)].filter(Boolean) as string[])];
    if (!families.length) return result;
    mkdirSync(cacheDir, {recursive: true});
    const base = basePath.replace(/\/?$/, "/");

    for (const family of families) {
        try {
            const css = await familyCss(cacheDir, family, BROWSER);
            if (!css) continue; // not on Google Fonts
            let faces = css;
            for (const [, url] of css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)) {
                const name = `${hash(url!)}.woff2`;
                result.files.push({name, data: await cached(cacheDir, name, () => fetchData(url!))});
                faces = faces.replace(url!, `${base}_clay/fonts/${name}`);
            }
            result.faces += faces.replace(/\/\*[^*]*\*\//g, "").replace(/\s+/g, " ").trim();

            if (family === firstFamily(theme?.font)) {
                const ttf = await familyCss(cacheDir, family);
                const fonts: ImageFont[] = [];
                for (const [, weight, url] of ttf?.matchAll(/font-weight: (\d+);[^}]*?src: url\((\S+?)\) format\('truetype'\)/g) ?? []) {
                    if (weight !== "400" && weight !== "700") continue;
                    fonts.push({name: family, weight: Number(weight) as 400 | 700, data: await cached(cacheDir, `${hash(url!)}.ttf`, () => fetchData(url!))});
                }
                if (fonts.length) result.image = {family, fonts};
            }
        } catch (error) {
            warnings.push(`theme: "${family}" could not be downloaded from Google Fonts (${(error as Error).message}); readers who do not have it installed see the default font`);
        }
    }
    return result;
}
