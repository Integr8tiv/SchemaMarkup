# SchemaMarkup

Integr8tiv reusable Schema.org JSON-LD emitter for iMIS RiSE websites.

A single shared core (`Core/SchemaCore.js`) plus one thin per-client wrapper (`<Client>/Schema<CLIENT>.js`) that supplies the configuration values. Loaded from this GitHub repo via jsDelivr and injected into iMIS RiSE via **Manage Websites → Advanced Options**.

## Repo layout

```
SchemaMarkup/
├── Core/
│   └── SchemaCore.js          # shared logic, exposes window.I8VSchemaMarkup
├── SHEEd/
│   └── SchemaSHEED.js         # SHEEd config + init call
├── AISA/                       # (future)
│   └── SchemaAISA.js
└── README.md                   # this file
```

## What it emits (v1)

A single `<script type="application/ld+json">` block in the page `<head>`, containing an `@graph` of four connected nodes:

1. **Organization** (subtyped per client — e.g. `EducationalOrganization`, `ProfessionalAssociation`) with address, geo, email, optional telephone, optional sameAs, and an optional `parentOrganization` chain (e.g. SHEEd → Faculty of Medicine and Health → University of Sydney).
2. **WebSite** with `SearchAction` pointing at the RiSE `/search` shortcut.
3. **WebPage** — or `AboutPage` / `ContactPage` when the URL matches the configured patterns. `mainEntity` points back to the Organization for About / Contact pages.
4. **BreadcrumbList** scraped from the master-page breadcrumb DOM if present (skipped silently if no breadcrumb exists).

All four nodes share `@id`s that reference each other, so search engines and LLMs see them as one connected graph.

## Wire-up in iMIS RiSE

1. Open **Manage Websites → \<your website\> → Advanced Options**.
2. Paste two `<script>` tags into the HEAD section, in order — core first, client second:

```html
<script src="https://cdn.jsdelivr.net/gh/Integr8tiv/SchemaMarkup@main/Core/SchemaCore.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Integr8tiv/SchemaMarkup@main/SHEEd/SchemaSHEED.js"></script>
```

3. Save and publish. Open any page and view source — search for `application/ld+json` to confirm the block was emitted.

> **jsDelivr cache:** changes pushed to GitHub usually appear within minutes. To force-refresh during development, pin a commit SHA in the URL instead of `@main` (e.g. `@abc1234`), or append `?nocache=1` to the script URL.

## Adding a new client

1. Create `<ClientName>/Schema<CLIENT>.js`. Easiest: copy `SHEEd/SchemaSHEED.js` and swap the values inside the `_CONFIG` object.
2. Required config fields:
   - `organization.type` — Schema.org Organization subtype (`Organization`, `EducationalOrganization`, `ProfessionalAssociation`, `Corporation`, `LocalBusiness`, etc.)
   - `organization.name`
   - `organization.url`
3. Optional fields — include only the ones with real data. Anything left out is silently dropped by the core (no empty `null` / `""` in the emitted JSON).
4. Push to GitHub, paste the two-script snippet into the client's iMIS Advanced Options.

See `SHEEd/SchemaSHEED.js` for a worked example.

## Debug mode

Append `?schemaDebug=1` to any page URL. The core will log:

- the detected page type (`home` / `about` / `contact` / `other`)
- the emitted `@graph` array
- breadcrumb skip notices
- any caught errors

In production (no flag), the core is silent. JSON is also minified in production and pretty-printed in debug.

You can also force a page type from the master page or a content item by adding `data-schema-page-type="about"` (or `contact`, `home`, `other`) to the `<body>` tag. The attribute wins over URL-pattern matching.

## Validation

After deploying, run each unique page type through:

- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema Markup Validator](https://validator.schema.org/)
- [HubSpot AEO Grader](https://www.hubspot.com/aeo-grader)

Also check from a browser:

```bash
# in DevTools console
document.querySelectorAll('script[type="application/ld+json"]').forEach(s => console.log(JSON.parse(s.textContent)));
```

Across the site, every page should emit the **same** `@id` for the Organization node (so engines treat it as one entity), and a **unique** `@id` for each WebPage node.

## Version

`1.0.0-draft` — 2026-05-19. Not yet deployed. See `../schema-markup-design.md` for the design that produced this code.
