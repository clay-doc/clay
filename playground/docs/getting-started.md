---
title: Getting Started
icon: fa-solid fa-play
---

# Getting Started with Clay

Welcome to Clay! This guide will walk you through setting up your first documentation site from scratch using [Clay](https://github.com/clay-doc/clay) and [Clay Oven](https://github.com/clay-doc/clay-oven).

## Prerequisites

Before you begin, make sure you have the following:

- **Git** — for cloning and version control
- A project repository where you want to add documentation

> [!TIP]
> You don't need to install Clay Oven ahead of time — it can be run directly via a one-line install script.

## Step 1: Create Your Project

Start by creating a new directory for your documentation project (or use an existing repository):

```bash
mkdir my-docs
cd my-docs
```

## Step 2: Add a Configuration File

Create a `clay.yaml` file in the root of your project:

```yaml
title: "My Project"
favicon: "logo.svg"
baseURL: "/"
fontawesomeKit: "your-kit-id"
navbar:
  logo: "logo.svg"
  source:
    name: "Github"
    icon: "fa-brands fa-github"
    link: "https://github.com/my-org/my-project"
index:
  title: "Welcome to My Project"
  description: "Documentation for My Project."
  icon: "fa-solid fa-book"
```

> [!IMPORTANT]
> The `fontawesomeKit` field requires a valid [FontAwesome](https://fontawesome.com/) kit ID for icons to render. You can create a free kit at [fontawesome.com](https://fontawesome.com/).

## Step 3: Create Your First Document

Create a `docs/` directory and add a Markdown file:

```bash
mkdir docs
```

Then create `docs/introduction.md`:

```markdown
---
title: Introduction
icon: fa-solid fa-door-open
---

# Introduction

Welcome to My Project! This is your first documentation page.
```

## Step 4: Build Your Site

Run Clay Oven to build your documentation. The easiest way is via the install script:

```bash
curl -fsSL https://raw.githubusercontent.com/clay-doc/clay-oven/refs/heads/main/run-oven.sh | sh
```

This downloads the appropriate Clay Oven binary for your platform, scans your `docs/` directory, generates the site structure, and outputs a ready-to-deploy bundle in the `./output` directory.

> [!TIP]
> You can also download the Clay Oven binary directly from the [releases page](https://github.com/clay-doc/clay-oven/releases/latest) and run it with `./clay-oven`.

## Step 5: Preview Your Site

Open the generated files in the `./output/public` directory with any static file server to preview your documentation site:

```bash
npx serve ./output/public
```

That's it! You now have a fully functional documentation site powered by Clay.

## Next Steps

- Learn about [Writing Documentation](writing-documentation.md) to master Markdown in Clay.
- Explore [Configuration](configuration.md) for a full reference of all options.
- Check out how to organize pages in [Organizing Pages](guides/organizing-pages.md).
