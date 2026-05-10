# GolfNow CORE Jira Board Template

Central template repo for creating one GitHub Pages Jira dashboard per CORE fixVersion.

This repo owns the shared dashboard code: Jira pulls, HTML generation, GitHub Actions refreshes, Slack/email notification hooks, assignee updates, checklist comment posting, and the Cloudflare Worker bridge source. Release-board repos should contain generated release data; this repo should not.

## What This Template Includes

- Responsive Jira dashboard generator: `pull-jira-release-tickets.cjs`
- GitHub Actions refresh workflow with repeated 5-minute checks inside each scheduled run
- Secured Jira assignee update workflow
- Checklist comment workflow for posting QA checklist results back to Jira
- Slack and email notification script hooks
- Cloudflare Worker bridge source for hosted assignee/checklist dispatch
- Local bridge fallback scripts for development
- Placeholder `index.html` so the template repo can be published safely without live Jira data

## How To Spin Up A New Board

Recommended release-board repo name:

```text
jira-board-v3001-124-0
```

Repository variables required on every generated board:

- `JIRA_FIX_VERSION`: Jira fixVersion, for example `v3001.124.0`
- `ASSIGNEE_DISPATCH_ENDPOINT`: hosted bridge `/assign` endpoint
- `TEST_CHECKLIST_COMMENT_ENDPOINT`: hosted bridge `/comment-checklist` endpoint
- `TRUSTED_GITHUB_ACTORS`: optional comma-separated GitHub actors allowed to trigger Jira writes; defaults to the repo owner

Repository secrets required on every generated board:

- `JIRA_MCP_TOKEN`
- `JIRA_EMAIL`
- `JIRA_CLOUD_ID`

Optional notification secrets:

- `SLACK_BOT_TOKEN`
- `SLACK_CHANNEL_ID`
- `SLACK_WEBHOOK_URL`
- `QA_EMAIL_TO`
- `QA_EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_SECURE`
- `SMTP_REJECT_UNAUTHORIZED`

Cloudflare Worker setup for Jira write actions:

- Add the new board repo to `ALLOWED_REPOSITORIES`.
- Keep `ALLOWED_ORIGINS` set to the GitHub Pages owner origin, for example `https://dewankabir009.github.io`.
- Set `DEFAULT_REPOSITORY` only if the bridge should have a default board.
- Set `BOARD_DISPATCH_TOKEN` as a Worker secret with GitHub Actions dispatch permission for the release-board repos.
- If Cloudflare Access protects the Worker, configure `ALLOWED_USER_EMAILS`, `ACCESS_AUD`, `ACCESS_JWKS_URL`, and `ACCESS_ISSUER`.

## Local First Pull

```powershell
$env:JIRA_FIX_VERSION = "v3001.124.0"
$env:BOARD_OWNER = "DewanKabir009"
$env:BOARD_REPOSITORY_NAME = "jira-board-v3001-124-0"
$env:BOARD_REPOSITORY_SLUG = "DewanKabir009/jira-board-v3001-124-0"
$env:DASHBOARD_URL = "https://dewankabir009.github.io/jira-board-v3001-124-0/"
node pull-jira-release-tickets.cjs $env:JIRA_FIX_VERSION
Copy-Item -Path jira-board-latest.html -Destination index.html
```

## Template Update Rule

Design and functionality updates should land here first. Then apply the same scoped change to active release-board repos, currently `jira-board-v3001-122-0` and `jira-board-v3001-123-0`. New release-board repos created after the template update inherit the latest behavior from day one.

Generated data that does not belong in this template:

- `jira-v*-tickets.json`
- `jira-board-latest.html`
- Jira media under `assets/jira-media`
- Release-specific screenshots
- Release-specific logs

## Current Template Capabilities

- Responsive layout across desktop and smaller screens
- Collapsible status sections
- Expandable/collapsible subtasks
- Component filters with copyable component list
- QA filters
- Priority summary section
- Priority-based ticket sorting inside status sections
- Ticket description modal with embedded Jira images
- Data Pull diff summary with retained change history
- Copy actions for ticket links
- Secured assignee picker
- Markdown-backed test checklist modals
- Checklist Jira comment posting with inline image support when Jira token access is available
- Slack notification formatting for added, updated, moved, and removed tickets
- Email notification hook for future SMTP or email-service wiring
- Cloudflare-hosted bridge support

## Version History

### v1.10.2

- Centralized the dashboard code into a reusable template repo.
- Removed hardcoded `v3001.122.0` board identity from the generator, workflows, notification scripts, bridge server, and Worker defaults.
- Added repo-aware dashboard URL, repository slug, and GitHub Pages metadata.
- Kept the latest active-board functionality as the template baseline.

### v1.10.1

- Added Cloudflare Access JWT validation to the hosted bridge.
- Updated dashboard bridge calls to avoid CORS preflight by posting JSON as `text/plain;charset=UTF-8`.

### v1.10.0

- Added hosted Cloudflare Worker bridge support so assignee updates are no longer tied to a local laptop bridge.
- Added bridge status indicator in the dashboard footer.

### v1.9.x

- Added ticket description modals with Jira description text and embedded image support.
- Added priority summary cards and priority-based ticket ordering.
- Added Slack notification cleanup for human-readable status moves and ticket updates.

### v1.8.x

- Added QA filters, component filters, copy icons, subtask controls, and the Data Pull retained history section.
