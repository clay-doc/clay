import {copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, watch, writeFileSync} from "node:fs";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {addTemplate, defineNuxtModule, updateTemplates, useLogger} from "@nuxt/kit";
import {isMarkdown, loadSite, type Site} from "../lib/site";
import {brokenLinks} from "../lib/checks";
import {loadCanvas, writeSocialImages} from "../lib/social-images";
import {writeIcons} from "../lib/icons";
import {loadThemeFonts, type ThemeFonts} from "../lib/fonts";
import {socialCard} from "../lib/social-card";
import {resolveOrigin} from "../common/seo";
import {markdownRoute} from "../common/route-path";
import type {ViteDevServer} from "vite";

const SITE_TEMPLATE = "clay-site.mjs";

// Copies what the docs reference (images, downloads) and the configured logo
// and favicon into a directory served as public assets. Markdown is rendered
// into the pages and not copied; hidden files (.DS_Store, .git) never are.
function copyAssets(site: Site, target: string) {
    rmSync(target, {recursive: true, force: true});

    const copyDir = (from: string, to: string) => {
        for (const entry of readdirSync(from, {withFileTypes: true})) {
            if (entry.name.startsWith(".")) continue;
            const source = join(from, entry.name);
            if (entry.isDirectory()) copyDir(source, join(to, entry.name));
            else if (!isMarkdown(entry.name)) {
                mkdirSync(to, {recursive: true});
                copyFileSync(source, join(to, entry.name));
            }
        }
    };
    // Older versions next to the current docs, the way their pages link to them
    for (const version of site.versions) copyDir(version.docsDir, join(target, "docs", version.name));

    for (const asset of new Set([site.config.favicon, site.config.navbar?.logo])) {
        if (!asset || /^[a-z]+:\/\//i.test(asset)) continue;
        const source = resolve(site.root, asset);
        if (!source.startsWith(site.root) || !existsSync(source)) continue;
        const destination = join(target, relative(site.root, source));
        mkdirSync(dirname(destination), {recursive: true});
        copyFileSync(source, destination);
    }
}

// The theme's fonts, served from _clay/fonts/
function writeFonts(fonts: ThemeFonts, target: string) {
    if (!fonts.files.length) return;
    mkdirSync(join(target, "_clay", "fonts"), {recursive: true});
    for (const {name, data} of fonts.files) writeFileSync(join(target, "_clay", "fonts", name), data);
}

export default defineNuxtModule({
    meta: {name: "clay"},
    async setup(_options, nuxt) {
        const logger = useLogger("clay");
        const root = nuxt.options.runtimeConfig.clayRoot as string;
        const strict = process.env.CLAY_STRICT === "1";
        // Next to the build folder: Nuxt empties the build folder when a build starts
        const assetsDir = join(dirname(nuxt.options.buildDir), "public");

        let site = loadSite(root, {gitDates: !nuxt.options.dev});

        // The theme's fonts, downloaded once into a cache shared by all projects (lib/fonts.ts)
        const themeFonts = async () => {
            const warnings: string[] = [];
            const cache = fileURLToPath(new URL("../node_modules/.cache/clay/fonts", import.meta.url));
            const loaded = await loadThemeFonts(site.config.theme, nuxt.options.app.baseURL, cache, warnings);
            for (const warning of warnings) logger.warn(warning);
            return loaded;
        };
        let fonts = await themeFonts();

        // Problems are reported once per build; with --strict they fail it
        // (missing git history only limits last-updated dates, so it never fails a build)
        const broken = brokenLinks(site.pages, Object.fromEntries(site.versions.map(v => [v.name, v.docsDir])), site.redirects);
        const problems = [...site.warnings.filter(w => !w.includes("last-updated")), ...broken];
        for (const warning of site.warnings) logger.warn(warning);
        for (const link of broken) logger.warn(`Broken link in ${link}`);
        if (strict && problems.length > 0) {
            throw new Error(`clay build --strict: ${problems.length} problem(s) found, see the warnings above`);
        }
        const docPages = (prefix: string) => site.pages.filter(page => page.prefix === prefix && !page.isDir);
        const count = (name: string) => site.pages.filter(page => page.version === name && page.language === site.languages[0]!.code).length;
        const older = site.versions.slice(1).map(version => `${version.name} (${count(version.name)} pages)`);
        const translated = site.editions.filter(edition => !edition.version && edition.prefix).map(edition => {
            const pages = docPages(edition.prefix);
            return `${edition.language} (${pages.filter(page => !page.untranslated).length}/${pages.length} translated)`;
        });
        const details = [older.length ? `versions ${older.join(", ")}` : "", translated.length ? `languages ${translated.join(", ")}` : ""].filter(Boolean);

        // Crawlers read robots.txt, and the sitemap it names, only at the root of a
        // domain; a site under a base path has to hand its sitemap in itself
        const {origin: siteOrigin} = resolveOrigin(site.config.siteURL, nuxt.options.app.baseURL);
        if (!nuxt.options.dev && siteOrigin && nuxt.options.app.baseURL !== "/") {
            logger.info(`Note: robots.txt only counts at the root of a domain; submit ${siteOrigin}${nuxt.options.app.baseURL}sitemap.xml in Google Search Console and Bing Webmaster Tools`);
        }
        logger.info(`${count("")} pages in ${relative(process.cwd(), site.docsDir) || site.docsDir}${details.length ? `; ${details.join("; ")}` : ""}`);

        // Config and navigation for the app, bundled instead of fetched
        addTemplate({
            filename: SITE_TEMPLATE,
            getContents: () => [
                `export const config = ${JSON.stringify(site.config)};`,
                `export const nav = ${JSON.stringify(site.nav)};`,
                `export const versions = ${JSON.stringify(site.versions.map(({name, label, dir}) => ({name, label, dir})))};`,
                `export const languages = ${JSON.stringify(site.languages)};`,
                `export const navs = ${JSON.stringify(Object.fromEntries(site.editions.map(e => [e.prefix, e.nav])))};`,
                `export const configs = ${JSON.stringify(site.configs)};`,
                `export const fontFaces = ${JSON.stringify(fonts.faces)};`,
            ].join("\n") + "\n",
            write: true
        });
        addTemplate({
            filename: "clay-site.d.ts",
            getContents: () => [
                `import type {Configuration} from ${JSON.stringify(resolve(__dirname, "../common/configuration"))};`,
                `import type {DocItem} from ${JSON.stringify(resolve(__dirname, "../common/nav"))};`,
                `import type {LanguageInfo, VersionInfo} from ${JSON.stringify(resolve(__dirname, "../common/editions"))};`,
                "export declare const config: Configuration;",
                "export declare const nav: DocItem;",
                "export declare const versions: VersionInfo[];",
                "export declare const languages: LanguageInfo[];",
                "export declare const navs: Record<string, DocItem>;",
                "export declare const configs: Record<string, Configuration>;",
                "export declare const fontFaces: string;"
            ].join("\n"),
            write: true
        });
        nuxt.options.alias["#clay-site"] = join(nuxt.options.buildDir, SITE_TEMPLATE);

        copyAssets(site, assetsDir);
        writeFonts(fonts, assetsDir);
        // favicon.ico and the home screen icon of iOS, from the favicon (lib/icons.ts)
        nuxt.options.runtimeConfig.public.clayIcons = await writeIcons(root, site.config, assetsDir);
        // Social images are drawn into the built site; unchanged ones come from a
        // cache shared by all projects. Without Skia for this platform, pages do
        // not link to them (server/routes/_clay/page).
        const canDraw = nuxt.options.dev || Boolean(loadCanvas());
        nuxt.options.runtimeConfig.claySocialImages = canDraw;
        if (!canDraw && site.pages.some(page => socialCard(page, site))) {
            logger.warn("Social images are skipped: @napi-rs/canvas, which draws them, has no build for this platform");
        }
        if (!nuxt.options.dev && canDraw) {
            nuxt.hook("nitro:build:public-assets", async nitro => {
                if (!site.pages.some(page => socialCard(page, site))) return;
                const started = Date.now();
                logger.info("Drawing social images");
                const cache = fileURLToPath(new URL("../node_modules/.cache/clay/social-images", import.meta.url));
                const {drawn, total, warning} = await writeSocialImages(site, nitro.options.output.publicDir, cache, fonts.image);
                if (warning) logger.warn(warning);
                logger.info(`Drew ${drawn} of ${total} social images, the others are unchanged · ${Date.now() - started}ms`);
            });
        }
        nuxt.hook("nitro:config", nitro => {
            nitro.publicAssets ??= [];
            nitro.publicAssets.push({dir: assetsDir, maxAge: 0});

            // Every page, plus the files only reachable by URL
            const {origin} = resolveOrigin(site.config.siteURL, nuxt.options.app.baseURL);
            nitro.prerender ??= {};
            nitro.prerender.routes = [
                ...(nitro.prerender.routes ?? []),
                "/",
                ...site.editions.map(edition => edition.prefix).filter(Boolean),
                ...site.pages.map(page => page.route),
                // Old addresses of pages (server/middleware/redirects.ts)
                ...site.redirects.map(redirect => redirect.from),
                ...site.editions.map(edition => `/_clay${edition.prefix}/search.json`),
                "/robots.txt",
                ...(origin ? ["/sitemap.xml"] : []),
                // For language models and agents (server/middleware/agent-docs.ts)
                ...site.editions.flatMap(edition => [`${edition.prefix}/llms.txt`, `${edition.prefix}/llms-full.txt`]),
                ...site.pages.map(page => markdownRoute(page.route, page.isDir && page.route === (page.prefix || "/"))),
            ];
        });

        // Development: reload the site when the docs or config change
        if (nuxt.options.dev) {
            let viteClient: ViteDevServer | undefined;
            nuxt.hook("vite:serverCreated", (server, context) => {
                if (context.isClient) viteClient = server;
            });

            let timer: ReturnType<typeof setTimeout> | undefined;
            const watcher = watch(root, {recursive: true}, (_event, file) => {
                const name = String(file ?? "");
                if (!name || name.startsWith(".clay") || name.startsWith("publish") || name.startsWith("node_modules")) return;
                // Files included into pages (lib/expand.ts) and settings files of clay.yaml may live outside docs/
                if (!name.startsWith("docs") && name !== "clay.yaml" && !site.included.includes(name) && !name.match(/\.(svg|png|ico|jpe?g|webp)$/i)) return;

                clearTimeout(timer);
                timer = setTimeout(async () => {
                    try {
                        site = loadSite(root, {gitDates: false});
                        fonts = await themeFonts();
                        copyAssets(site, assetsDir);
                        writeFonts(fonts, assetsDir);
                        await writeIcons(root, site.config, assetsDir);
                        await updateTemplates({filter: template => template.filename === SITE_TEMPLATE});
                        // The app reads docs and navigation from the dev server,
                        // so a reload shows the change (no restart needed)
                        viteClient?.ws.send({type: "full-reload"});
                        logger.info(`Reloaded ${name}`);
                    } catch (error) {
                        logger.error(error);
                    }
                }, 100);
            });
            nuxt.hook("close", () => watcher.close());
        }
    }
});
