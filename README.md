# BugCatcher Mobile Web

React + Vite mobile web client for the BugCatcher `super_admin` experience.

## Product Goal

Build a mobile-first command UI for daily BugCatcher operations with:

- chart-first dashboard summaries
- concise labels and actions (KISS copy)
- legacy BugCatcher naming parity
- bottom navigation + side drawer model

This mobile app now uses the live BugCatcher API for authenticated issue, checklist, and AI chat flows, including multipart evidence uploads on supported screens.

## Mobile-First Rule

- Desktop: always render inside a centered phone frame (`390px` to `430px` style target).
- Mobile: full device width, same single-column layout.
- No tablet/desktop layout variants.
- Bottom nav remains fixed and visible.
- Drawer remains default-closed.

## Route Map

Auth:

- `/login`
- `/signup`
- `/forgot-password`
- `/forgot-password/verify`
- `/forgot-password/success`

App:

- `/app/dashboard`
- `/app/organizations`
- `/app/projects`
- `/app/reports`
- `/app/profile`
- `/app/notifications`
- `/app/super-admin`
- `/app/ai-admin`
- `/app/manage-users`
- `/app/checklist`
- `/app/settings`

## Navigation Model

Bottom nav (compact labels):

- Dashboard (`Dash`)
- Organization (`Org`)
- Projects
- Issues
- Profile

Drawer (legacy-aligned names):

- Super Admin
- AI Admin
- Checklist
- Manage Users
- Settings
- Logout

Desktop pointer devices may show hover label hints in nav; mobile does not depend on hover.
Top-right app action is notifications, not AI.
Profile is a dedicated bottom-nav page.

## KISS Copy + Visual Rules

- Keep labels short and operational.
- Prefer chart, metric, badge, and status visuals over explanatory paragraphs.
- Avoid multi-sentence body copy in app screens.
- Keep helper text only when input clarity needs it.
- Dashboard must show an immediate chart summary in the first section, then KPI cards.

## Visual Direction

Palette from uploaded references:

- `--shell-bg: #11161d`
- `--shell-elevated: #1b222c`
- `--surface-primary: #f3f1eb`
- `--surface-secondary: #e7e3da`
- `--text-primary: #0f1720`
- `--text-muted: #7d8b99`
- `--accent-steel: #49627c`
- `--accent-success: #39b36b`
- `--accent-success-pressed: #2d9959`
- `--accent-danger: #e55a5a`
- `--border-subtle: rgba(17, 22, 29, 0.12)`

Typography:

- Headings: `Sora`
- Body/UI: `Manrope`
- Compact global scale for mobile density

## Architecture Notes

- Shared UI is organized in `src/components` for DRY reuse.
- Routes are kept stable while page content stays static.
- Typed static data remains in `src/app-data.ts`.

## Commands (Bun)

```bash
bun install
bun run dev
bun run lint
bun run build
```

## Deployment

GitHub Actions deploys this app to the GCloud VM on every push to `main`.

## Attachment Flows

- Issue creation supports optional image evidence uploads.
- Report detail renders uploaded issue evidence.
- Checklist item detail supports live attachment uploads through the backend checklist API.
- AI chat screenshot uploads still go through the backend and do not require frontend Cloudinary secrets.

Canonical live hostnames:

- `https://m.webtest.solutions`
- `https://mobile.webtest.solutions`

Legacy redirect hostnames:

- `https://m.bugcatcher.online`
- `https://mobile.bugcatcher.online`

Server target:

- web root: `/var/www/bugcatcher-mobileweb`
- nginx config: `/etc/nginx/sites-available/bugcatcher-mobileweb.conf`

Required GitHub repository secrets:

- `DEPLOY_HOST`: `35.247.181.223`
- `DEPLOY_USER`: `m_viner001`
- `DEPLOY_SSH_PRIVATE_KEY`: private key that can SSH to the VM
- `DEPLOY_KNOWN_HOSTS`: output from `ssh-keyscan -H 35.247.181.223`

Workflow:

1. `npm ci`
2. `npm run build`
3. Upload release bundle to the VM
4. Publish `dist/` to `/var/www/bugcatcher-mobileweb`
5. Install Nginx config, issue/reuse TLS certs for both the legacy and new mobile hosts, test config, reload Nginx
