import {describe, expect, it} from "vitest";
import {contentColor, mixColors, themeCss, themeWarnings} from "../../common/theme";
import {socialColors} from "../../lib/social-images";

describe("theme", () => {
    it("keeps Clay's look without one", () => {
        expect(themeCss(undefined)).toBe("");
        expect(themeCss({})).toBe("");
    });

    it("sets colors for both modes, or one, above daisyUI's theme rules", () => {
        const css = themeCss({primary: "#2563eb", dark: {background: "#0b1120"}});
        expect(css).toContain(':root:root[data-theme="clay-light"]{--color-primary:#2563eb;--color-primary-content:#ffffff');
        expect(css).toContain("@media (prefers-color-scheme:dark){:root:root:not([data-theme]){--color-primary:#2563eb");
        expect(css).toContain("--color-base-100:#0b1120");
        expect(css.slice(0, css.indexOf("clay-dark"))).not.toContain("#0b1120");
    });

    it("sets corners and fonts, without letting a font end the style", () => {
        expect(themeCss({radius: "0", font: "Inter, sans-serif", codeFont: "Fira Code}</style>"}))
            .toBe(":root:root{--radius-box:0;--radius-field:calc(0 / 2);--radius-selector:calc(0 / 2);--font-sans:Inter, sans-serif;--font-mono:Fira Code/style}");
    });

    it("reports values it cannot use", () => {
        expect(themeWarnings({primary: "blue", radius: "round", dark: {text: "#fff"}})).toEqual([
            'clay.yaml: theme.primary "blue" is not a color like "#0e7c5a"; it is ignored',
            'clay.yaml: theme.radius "round" is not a length like "0.5rem"; it is ignored',
        ]);
        expect(themeCss({primary: "blue"})).toBe("");
    });

    it("picks readable text for a color, and mixes colors", () => {
        expect(contentColor("#2563eb")).toBe("#ffffff");
        expect(contentColor("#fde047")).toBe("#000000");
        expect(mixColors("#000000", "#ffffff", 0.5)).toBe("#808080");
    });

    it("colors the social images like the dark theme", () => {
        expect(socialColors(undefined).background).toBe("#191414");
        expect(socialColors({primary: "#2563eb"})).toMatchObject({background: "#191414", primary: "#2563eb"});
        expect(socialColors({dark: {background: "#0b1120", text: "#e2e8f0"}})).toMatchObject({background: "#0b1120", text: "#e2e8f0"});
    });
});

describe("theme fonts", () => {
    it("are the first font of a list, unless it is a generic one", async () => {
        const {firstFamily} = await import("../../lib/fonts");
        expect(firstFamily('"Lora", Georgia, serif')).toBe("Lora");
        expect(firstFamily("serif")).toBeUndefined();
        expect(firstFamily(undefined)).toBeUndefined();
    });
});
