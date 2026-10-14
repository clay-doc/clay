# Changelog

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
