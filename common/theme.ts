// "theme" in clay.yaml: the site's own colors, corners and fonts, on top of
// Clay's themes (app/assets/css/themes.css). Everything left out keeps Clay's look.

export type ThemeColors = {
    primary?: string, // links, buttons, the marks in the navigation
    background?: string,
    text?: string,
};

export type ThemeConfiguration = ThemeColors & {
    radius?: string, // corners of boxes, e.g. "0.5rem"; fields get half of it
    font?: string, // font-family of the text
    codeFont?: string, // font-family of code
    light?: ThemeColors, // for one mode only; overrides the colors above
    dark?: ThemeColors,
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const LENGTH = /^(?:0|\d*\.?\d+(?:rem|px|em))$/;

function channels(hex: string): [number, number, number] {
    const digits = hex.length === 4 ? [...hex.slice(1)].map(d => d + d).join("") : hex.slice(1);
    return [0, 2, 4].map(i => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
    const [r, g, b] = channels(hex).map(c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

// Black or white, whichever reads better on a color
export function contentColor(hex: string): string {
    const l = luminance(hex);
    return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.05) ? "#ffffff" : "#000000";
}

// A mix of two colors, amount of b in a, e.g. for muted text
export function mixColors(a: string, b: string, amount: number): string {
    const [x, y] = [channels(a), channels(b)];
    return "#" + x.map((c, i) => Math.round(c + (y[i]! - c) * amount).toString(16).padStart(2, "0")).join("");
}

// Font names cannot end the style they are written into
const fontFamily = (value: string) => value.replace(/[<>{};]/g, "");

// The colors of a mode: its own, then those for both modes
const colorsOf = (theme: ThemeConfiguration, mode: "light" | "dark"): ThemeColors =>
    ({primary: theme[mode]?.primary ?? theme.primary, background: theme[mode]?.background ?? theme.background, text: theme[mode]?.text ?? theme.text});

function variables({primary, background, text}: ThemeColors, mode: "light" | "dark"): string[] {
    const vars: string[] = [];
    const darker = (amounts: [number, number]) => mode === "light" ? amounts[0] : amounts[1];
    if (primary && HEX.test(primary)) {
        vars.push(`--color-primary:${primary}`, `--color-primary-content:${contentColor(primary)}`);
        vars.push(mode === "light"
            ? `--clay-active-bg:color-mix(in oklab,${primary} 14%,transparent)`
            : `--clay-active-bg:color-mix(in oklab,${primary} 22%,var(--color-base-100))`);
        vars.push(mode === "light"
            ? `--clay-active-fg:color-mix(in oklab,${primary} 70%,black)`
            : `--clay-active-fg:color-mix(in oklab,${primary} 35%,white)`);
    }
    if (background && HEX.test(background)) {
        vars.push(`--color-base-100:${background}`,
            `--color-base-200:color-mix(in oklab,${background},black ${darker([3, 9])}%)`,
            `--color-base-300:color-mix(in oklab,${background},black ${darker([8, 20])}%)`);
    }
    if (text && HEX.test(text)) vars.push(`--color-base-content:${text}`);
    return vars;
}

// CSS that applies the theme, or "" for Clay's own look. The selectors outrank
// daisyUI's theme rules, which pick the theme by data-theme or the system setting.
export function themeCss(theme: ThemeConfiguration | undefined): string {
    if (!theme) return "";
    const both: string[] = [];
    const radius = theme.radius === undefined ? undefined : String(theme.radius);
    if (radius && LENGTH.test(radius)) {
        both.push(`--radius-box:${radius}`, `--radius-field:calc(${radius} / 2)`, `--radius-selector:calc(${radius} / 2)`);
    }
    if (theme.font) both.push(`--font-sans:${fontFamily(theme.font)}`);
    if (theme.codeFont) both.push(`--font-mono:${fontFamily(theme.codeFont)}`);
    const light = variables(colorsOf(theme, "light"), "light").join(";");
    const dark = variables(colorsOf(theme, "dark"), "dark").join(";");
    return [
        both.length ? `:root:root{${both.join(";")}}` : "",
        light ? `:root:root[data-theme="clay-light"]{${light}}@media not (prefers-color-scheme:dark){:root:root:not([data-theme]){${light}}}` : "",
        dark ? `:root:root[data-theme="clay-dark"]{${dark}}@media (prefers-color-scheme:dark){:root:root:not([data-theme]){${dark}}}` : "",
    ].join("");
}

// Values the theme cannot use
export function themeWarnings(theme: ThemeConfiguration | undefined): string[] {
    if (!theme) return [];
    const warnings: string[] = [];
    const colors: [string, string | undefined][] = [["primary", theme.primary], ["background", theme.background], ["text", theme.text],
        ...(["light", "dark"] as const).flatMap(mode => (["primary", "background", "text"] as const)
            .map(key => [`${mode}.${key}`, theme[mode]?.[key]] as [string, string | undefined]))];
    for (const [key, value] of colors) {
        if (value !== undefined && !HEX.test(String(value))) warnings.push(`clay.yaml: theme.${key} "${value}" is not a color like "#0e7c5a"; it is ignored`);
    }
    if (theme.radius !== undefined && !LENGTH.test(String(theme.radius))) {
        warnings.push(`clay.yaml: theme.radius "${theme.radius}" is not a length like "0.5rem"; it is ignored`);
    }
    return warnings;
}
