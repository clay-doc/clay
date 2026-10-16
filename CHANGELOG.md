# Changelog

## [4.1.0](https://github.com/clay-doc/clay/compare/v4.0.0...v4.1.0) (2026-10-16)


### Features

* **seo:** draw social images with Skia, in every script and with emoji ([81f9061](https://github.com/clay-doc/clay/commit/81f9061a29b6b3aa5f68134a62012d2a1bcc7690))


### Bug Fixes

* **versions:** fill in variables when saving a version ([bee3367](https://github.com/clay-doc/clay/commit/bee33674afc44e1ffe60df49251aa451a4d66570))

## [4.0.0](https://github.com/clay-doc/clay/compare/v3.1.0...v4.0.0) (2026-10-16)


### ⚠ BREAKING CHANGES

* **versions:** docs-archive/ is no longer read. Run "clay version" to move docs/ into docs/latest/ and docs-archive/<name>/ to docs/<name>/.
* **markdown:** files and folders whose name starts with "_" are no longer pages; they hold snippets.
* **front-matter:** the "cards" front matter key, renamed to "list" in Clay 3, is no longer read; rename it to "list".

### Features

* **a11y:** add a skip link, focus rings, better contrast and axe tests ([f093f26](https://github.com/clay-doc/clay/commit/f093f2628b39c89e97842ddc911583b2841bdef1))
* **agents:** publish every page as Markdown with llms.txt, and a page menu ([6a6a12e](https://github.com/clay-doc/clay/commit/6a6a12e988cdf2803be3fb2e3d8540268b50c738))
* **alerts:** draw the alert's color as a bar beside the box ([ad28d77](https://github.com/clay-doc/clay/commit/ad28d77c45f9263ec11342011bec18a90ffcee64))
* **analytics:** count page views and events without cookies ([543bc3d](https://github.com/clay-doc/clay/commit/543bc3d3e84c08e3529b13dbc828c50e46e007be))
* **checks:** report links to missing sections ([b73026f](https://github.com/clay-doc/clay/commit/b73026f01fbdc9affd879cfe7e0f090aa8da16f4))
* **cli:** add clay edit commands and clay check for scripts and agents ([af9bb7b](https://github.com/clay-doc/clay/commit/af9bb7baaf2811c42b36acd773623fbd8aae6989))
* **cli:** run "generate" commands before build, dev and check ([5ef7573](https://github.com/clay-doc/clay/commit/5ef7573eba4b89f8eb058e5832373dea93bb1102))
* **config:** add tags to the head of every page with "head" ([68af545](https://github.com/clay-doc/clay/commit/68af54575e8164a66e8fd00f3536edef9e5be956))
* **config:** hide entries of the page menu ([544f413](https://github.com/clay-doc/clay/commit/544f413ba9d8d4c427639baaa51e33bc13a687ba))
* **config:** let settings live in files of their own ([e8694e9](https://github.com/clay-doc/clay/commit/e8694e95c7768f5dcc3da6bd7e1ea27ef33c0abf))
* **content:** let the navbar and sidebar cast a shadow on the page ([554323f](https://github.com/clay-doc/clay/commit/554323f169fbf0aa6ffe1d56084945058f711a20))
* **front-matter:** stop reading the "cards" alias of "list" ([f325651](https://github.com/clay-doc/clay/commit/f32565189ddacaec1f09ceff90b01b9f7bf77a1c))
* **markdown:** add a prompt block for AI assistants and agents ([0f273db](https://github.com/clay-doc/clay/commit/0f273db212cd88c13236faf0954af510ef41ef3e))
* **markdown:** add snippets and variables ([1fcf98a](https://github.com/clay-doc/clay/commit/1fcf98aa370f7c3d83c17fa8d7018bd003ddfb6c))
* **markdown:** add tabs, steps, cards, details, badges, math, diagrams and file trees ([4deb503](https://github.com/clay-doc/clay/commit/4deb503b1d8c012ed6e0a732bd991529a8251647))
* **markdown:** embed videos, designs and code playgrounds ([e417211](https://github.com/clay-doc/clay/commit/e417211c2505b4d49d7d0bdf43c2a49cabf05379))
* **markdown:** show the file name of a code block ([681b9a8](https://github.com/clay-doc/clay/commit/681b9a85c0ba5373475f9ce2f9924601312d627b))
* **navbar:** slide new breadcrumbs in ([907f05c](https://github.com/clay-doc/clay/commit/907f05c24180377fd6ed67297dfbaaa802df97e7))
* **pages:** fade a page in after navigating to it ([943a767](https://github.com/clay-doc/clay/commit/943a76786eff8a289c94b61e4e0f4ccc7b047674))
* **redirects:** keep old addresses of moved pages ([4e2e0b4](https://github.com/clay-doc/clay/commit/4e2e0b4da43afae6c9bba098b185a473c2dd8e41))
* **search:** group results by page and filter them by section ([574e872](https://github.com/clay-doc/clay/commit/574e872c16479834de5d7c866bae5124300cb7ce))
* **seo:** draw a social image for every page ([16e35c1](https://github.com/clay-doc/clay/commit/16e35c178c7063f8dc79a5f431e154638ba5da78))
* **seo:** draw Chinese, Japanese and Korean in social images ([851c462](https://github.com/clay-doc/clay/commit/851c462ad2a5848a5b412cbef1036b15a240c288))
* **seo:** point sites under a path to their sitemap ([8db0994](https://github.com/clay-doc/clay/commit/8db09940d8d01d79464a5759c8d2899b13445c75))
* **sidebar:** grow the highlight when it jumps between folder levels ([8f2ad2f](https://github.com/clay-doc/clay/commit/8f2ad2fbc5f842a9ce4446f9e5029291d84a3205))
* **theme:** add your own colors, corners and fonts ([3d28a10](https://github.com/clay-doc/clay/commit/3d28a10bd45714fd93e9659b277cfcfc3fffc560))
* **toc:** fold the contents up above the page on narrow screens ([693059c](https://github.com/clay-doc/clay/commit/693059c12b75adcea0ecc1682231ab6ffaecb953))
* **versions:** keep every version in a folder of its own in docs/ ([e9a4e24](https://github.com/clay-doc/clay/commit/e9a4e2475c4aa117046c0c81a9693782249a067f))


### Bug Fixes

* **app:** block only /docs/ addresses and drop the old .md redirect ([5953c7e](https://github.com/clay-doc/clay/commit/5953c7e8706e57a854b195743ab8732f70bc3488))
* **checks:** check files and links written in HTML ([a40db81](https://github.com/clay-doc/clay/commit/a40db81a417e2d557e89cf2b7a8c69b4fca8e916))
* **checks:** check the links of folder and start pages ([73b83bd](https://github.com/clay-doc/clay/commit/73b83bd10241a2d76d1d98390360ce48d9a409f7))
* **cli:** keep bin/clay.mjs executable ([f82f0e3](https://github.com/clay-doc/clay/commit/f82f0e3ac871000c42a37e8e9a7a7ffc1c4f2e85))
* **cli:** name the cause when pages fail to render ([48297bc](https://github.com/clay-doc/clay/commit/48297bcd8450ed0765d5de65c64da590ee42cf9d))
* **layout:** only show scrollbars when the page scrolls ([43bb61d](https://github.com/clay-doc/clay/commit/43bb61d5835621e0de6bf5a29cd702b2615e20e9))
* **markdown:** leave badges out of heading links ([9e0d555](https://github.com/clay-doc/clay/commit/9e0d5555e76faa017d2531bdf6a1173ebf9f0ded))
* **search:** drop alert markers from indexed text ([3f363f8](https://github.com/clay-doc/clay/commit/3f363f85029c7b1201ef5a61596728607ef85cfc))
* **types:** satisfy the stricter head and token types ([eaba789](https://github.com/clay-doc/clay/commit/eaba7894e8d651e78d2fc2bfad13fb27e005ed18))

## [3.1.0](https://github.com/clay-doc/clay/compare/v3.0.0...v3.1.0) (2026-10-15)


### Features

* **cli:** show dev and preview output like the build progress ([746d855](https://github.com/clay-doc/clay/commit/746d8556152febb115be37e9593c8e1a51691043))
* **index:** list a folder's pages with "list: true" ([8e2a046](https://github.com/clay-doc/clay/commit/8e2a046bfdc0d9f0f4b80973d9fe7df88c2e3d47))
* **navbar:** show links, theme and search as icons with tooltips ([b4e8e98](https://github.com/clay-doc/clay/commit/b4e8e98dcb1df1caa5f124ab104326b96988f5ff))
* **sidebar:** animate folders opening and closing ([c19fffe](https://github.com/clay-doc/clay/commit/c19fffeedb17833d81b452259b9fcafcfca88b4f))
* **sidebar:** highlight the active entry with a mark that travels ([75a777f](https://github.com/clay-doc/clay/commit/75a777f68fe0bd17edb53b80667988c6d667f469))
* **toc:** mark every section on screen with an animated rail ([851f375](https://github.com/clay-doc/clay/commit/851f3759c9fdb6151ec1350f9c471095cc7dc531))


### Bug Fixes

* **icons:** load the Font Awesome kit's script in the head ([ecc422b](https://github.com/clay-doc/clay/commit/ecc422b0d02a5538e3703fa4f7ce29724529b162))
* **markdown:** show "#" heading links left of the heading with room for them ([55ccd93](https://github.com/clay-doc/clay/commit/55ccd93334f654f07c71feccf2a512e0267ade8f))
* **navbar:** keep the logo small while the stylesheet loads ([35be1c0](https://github.com/clay-doc/clay/commit/35be1c0642a240e1748dad963a26fd85a5d3c855))
* **pages:** keep a page on screen until the next one has loaded ([75f98b2](https://github.com/clay-doc/clay/commit/75f98b2da8f608106046bcd89e16051c40baf57d))

## [3.0.0](https://github.com/clay-doc/clay/compare/v2.1.2...v3.0.0) (2026-10-15)


### ⚠ BREAKING CHANGES

* versions/ is no longer read. Move each versions/<name>/docs/ to docs-archive/<name>/.
* dir-meta.yaml and the index section of clay.yaml are no longer read. Move folder names, icons and order into each folder's index.md (name becomes title; translations into index.<lang>.md) and the start page into docs/index.md (hero: true, cards: true for the previous layout).

### Features

* **edit:** save versions with V and react to esc at once ([b8e8775](https://github.com/clay-doc/clay/commit/b8e87756511d34aec78f2f03cfaaba140ab8b8b9))
* **markdown:** add "#" links to section headings ([9f3fd58](https://github.com/clay-doc/clay/commit/9f3fd58c47c0e2c1d22a621818fc0d1f31cd758e))
* move older versions to docs-archive/&lt;name&gt;/ ([c4389e6](https://github.com/clay-doc/clay/commit/c4389e6a6ee65f5edda1b25adb0a535719d7f24a))
* replace dir-meta.yaml and the index config with index.md pages ([207a7e0](https://github.com/clay-doc/clay/commit/207a7e08137cf255ebea034c10f5d6057dd2892f))


### Bug Fixes

* **icons:** load the Font Awesome kit as a stylesheet ([44245c2](https://github.com/clay-doc/clay/commit/44245c24b6d53ada58cd487139a559b35be052d0))
* **navbar:** close dropdowns on outside click, escape and navigation ([8774e56](https://github.com/clay-doc/clay/commit/8774e56ec086a6803c2180a567010c16ec821dab))

## [2.1.2](https://github.com/clay-doc/clay/compare/v2.1.1...v2.1.2) (2026-10-14)


### Bug Fixes

* **cli:** show build warnings and errors in CI ([c97bf90](https://github.com/clay-doc/clay/commit/c97bf9042217be79903c367a3e03c7a509345cfb))

## [2.1.1](https://github.com/clay-doc/clay/compare/v2.1.0...v2.1.1) (2026-10-14)


### Bug Fixes

* **code:** style highlighted, diff and focused lines ([939f8f6](https://github.com/clay-doc/clay/commit/939f8f6eb6b6b8d13ff496b1f86b6d16e3cd2697))
* **i18n:** translate alert titles and copy button labels ([497ed09](https://github.com/clay-doc/clay/commit/497ed09c732b5dec08e428d75c683398a79f7d5e))

## [2.1.0](https://github.com/clay-doc/clay/compare/v2.0.0...v2.1.0) (2026-10-14)


### Features

* add translations with a language switcher and localized interface ([7417153](https://github.com/clay-doc/clay/commit/74171534029483fa171b5c91ced04be3e06379e1))
* add versioned docs with clay version and a version switcher ([cad6b73](https://github.com/clay-doc/clay/commit/cad6b73686d8f8453de0ae2d92faf8d6af1a43db))
* **cli:** add clay edit for page order, titles, icons and settings ([876781d](https://github.com/clay-doc/clay/commit/876781d99d9aa625815ebc430073ddfef833a4cb))
* **cli:** show build progress instead of the nuxt output ([e1e89b7](https://github.com/clay-doc/clay/commit/e1e89b749f826b1134507d52f1f6e6a7176c4aa0))


### Bug Fixes

* **cli:** show why pages fail to render ([8ccd1c4](https://github.com/clay-doc/clay/commit/8ccd1c425c0b3fe1375cb78df33e8a20a532a810))
* **deps:** pin unstorage to 1.17.5 ([848e85b](https://github.com/clay-doc/clay/commit/848e85b899d8321214932d580da9950d59f95d73))
* **layout:** read the base URL during setup ([7977c84](https://github.com/clay-doc/clay/commit/7977c845c5d263d4e9c9307275a0e26f6f6cc803))
* **markdown:** number heading ids per document ([08f1843](https://github.com/clay-doc/clay/commit/08f1843042bed349edc27b83de7323e1d51a43d4))

## [2.0.0](https://github.com/clay-doc/clay/compare/v1.0.2...v2.0.0) (2026-10-14)


### ⚠ BREAKING CHANGES

* Clay Oven and the prebuilt dist.zip are replaced by the clay-doc package. Install it in the docs repository and run "npx clay build"; the output stays in publish/public. The "langs" setting is no longer used.

### Features

* add mobile nav, page toc, page footer and light theme ([8673b4f](https://github.com/clay-doc/clay/commit/8673b4ff220de0949d7ef2ee438106653b525d42))
* build documentation sites with the clay command ([fa5bfc3](https://github.com/clay-doc/clay/commit/fa5bfc38b0d787fad5b289cc110b0ef48a36471b))
