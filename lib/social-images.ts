import {createHash} from "node:crypto";
import {copyFileSync, existsSync, mkdirSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, extname, join, resolve} from "node:path";
import {writeFile} from "node:fs/promises";
import satori from "satori";
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

export async function drawSocialImage(card: SocialCard, logo?: string): Promise<Buffer> {
    const svg = await satori(layout(card, logo) as never, {width: SOCIAL_IMAGE_WIDTH, height: SOCIAL_IMAGE_HEIGHT, fonts: loadFonts()});
    return new Resvg(svg, {fitTo: {mode: "width", value: SOCIAL_IMAGE_WIDTH}}).render().asPng();
}

// Draws the image of every page into target (published with the site), reusing
// images from cacheDir whose text has not changed. Returns how many were drawn.
export async function writeSocialImages(site: Site, target: string, cacheDir: string): Promise<{ drawn: number, total: number }> {
    const logo = logoOf(site);
    const jobs = site.pages.flatMap(page => {
        const card = socialCard(page, site);
        return card ? [{card, path: socialImagePath(page.route)}] : [];
    });
    mkdirSync(cacheDir, {recursive: true});
    let drawn = 0;
    // A few at a time: drawing is mostly synchronous work
    for (let i = 0; i < jobs.length; i += 8) {
        await Promise.all(jobs.slice(i, i + 8).map(async ({card, path}) => {
            const key = createHash("sha256").update(JSON.stringify([DESIGN, card, logo])).digest("hex").slice(0, 16);
            const cached = join(cacheDir, `${key}.png`);
            if (!existsSync(cached)) {
                await writeFile(cached, await drawSocialImage(card, logo));
                drawn++;
            }
            const file = join(target, path);
            mkdirSync(dirname(file), {recursive: true});
            copyFileSync(cached, file);
        }));
    }
    return {drawn, total: jobs.length};
}
