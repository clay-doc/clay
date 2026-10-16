---
title: Organizing Pages
icon: fa-solid fa-folder-tree
---

# Organizing Your Documentation

As your project grows, you'll want to organize your documentation into logical groups. Clay supports nested directories inside `docs/`, letting you create a clear hierarchy for your content.

## Directory Structure

Simply create subdirectories inside `docs/` and add Markdown files to them:

```text
docs/
├── getting-started.md
├── configuration.md
├── guides/
│   ├── authentication.md
│   ├── deployment.md
│   └── advanced/
│       ├── performance.md
│       └── scaling.md
└── api/
    ├── overview.md
    ├── endpoints.md
    └── errors.md
```

Clay automatically discovers all Markdown files and builds the navigation tree based on this folder structure.

## Adding Directory Metadata

By default, directories appear in the sidebar using their folder name. To give them a custom display name and icon, use the `dir-meta.yaml` file in the root of your project:

```yaml
- path: "guides"
  name: "User Guides"
  icon: "fa-solid fa-book-open"
  children:
    - path: "advanced"
      name: "Advanced Topics"
      icon: "fa-solid fa-graduation-cap"
      children:
- path: "api"
  name: "API Reference"
  icon: "fa-solid fa-code"
  children:
```

### How Nesting Works

The `children` property allows you to define metadata for subdirectories. Each level mirrors the folder structure:

```yaml
- path: "top-level-dir"
  name: "Top Level"
  icon: "fa-solid fa-folder"
  children:
    - path: "nested-dir"
      name: "Nested Section"
      icon: "fa-solid fa-folder-open"
      children:
        - path: "deeply-nested"
          name: "Deep Section"
          icon: "fa-solid fa-layer-group"
          children:
```

> [!TIP]
> Even if a directory has no subdirectories, include an empty `children:` field to maintain a consistent structure.

## Best Practices

### Group Related Content

Organize pages by topic rather than by type. For example:

```text
# ✅ Good — grouped by topic
docs/
├── authentication/
│   ├── overview.md
│   ├── oauth.md
│   └── api-keys.md
└── deployment/
    ├── docker.md
    └── kubernetes.md

# ❌ Avoid — grouped by type
docs/
├── overviews/
│   ├── auth-overview.md
│   └── deploy-overview.md
└── tutorials/
    ├── auth-tutorial.md
    └── deploy-tutorial.md
```

### Keep It Shallow

Try to limit your directory depth to 2–3 levels. Deeply nested structures can be hard to navigate:

```text
# ✅ Good — 2 levels deep
docs/guides/advanced/performance.md

# ❌ Avoid — 4+ levels deep
docs/guides/advanced/topics/subtopics/performance.md
```

### Use Consistent Naming

Use lowercase filenames with hyphens as separators:

```text
# ✅ Good
getting-started.md
api-reference.md

# ❌ Avoid
GettingStarted.md
API Reference.md
api_reference.md
```

## This Directory

This page is inside the `guides/` directory, which demonstrates how subdirectories work in Clay. Check out the [deeper nesting example](advanced/advanced-features.md) to see how multi-level hierarchies are handled.
