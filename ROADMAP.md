# Roadmap

Open work for Clay and the [example repo](https://github.com/clay-doc/clay-example-repo), roughly in order of
impact.

## Clay 5

- **OpenAPI**: full support for OpenAPI documents. Pages for every operation and schema, generated from the
  spec, in the navigation, search, link checks and the Markdown for agents.

A plugin system is not planned: the features above cover what plugins are used for in other tools. It comes
back if users need something they do not.

## Smaller issues

- `npm audit` reports braces and node-forge, both in Nuxt's dev tooling and without a fix yet; they go away
  when Nuxt updates them. It also reports fflate, which satori uses to read fonts (Clay only gives it its own font
  files), and postcss-selector-parser in @tailwindcss/typography.
- jsdom stays on 29: jsdom 30 needs Node.js 22.22, and Clay supports Node.js 20.19 and newer. Node.js 20 is out of
  support since April 2026; requiring Node.js 22 is a change for Clay 5.
- satori stays on 0.33: dozens of releases came out in the days before Clay 4; move up once they have settled.
- Social images draw Latin, Greek, Cyrillic, Chinese, Japanese and Korean letters (the CJK fonts come from Google
  Fonts during the build). Pages in other scripts, like Arabic, Hebrew, Thai or Hindi, and titles with emoji get
  none.
- unstorage stays pinned to 1.17.5: 1.17.6 breaks Nitro's prerendering (`[unstorage] Invalid key: "/"`); unpin
  once a fixed release is out (`.github/dependabot.yml` skips 1.17.6).
