import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, extname, join, resolve} from "node:path";
import type {Configuration} from "../common/configuration";
import {loadCanvas} from "./social-images";

// Icons from the favicon in clay.yaml, drawn when the site is built: a
// favicon.ico, since Google Search does not show SVG favicons, and the icon iOS
// puts on the home screen, which has to be a PNG. Browsers keep using the
// favicon itself, which can be an SVG that stays sharp at every size.

// Where the icons are published, relative to the site's base path
export type SiteIcons = { ico?: string, appleTouchIcon?: string };
export const ICO_PATH = "favicon.ico";
export const APPLE_TOUCH_ICON_PATH = "_clay/icons/apple-touch-icon.png";

const DRAWABLE = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp"]);
// The background of the light theme (app/assets/css/themes.css): iOS fills transparent icons with black
const LIGHT_BACKGROUND = "#fffdfd";

// An ICO file with PNG images, as Windows Vista and every browser since read them
export function icoFile(images: { size: number, png: Buffer }[]): Buffer {
    const header = Buffer.alloc(6 + 16 * images.length);
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(images.length, 4);
    let offset = header.length;
    images.forEach(({size, png}, i) => {
        const entry = 6 + 16 * i;
        header.writeUInt8(size >= 256 ? 0 : size, entry); // width, 0 for 256
        header.writeUInt8(size >= 256 ? 0 : size, entry + 1); // height
        header.writeUInt16LE(1, entry + 4); // color planes
        header.writeUInt16LE(32, entry + 6); // bits per pixel
        header.writeUInt32LE(png.length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += png.length;
    });
    return Buffer.concat([header, ...images.map(image => image.png)]);
}

// Writes the icons into target (published with the site) and returns their paths;
// none without a favicon Skia can read
export async function writeIcons(root: string, config: Configuration, target: string): Promise<SiteIcons> {
    const canvas = loadCanvas();
    const favicon = config.favicon;
    if (!canvas || !favicon || /^[a-z]+:\/\//i.test(favicon)) return {};
    const file = resolve(root, favicon);
    if (!DRAWABLE.has(extname(file).toLowerCase()) || !file.startsWith(root) || !existsSync(file)) return {};

    let picture: Awaited<ReturnType<typeof canvas.loadImage>>;
    try {
        picture = await canvas.loadImage(readFileSync(file));
    } catch {
        return {};
    }
    // The favicon, as large as fits, centered in a square of the given size
    const draw = (size: number, inner = size, background?: string) => {
        const image = canvas.createCanvas(size, size);
        const ctx = image.getContext("2d");
        if (background) {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, size, size);
        }
        const scale = Math.min(inner / picture.width, inner / picture.height);
        const [w, h] = [picture.width * scale, picture.height * scale];
        ctx.drawImage(picture, (size - w) / 2, (size - h) / 2, w, h);
        return image.encodeSync("png");
    };

    const background = config.theme?.light?.background ?? config.theme?.background ?? LIGHT_BACKGROUND;
    const write = (path: string, data: Buffer) => {
        mkdirSync(dirname(join(target, path)), {recursive: true});
        writeFileSync(join(target, path), data);
    };
    write(ICO_PATH, icoFile([16, 32, 48].map(size => ({size, png: draw(size)}))));
    write(APPLE_TOUCH_ICON_PATH, draw(180, 140, /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(background) ? background : LIGHT_BACKGROUND));
    return {ico: ICO_PATH, appleTouchIcon: APPLE_TOUCH_ICON_PATH};
}
