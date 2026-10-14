<p align="center">
  <img src="clay-transparent.svg" alt="Clay logo" height="220rem">
</p>

<h1 align="center">Clay</h1>

<p align="center">
  <strong>Documentation sites from Markdown, built on <a href="https://nuxt.com/">Nuxt</a> and <a href="https://vuejs.org/">Vue</a>.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/clay-doc"><img src="https://img.shields.io/npm/v/clay-doc" alt="npm"></a>
  <a href="https://github.com/clay-doc/clay/blob/main/LICENSE"><img src="https://img.shields.io/github/license/clay-doc/clay" alt="License"></a>
</p>

---

Write your docs as Markdown files in a `docs/` folder, add a `clay.yaml`, and Clay builds a fast,
searchable static site you can host anywhere, such as GitHub Pages.

- **Pre-rendered pages**: every page is real HTML, so it shows immediately and every search engine can read it.
  Moving between pages loads a small prebuilt payload; the browser never parses Markdown.
- **Full-text search** with <kbd>⌘ K</kbd> / <kbd>Ctrl K</kbd> or <kbd>/</kbd>: results link to the matching section,
  tolerate typos and match as you type; the words are highlighted on the page.
- **Navigation for every screen**: sidebar, a menu drawer on phones, "On this page", previous/next links.
- **Code blocks** highlighted with [Shiki](https://shiki.style/) for any language, with copy buttons.
- **SEO**: titles, descriptions, canonical URLs, Open Graph tags, breadcrumbs, `sitemap.xml` and `robots.txt`.
- **Light and dark theme**, following the system setting, with a toggle.
- **"Edit this page"** links and **last-updated dates** from git.
- **Checks** for broken links and typos in config files; `--strict` turns them into build failures.
- **Safe** for docs from outside contributors: rendered HTML is sanitized with [DOMPurify](https://github.com/cure53/DOMPurify).

## Quick Start

In the repository that holds your docs (Node.js 20.19 or newer):

```bash
npm install --save-dev clay-doc
```

Or try it without installing: `npx clay-doc dev`.

```text
.
├── docs/                  # Markdown files; folders become sections
│   ├── getting-started.md
│   └── guides/
│       └── setup.md
├── clay.yaml              # Site settings
├── dir-meta.yaml          # Optional: names, icons and order of folders
└── logo.svg               # Optional
```

A minimal `clay.yaml` only needs a title:

```yaml
title: "My Docs"
```

Then:

```bash
npx clay dev       # live preview at http://localhost:3000, reloads when docs change
npx clay build     # static site in publish/public
npx clay preview   # serve the build like a static host would
```

## Configuration

```yaml
title: "My Project"
favicon: "logo.svg"
baseURL: "/my-project/"             # path the site is served under (GitHub project pages)
siteURL: "https://my-org.github.io" # origin, for canonical URLs and the sitemap
lang: "en"
editURL: "https://github.com/my-org/my-project/edit/main/docs/"
fontawesomeKit: "abc123"            # optional; without it the free Font Awesome icons are used
navbar:
  logo: "logo.svg"
  source:
    name: "GitHub"
    icon: "fa-brands fa-github"
    link: "https://github.com/my-org/my-project"
  links:
    - name: "Homepage"
      icon: "fa-solid fa-house"
      link: "https://example.com"
index:
  title: "Welcome to My Project"
  description: "Everything you need to know."
  icon: "fa-solid fa-rocket"
```

Only `title` is required. `CLAY_TITLE`, `CLAY_BASE_URL`, `CLAY_SITE_URL` and `CLAY_FONTAWESOME_KIT` override
the matching settings at build time, e.g. in CI.

### Pages

Each Markdown file is a page. Optional front matter:

```yaml
---
title: Setup              # default: the first "# heading", then the file name
icon: fa-solid fa-wrench
description: How to set up the project, in one or two sentences.  # default: the first paragraph
order: 1                  # position in the navigation
---
```

Pages and folders are sorted alphabetically; entries with an `order` come first (`clay edit` sets these for you).
Folders get their name, icon and order from `dir-meta.yaml`:

```yaml
- path: "guides"
  name: "Guides"
  icon: "fa-solid fa-book"
  order: 2
  children:
    - path: "advanced"
      name: "Advanced"
```

Links between docs work like on GitHub: `[Setup](./guides/setup.md)` is resolved relative to the page.
Images and other files next to your docs (`![Diagram](img/diagram.png)`) are published with the site.

## Command Line

| Command        | Description                                       |
|----------------|---------------------------------------------------|
| `clay dev`     | Development server with live reload               |
| `clay build`   | Build the static site into `<out>/public`         |
| `clay preview` | Serve the build under its base URL, like GitHub Pages |
| `clay edit`    | Edit page order, titles and icons, and the settings in `clay.yaml` |

`clay edit` opens an editor in the terminal: move pages and folders (`m` picks one up, ↑↓ moves it, ⏎ drops it),
set titles and icons, and switch to the site settings with Tab. Saving writes `order`, `title` and `icon` to the
front matter and `dir-meta.yaml`, and keeps comments and formatting of these files. With `clay dev` running, the
site updates on every save.

| Option         | Description                                                  | Default             |
|----------------|--------------------------------------------------------------|---------------------|
| `--root <dir>` | Docs project with `clay.yaml` and `docs/`                    | current directory   |
| `--out <dir>`  | Output directory                                             | `<root>/publish`    |
| `--port <n>`   | Port for `dev` and `preview`                                 | `3000`, `4173`      |
| `--strict`     | `build`: fail on broken links and unknown config keys        |                     |
| `--verbose`    | `build`: show the full Nuxt output instead of the progress   |                     |

## Deploying to GitHub Pages

```yaml
name: Deploy Docs
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0  # full history for last-updated dates
      - uses: actions/setup-node@v7
        with:
          node-version: lts/*
          cache: npm
      - run: npm ci
      - run: npx clay build --strict
      - uses: actions/upload-pages-artifact@v5
        with:
          path: publish/public
      - id: deployment
        uses: actions/deploy-pages@v5
```

## Migrating from Clay Oven

Clay 1 was a prebuilt frontend that the separate Clay Oven tool filled with your docs. Clay 2 builds the site
itself:

1. `npm install --save-dev clay-doc` in your docs repository (commit `package.json` and `package-lock.json`).
2. Replace the `run-oven.sh` step in CI with `npm ci` and `npx clay build`. The output is still `publish/public`.
3. Remove `langs` from `clay.yaml`: code languages are detected automatically.

`clay.yaml`, `dir-meta.yaml` and `docs/` stay as they are.

## Developing Clay

```bash
npm install
npm run dev          # the sample site in playground/
npm test             # unit tests
npm run test:e2e     # browser tests (npx playwright install chromium first)
npm run typecheck
```

`modules/clay.ts` loads the docs at build time and pre-renders every page; `server/` renders Markdown;
`app/` is the Vue app. See [ROADMAP.md](ROADMAP.md) for planned work.

## License

This project is licensed under the Apache License 2.0 — see [LICENSE](LICENSE) for details.
