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

// Inter draws Latin, Greek and Cyrillic letters, Noto Sans Chinese, Japanese and
// Korean (social-images.ts). Pages in other scripts get no image rather than one
// with empty boxes.
const DRAWABLE = /^[\u0000-\u024F\u0300-\u036F\u0370-\u03FF\u0400-\u052F\u1100-\u11FF\u1E00-\u1EFF\u2000-\u206F\u20A0-\u20CF\u2100-\u214F\u2190-\u21FF\u3000-\u303F\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF\u2212]*$/u;

// The card of a page with text, or undefined when it gets no image
export function socialCard(page: Page, site: Site): SocialCard | undefined {
    const config = site.configs[page.language] ?? site.config;
    if (!socialImagesEnabled(config) || page.markdown === undefined) return undefined;
    // The description, as the page's meta description has it
    const start = site.pages.find(p => p.route === (page.prefix || "/") && p.isDir);
    const description = truncate(page.frontMatter.description || firstParagraph(stripFrontMatter(page.markdown)) || start?.frontMatter.description || "");
    const card = {site: config.title, section: page.parents.map(parent => parent.title).join(" › "), title: page.title, description, language: page.language};
    return [card.site, card.section, card.title, card.description].every(text => DRAWABLE.test(text)) ? card : undefined;
}
