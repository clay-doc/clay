import {firstParagraph} from "../common/markdown-text";
import {truncate} from "../common/seo";
export {SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH, socialImagePath} from "../common/seo";
import type {Configuration} from "../common/configuration";
import {stripFrontMatter} from "./front-matter";
import type {Page, Site} from "./site";

// What the social image of a page shows (social-images.ts draws it), shared by
// the build that draws the images and the pages that link to them

export type SocialCard = { site: string, section: string, title: string, description: string, language: string };

// Links to images need the site's address; "socialImages: false" turns them off
export const socialImagesEnabled = (config: Configuration) => config.socialImages !== false && Boolean(config.siteURL);

// Inter, which Clay ships, draws Latin, Greek and Cyrillic letters. Every other
// script has a Noto family on Google Fonts, which the build fetches just the
// letters of a card from (social-images.ts). Han letters follow the language.
const SCRIPT_FONTS: [RegExp, string][] = [
    [/\p{Script=Arabic}/u, "Noto Sans Arabic"], [/\p{Script=Hebrew}/u, "Noto Sans Hebrew"],
    [/\p{Script=Syriac}/u, "Noto Sans Syriac"], [/\p{Script=Thaana}/u, "Noto Sans Thaana"],
    [/\p{Script=Devanagari}/u, "Noto Sans Devanagari"], [/\p{Script=Bengali}/u, "Noto Sans Bengali"],
    [/\p{Script=Gurmukhi}/u, "Noto Sans Gurmukhi"], [/\p{Script=Gujarati}/u, "Noto Sans Gujarati"],
    [/\p{Script=Oriya}/u, "Noto Sans Oriya"], [/\p{Script=Tamil}/u, "Noto Sans Tamil"],
    [/\p{Script=Telugu}/u, "Noto Sans Telugu"], [/\p{Script=Kannada}/u, "Noto Sans Kannada"],
    [/\p{Script=Malayalam}/u, "Noto Sans Malayalam"], [/\p{Script=Sinhala}/u, "Noto Sans Sinhala"],
    [/\p{Script=Thai}/u, "Noto Sans Thai"], [/\p{Script=Lao}/u, "Noto Sans Lao"],
    [/\p{Script=Khmer}/u, "Noto Sans Khmer"], [/\p{Script=Myanmar}/u, "Noto Sans Myanmar"],
    [/\p{Script=Georgian}/u, "Noto Sans Georgian"], [/\p{Script=Armenian}/u, "Noto Sans Armenian"],
    [/\p{Script=Ethiopic}/u, "Noto Sans Ethiopic"], [/\p{Script=Mongolian}/u, "Noto Sans Mongolian"],
    [/\p{Script=Tibetan}/u, "Noto Serif Tibetan"], [/\p{Script=Cherokee}/u, "Noto Sans Cherokee"],
    [/\p{Script=Tifinagh}/u, "Noto Sans Tifinagh"], [/\p{Script=Javanese}/u, "Noto Sans Javanese"],
    [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, "Noto Sans JP"], [/\p{Script=Hangul}/u, "Noto Sans KR"],
    [/\p{Script=Bopomofo}/u, "Noto Sans TC"],
    [/\p{Extended_Pictographic}/u, "Noto Color Emoji"],
    // Symbols and math signs beyond Inter's
    [/[\u2300-\u23FF\u2460-\u27BF\u2900-\u2BFF]/u, "Noto Sans Symbols 2"], [/[\u2200-\u22FF\u27C0-\u27EF\u2980-\u2AFF]/u, "Noto Sans Math"],
];
// Letters (and their marks) of scripts Inter draws, or that SCRIPT_FONTS has a font for
const INTER = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]/u;

// The Han font for a language: Chinese, Japanese and Korean letters differ
export function hanFamily(language: string): string {
    const code = language.toLowerCase();
    if (code.startsWith("ja")) return "Noto Sans JP";
    if (code.startsWith("ko")) return "Noto Sans KR";
    if (/^zh-(tw|hk|mo|hant)/.test(code)) return "Noto Sans TC";
    return "Noto Sans SC";
}

// The fonts a text needs besides Inter, or undefined when it has letters of a
// script without a font
export function cardFamilies(text: string, language: string): string[] | undefined {
    const families = new Set<string>();
    for (const char of new Set(text)) {
        const font = SCRIPT_FONTS.find(([pattern]) => pattern.test(char))?.[1]
            // Han letters, and the punctuation Chinese, Japanese and Korean share
            ?? (/[\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]/u.test(char) ? hanFamily(language) : undefined);
        if (font) families.add(font);
        else if (!INTER.test(char)) return undefined;
    }
    return [...families];
}

// The card of a page with text, or undefined when it gets no image
export function socialCard(page: Page, site: Site): SocialCard | undefined {
    const config = site.configs[page.language] ?? site.config;
    if (!socialImagesEnabled(config) || page.markdown === undefined) return undefined;
    // The description, as the page's meta description has it
    const start = site.pages.find(p => p.route === (page.prefix || "/") && p.isDir);
    const description = truncate(page.frontMatter.description || firstParagraph(stripFrontMatter(page.markdown)) || start?.frontMatter.description || "");
    const card = {site: config.title, section: page.parents.map(parent => parent.title).join(" › "), title: page.title, description, language: page.language};
    return cardFamilies([card.site, card.section, card.title, card.description].join(""), card.language) ? card : undefined;
}
