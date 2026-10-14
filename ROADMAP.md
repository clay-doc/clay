# Roadmap

Open work for Clay and the [example repo](https://github.com/clay-doc/clay-example-repo), roughly in order of
impact.

## Clay 2 rollout

- **First npm release.** Configure publishing for `clay-doc` (an `NPM_TOKEN` secret for the first release, then
  npm trusted publishing for this repository), then merge the release pull request.
- **Example repo.** Switch its deployment to `npm ci` and `npx clay build --strict` once the package is published.

## Features

- Versioned docs (docs per release, version switcher).
- Translations (i18n) with a language switcher.
- Custom components in Markdown (e.g. tabs, cards), diagrams (Mermaid) and math (KaTeX).
- A plugin system and analytics integration.
- "On this page" on small screens (it is shown on wide screens only).

## Smaller issues

- The link check verifies pages and files but not `#section` anchors; with the renderer's heading ids
  available at build time, this is now a small change.
- `robots.txt` only takes effect at the domain root; project sites under a base path need the sitemap submitted
  in the search engines' webmaster tools.
- Accessibility pass: skip link, focus styles and contrast of the light theme.
- Browser tests cover Chromium only; add Firefox and WebKit.
