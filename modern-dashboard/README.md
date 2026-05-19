# Modern Dashboard Astro Shell

SPEC-04 adds the first Astro shell for the modern Jira release dashboard. It is intentionally parallel to the existing generated `index.html` so active boards can keep using the proven static page and Cloudflare bridge while the modern surface reaches parity.

## Local Preview

Copy or symlink a board's `dashboard-data.json` into a local web-accessible path, then run:

```powershell
npm ci
npm run dev
```

By default the shell looks for `../dashboard-data.json` so a GitHub Pages preview can live under `/modern/` while sharing the board's root data artifact.

Override the data path when needed:

```powershell
$env:PUBLIC_DASHBOARD_DATA_URL = "/dashboard-data.json"
npm run dev
```

## Static Build

```powershell
$env:ASTRO_BASE = "/jira-board-v3001-122-0/modern/"
$env:ASTRO_SITE = "https://dewankabir009.github.io/jira-board-v3001-122-0/"
$env:PUBLIC_DASHBOARD_DATA_URL = "../dashboard-data.json"
npm ci
npm run build
```

The output in `dist/` is static and can be uploaded to GitHub Pages when the migration is ready to publish a `/modern/` preview.

## Migration Rule

Do not replace the current generated board until the Astro shell has parity for ticket scanning, filters, Jira links, assignee writes, checklist comments, media, and release-board navigation.
