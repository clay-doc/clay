# Roadmap

Open work for Clay and the [example repo](https://github.com/clay-doc/clay-example-repo), roughly in order of
impact.

## Features

- **Theme**: `theme:` in `clay.yaml` for the site's own look: the primary color, the light and dark
  backgrounds, the corner radius and the font. The social images take the same colors.
- **Analytics**: `analytics:` in `clay.yaml` for Plausible, Umami, GoatCounter and Google Analytics. Only in
  `clay build`, one page view per navigation (Clay switches pages without reloading), and events for searches
  without results, copied code and the page menu.
- **Redirects**: `redirects:` in front matter for the old addresses of a page; `clay edit move` and `rename`
  add them.

## Clay 5

- **OpenAPI**: full support for OpenAPI documents. Pages for every operation and schema, generated from the
  spec, in the navigation, search, link checks and the Markdown for agents.
- Before work on Clay 5 starts, save the Clay 4 docs of the example repo as an older version
  (`npx clay version 4.x`), so the docs of both stay online.

A plugin system is not planned: the features above cover what plugins are used for in other tools. It comes
back if users need something they do not.

## Smaller issues

- `npm audit` reports braces and node-forge, both in Nuxt's dev tooling and without a fix yet; they go away
  when Nuxt updates them. It also reports fflate, which satori uses to read fonts (Clay only gives it its own font
  files), and postcss-selector-parser in @tailwindcss/typography.
- satori stays on 0.33: dozens of releases came out in the days before Clay 4; move up once they have settled.
- Social images draw Latin, Greek, Cyrillic, Chinese, Japanese and Korean letters (the CJK fonts come from Google
  Fonts during the build). Pages in other scripts, like Arabic, Hebrew, Thai or Hindi, and titles with emoji get
  none.
- unstorage stays pinned to 1.17.5: 1.17.6 breaks Nitro's prerendering (`[unstorage] Invalid key: "/"`); unpin
  once a fixed release is out (`.github/dependabot.yml` skips 1.17.6).
