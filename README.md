<p align="center">
  <img src=".github/assets/clay-logo.svg" alt="Clay logo" height="220rem">
</p>

<h1 align="center">Clay</h1>

<p align="center">
  <strong>Documentation sites from Markdown, ready for readers, search engines and AI agents.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/clay-doc"><img src="https://img.shields.io/npm/v/clay-doc" alt="npm"></a>
  <a href="https://github.com/clay-doc/clay/blob/main/LICENSE"><img src="https://img.shields.io/github/license/clay-doc/clay" alt="License"></a>
</p>

---

Write your docs as Markdown files in a `docs/` folder, add a `clay.yaml`, and Clay builds a fast, searchable static
site you can host anywhere, such as GitHub Pages. There is no theme to set up and no code to write.

**[Read the documentation](https://clay-doc.github.io/clay-example-repo/)**, itself a Clay site.

- **Pre-rendered pages** that load fast, work without JavaScript and fit small screens.
- **Full-text search** across every page and section, typos forgiven.
- **Clay Flavored Markdown**: tabs, steps, cards, details, badges, math, diagrams, file trees, prompts, videos and
  embeds, written in plain Markdown, plus code blocks with file names, and snippets and variables to write a
  text once.
- **Ready for AI**: every page as Markdown, `llms.txt`, a page menu to ask ChatGPT or Claude, and commands that
  coding agents understand.
- **Versions and translations**, with switchers that keep the page you are reading, and redirects that keep the
  old addresses of moved pages working.
- **Your look**: colors, corners and fonts in `clay.yaml`; fonts from Google Fonts are published with the site.
- **Analytics without cookies**: Plausible, Umami or GoatCounter, with events for searches that found nothing.
- **SEO**: descriptions, canonical links, structured data, a sitemap, and a social image for every page.
- **Checks** for broken links and config typos; `--strict` turns them into build failures.
- **Safe** for docs from outside contributors: rendered HTML is sanitized.

## Quick start

In the repository that holds your docs (Node.js 20.19 or newer):

```bash
npm install --save-dev clay-doc
```

Create `clay.yaml`; only the title is required:

```yaml
title: "My Docs"
```

Put your pages in `docs/`, then:

```bash
npx clay dev       # live preview at http://localhost:3000
npx clay build     # static site in publish/public
npx clay preview   # serve the build like a static host would
```

## Learn more

| | |
|---|---|
| [Quick start](https://clay-doc.github.io/clay-example-repo/getting-started/quick-start) | From an empty folder to a site in five minutes |
| [Writing](https://clay-doc.github.io/clay-example-repo/writing) | Pages, Markdown and the components |
| [Configuration](https://clay-doc.github.io/clay-example-repo/configuration/clay-yaml) | Every setting of `clay.yaml` |
| [AI & agents](https://clay-doc.github.io/clay-example-repo/features/ai-and-agents) | `llms.txt`, `clay edit` commands and `clay check` |
| [GitHub Pages](https://clay-doc.github.io/clay-example-repo/publishing/github-pages) | Publish with a workflow on every push |
| [Upgrading to Clay 4](https://clay-doc.github.io/clay-example-repo/guides/upgrading-to-clay-4) | From Clay 3: `cards` in front matter is now `list` |

The [changelog](CHANGELOG.md) lists every change.

## Developing Clay

```bash
npm install
npm run dev          # the sample site in playground/
npm test             # unit tests
npm run test:e2e     # browser tests (npx playwright install chromium first)
npm run typecheck
```

Clay is a Nuxt app plus a command line, published as one npm package:

| Folder | What lives there |
|---|---|
| `bin/` | The `clay` command: parses the arguments and starts Nuxt or the code in `lib/` |
| `lib/` | Node code for the command line and the server: loading the docs (`site.ts`), checks, `clay edit`, build progress, preview server |
| `modules/` | The Nuxt module that connects Nuxt with a docs project: assets, pages to pre-render, reloads during `clay dev` |
| `server/` | Runs at build time: Markdown to HTML, sanitizing, search index, Markdown and `llms.txt` for agents |
| `app/` | The Vue app: layout, components and the scripts that run in the browser (`utils/`) |
| `common/` | Code that runs anywhere, without Node APIs: texts in twelve languages, routes, navigation, search, SEO, the component syntax |
| `playground/` | The sample docs project used while developing and in the tests |
| `test/` | Unit tests (`unit/`, Vitest) and browser tests (`e2e/`, Playwright) |

See [ROADMAP.md](ROADMAP.md) for planned work.

## License

This project is licensed under the Apache License 2.0 — see [LICENSE](LICENSE) for details.
