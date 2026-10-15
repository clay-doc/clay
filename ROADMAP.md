# Roadmap

Open work for Clay and the [example repo](https://github.com/clay-doc/clay-example-repo), roughly in order of
impact.

## Features

- **OpenAPI**: full support for OpenAPI documents. Pages for every operation and schema, generated from the
  spec, in the navigation, search, link checks and the Markdown for agents.
- **Analytics**: `analytics:` in `clay.yaml` for Plausible, Umami, GoatCounter and Google Analytics. Only in
  `clay build`, one page view per navigation (Clay switches pages without reloading), and events for searches
  without results, copied code and the page menu.
- **Redirects**: `redirects:` in front matter for the old addresses of a page; `clay edit move` and `rename`
  add them.
- **Generated docs**: `generate:` in `clay.yaml`, commands that write Markdown before `build` and `dev`, e.g.
  TypeDoc, for API docs from code in any language.

A plugin system is not planned: the features above cover what plugins are used for in other tools. It comes
back if users need something they do not.

## Smaller issues

- `npm audit` reports braces and node-forge, both in Nuxt's dev tooling and without a fix yet; they go away
  when Nuxt updates them. It also reports fflate, which satori uses to read fonts (Clay only gives it its own font
  files), and postcss-selector-parser in @tailwindcss/typography.
- satori stays on 0.33: dozens of releases came out in the days before Clay 4; move up once they have settled.
- Social images only have Latin, Greek and Cyrillic letters (Inter); pages in other scripts get none. A font
  for Chinese, Japanese and Korean would make them work there too.
- unstorage stays pinned to 1.17.5: 1.17.6 breaks Nitro's prerendering (`[unstorage] Invalid key: "/"`); unpin
  once a fixed release is out (`.github/dependabot.yml` skips 1.17.6).
