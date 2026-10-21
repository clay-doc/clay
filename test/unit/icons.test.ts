import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {APPLE_TOUCH_ICON_PATH, ICO_PATH, icoFile, writeIcons} from "../../lib/icons";
import {loadCanvas} from "../../lib/social-images";

const PNG = (size: number) => Buffer.from(`png of ${size}`);

describe("icoFile", () => {
    it("lists PNG images by size, as an ICO file", () => {
        const ico = icoFile([{size: 16, png: PNG(16)}, {size: 256, png: PNG(256)}]);
        expect([...ico.subarray(0, 6)]).toEqual([0, 0, 1, 0, 2, 0]);
        // First entry: 16 × 16, 32 bits, its data right after the directory
        expect(ico.readUInt8(6)).toBe(16);
        expect(ico.readUInt16LE(6 + 6)).toBe(32);
        expect(ico.readUInt32LE(6 + 12)).toBe(6 + 32);
        // 256 is written as 0
        expect(ico.readUInt8(22)).toBe(0);
        expect(ico.subarray(ico.readUInt32LE(22 + 12)).toString()).toBe("png of 256");
    });
});

describe("writeIcons", () => {
    const project = (favicon: string, content: string) => {
        const root = mkdtempSync(join(tmpdir(), "clay-icons-"));
        mkdirSync(join(root, "img"));
        writeFileSync(join(root, favicon), content);
        return root;
    };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><rect width="10" height="20" fill="#009764"/></svg>';

    it("draws favicon.ico and the iOS home screen icon from the favicon", async () => {
        const root = project("img/logo.svg", svg), target = join(root, "out");
        expect(await writeIcons(root, {title: "T", favicon: "img/logo.svg", theme: {light: {background: "#123456"}}}, target))
            .toEqual({ico: ICO_PATH, appleTouchIcon: APPLE_TOUCH_ICON_PATH});
        const ico = readFileSync(join(target, ICO_PATH));
        expect(ico.readUInt16LE(4)).toBe(3);
        expect([0, 1, 2].map(i => ico.readUInt8(6 + 16 * i))).toEqual([16, 32, 48]);

        // 180 × 180 on the theme's light background, the logo centered without stretching
        const canvas = loadCanvas()!;
        const icon = await canvas.loadImage(readFileSync(join(target, APPLE_TOUCH_ICON_PATH)));
        expect([icon.width, icon.height]).toEqual([180, 180]);
        const ctx = canvas.createCanvas(180, 180).getContext("2d");
        ctx.drawImage(icon, 0, 0);
        const pixel = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data.subarray(0, 3)];
        expect(pixel(5, 90)).toEqual([0x12, 0x34, 0x56]);
        expect(pixel(90, 90)).toEqual([0x00, 0x97, 0x64]);
        expect(pixel(40, 90)).toEqual([0x12, 0x34, 0x56]);
    });

    it("draws nothing without a favicon Skia can read", async () => {
        const root = project("img/logo.ico", "not an image"), target = join(root, "out");
        expect(await writeIcons(root, {title: "T", favicon: "img/logo.ico"}, target)).toEqual({});
        expect(await writeIcons(root, {title: "T"}, target)).toEqual({});
        expect(await writeIcons(root, {title: "T", favicon: "https://x.dev/icon.png"}, target)).toEqual({});
        expect(existsSync(target)).toBe(false);
    });
});
