---
title: Configuration
icon: fa-solid fa-gear
---

# Configuration Reference

Clay uses YAML configuration files in the root of your project to control how your documentation site looks and behaves. This page provides a complete reference for all available options.

## clay.yaml

The `clay.yaml` file is the main configuration file. It controls the site title, navigation bar, landing page, and syntax highlighting.

### Top-Level Options

| Option          | Type     | Description                                                    |
|-----------------|----------|----------------------------------------------------------------|
| `title`         | `string` | The name of your documentation site, displayed in the browser tab and navbar. |
| `favicon`       | `string` | Path to the favicon image file (relative to the project root). |
| `baseURL`       | `string` | The base URL path where the site will be served (e.g., `/` or `/docs/`). |
| `siteURL`       | `string` | The origin the site is served from, e.g. `https://docs.example.com`. Needed for canonical URLs, `sitemap.xml` and search result breadcrumbs. Optional. |
| `lang`          | `string` | Language of the docs for the `<html lang>` attribute (default: `en`). Optional. |
| `fontawesomeKit`| `string` | Your [FontAwesome](https://fontawesome.com/) kit ID for loading icons. Optional: without a kit, the free Font Awesome icons are used. |
| `editURL`       | `string` | Base URL for "Edit this page" links; the doc's path is appended, e.g. `https://github.com/org/repo/edit/main/docs/`. Optional. |

### Navbar

The `navbar` section configures the top navigation bar:

```yaml
navbar:
  logo: "logo.svg"
  source:
    name: "Github"
    icon: "fa-brands fa-github"
    link: "https://github.com/my-org/my-repo"
  links:
    - name: "Homepage"
      icon: "fa-solid fa-house"
      link: "https://example.com"
```

| Option          | Type     | Description                                      |
|-----------------|----------|--------------------------------------------------|
| `navbar.logo`   | `string` | Path to the logo image displayed in the navbar.  |
| `navbar.source` | `object` | Link to the source code repository.              |
| `navbar.links`  | `array`  | Additional navigation links in the navbar.       |

Each entry in `navbar.source` and `navbar.links` has the following properties:

| Property | Type     | Description                                |
|----------|----------|--------------------------------------------|
| `name`   | `string` | Display text for the link.                 |
| `icon`   | `string` | FontAwesome icon class for the link.       |
| `link`   | `string` | URL the link points to.                    |

### Index (Landing Page)

The `index` section controls the landing page that visitors see when they first open your documentation site:

```yaml
index:
  title: "Welcome to the Docs"
  description: "Your project's documentation hub."
  icon: "fa-solid fa-rocket"
```

| Option              | Type     | Description                                |
|---------------------|----------|--------------------------------------------|
| `index.title`       | `string` | Main heading on the landing page.          |
| `index.description` | `string` | Subtitle or description text.              |
| `index.icon`        | `string` | FontAwesome icon displayed on the landing page. |

### Languages

Languages for syntax highlighting are not configured by hand. Clay Oven detects them from the fenced code blocks in your docs and writes them into the `langs` field of the bundled `clay.yaml`. A `langs` field in your own `clay.yaml` is ignored.

Languages are named with [Shiki language identifiers](https://shiki.matsu.io/languages). Code blocks with an unknown language are rendered as plain text.

## dir-meta.yaml

The `dir-meta.yaml` file provides metadata for directories within `docs/`. Without this file, directories will appear in the sidebar using their folder name and have no icon.

```yaml
- path: "guides"
  name: "Guides"
  icon: "fa-solid fa-book"
  children:
    - path: "advanced"
      name: "Advanced Topics"
      icon: "fa-solid fa-graduation-cap"
      children:
```

| Property   | Type     | Description                                            |
|------------|----------|--------------------------------------------------------|
| `path`     | `string` | The directory name (relative to `docs/`).              |
| `name`     | `string` | The display name shown in the sidebar navigation.      |
| `icon`     | `string` | FontAwesome icon class for the directory.              |
| `children` | `array`  | Nested directory metadata for subdirectories.          |
| `order`    | `number` | Position in the navigation; see [Page order](writing-documentation.md#page-order). |

> [!TIP]
> If you omit `dir-meta.yaml`, Clay Oven will still generate the site — directories will just use default names derived from the folder names.

## Environment Variable Overrides

Clay Oven allows you to override selected `clay.yaml` fields at **build time** using environment variables. This is useful in CI/CD pipelines where settings like the base URL or title may differ between environments. The overrides are applied only to the build output — your `clay.yaml` file is never modified.

| Variable               | Overrides         | Example                          |
|------------------------|-------------------|----------------------------------|
| `CLAY_TITLE`           | `title`           | `CLAY_TITLE="My Docs"`          |
| `CLAY_BASE_URL`        | `baseURL`         | `CLAY_BASE_URL="/docs"`         |
| `CLAY_SITE_URL`        | `siteURL`         | `CLAY_SITE_URL="https://x.dev"` |
| `CLAY_FONTAWESOME_KIT` | `fontawesomeKit`  | `CLAY_FONTAWESOME_KIT="abc123"` |

```bash
CLAY_BASE_URL="/my-project" CLAY_TITLE="My Project" ./clay-oven
```

During the build, Clay Oven displays which environment variables are set and prompts you to confirm before applying them (unless running with `-nc` or `-ci`).

> [!IMPORTANT]
> These environment variables are processed by **Clay Oven** during the build. They are not read by the Clay frontend at runtime.

## Example: Full Configuration

Here's a complete `clay.yaml` showing all available options:

```yaml
title: "My Project"
favicon: "logo.svg"
baseURL: "/my-project/"
fontawesomeKit: "abc123def"
navbar:
  logo: "logo.svg"
  source:
    name: "GitHub"
    icon: "fa-brands fa-github"
    link: "https://github.com/my-org/my-project"
  links:
    - name: "Homepage"
      icon: "fa-solid fa-house"
      link: "https://my-project.com"
    - name: "Blog"
      icon: "fa-solid fa-rss"
      link: "https://my-project.com/blog"
    - name: "Support"
      icon: "fa-solid fa-life-ring"
      link: "https://my-project.com/support"
index:
  title: "My Project Documentation"
  description: "Everything you need to know about My Project."
  icon: "fa-solid fa-rocket"
```
