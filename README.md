# Maatri-Shishu

A mother and child follow-up workspace for FCHVs and health-post staff, implemented from [the research report and PRD](Maatri-Shishu_Research_Report_and_PRD.md).

**Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui conventions with Radix primitives, Supabase PostgreSQL and Supabase Auth. The repository contains a working application and a local synthetic demo.

## Run the demo

Use Node.js 24 and npm. From this directory:

```sh
npm ci
npm run dev
```

On Windows, stop any running Next.js server before reinstalling with `npm ci`; its native compiler files can otherwise be locked by the running process.

Open **http://127.0.0.1:3000**. No Supabase account, credentials or Docker are needed. With no Supabase environment variables, the app opens its fictional practice workspace. You can also copy `.env.example` to `.env.local` and leave `NEXT_PUBLIC_DEMO_MODE=true`.

The default operator is a synthetic health worker. Settings lets you switch practice roles, change language and reset practice data. Demo changes stay in this browser's IndexedDB; “sync” in demo mode only acknowledges the local practice queue. It does not upload records.

To test the installable/offline version:

```sh
npm run build
npm run start
```

Load the app online once, wait for the service worker, then use browser developer tools to go offline. A full offline reload is supported. Stop the development server before starting the production server on the same port. After an update, close all app tabs and reopen online to activate the new cached shell.

## Implemented workflows

- Dashboard, scoped mother/child lists, search and individual profiles.
- Consented registration, likely-duplicate review, pregnancy episodes, independent children, uncertain DOB, birth details and shared birth events for twins.
- ANC, separate maternal/newborn PNC, maternal Td and vaccination event recording; source labels, separate verification, immutable correction links and reasoned DOB corrections.
- Versioned schedule configuration, separate clinical/programme approval roles and reproducible vaccine timelines. The demo schedule is a **test fixture**; connected storage rejects activation of test schedules.
- Follow-up worklists, structured contact outcomes, provider-entered appointments, verified-care completion and clinic session changes.
- Review queues, basic cohort reports, audited JSON export and printable summaries.
- Durable local transactions, atomic server form batches, retry receipts, revision conflicts, an offline access lease and a bounded queue for profile-read/print audit metadata.
- English, Nepali and Bhojpuri catalog support with locally packaged fonts. Translations and string coverage remain a draft.

## Connect Supabase

For a new project, follow [the Supabase + Vercel hosting guide](docs/HOSTING.md). It includes project creation, database setup, staff login and deployment from this directory. Run `npm run supabase:configure` to create the local public environment, `npm run hosting:check` to validate build settings, and `npm run supabase:check` to probe the connected project.

The [detailed Supabase setup guide](docs/SUPABASE_SETUP.md) covers roles and connected acceptance tests. Application requests use the signed-in staff session and PostgreSQL authorization; the private secret/service-role key is used only by the provisioning script. Vercel uses `npm run build:hosted`, which requires connected mode and valid public settings.

Changing `NEXT_PUBLIC_*` variables requires a rebuild. Keep demo and connected deployments on separate origins. The two modes also use separate IndexedDB databases.

## Validate

```sh
npm run lint
npm run typecheck
npm test
npm run db:test
npm run api:docs
npm run build
npx playwright install chromium
npm run test:e2e
```

On Windows with Chrome already installed, set `$env:PLAYWRIGHT_CHANNEL='chrome'` in PowerShell before running the browser suite. Browser tests require the production build; Playwright starts the production server when needed. Tests use isolated synthetic browser contexts.

`db:test` executes the migration, RLS and RPC checks in PGlite PostgreSQL with simulated Supabase roles and `auth.uid()`. It does **not** test a hosted Supabase Auth deployment. See [validation evidence and limits](docs/VALIDATION.md).

## Project guide

| Location | Purpose |
|---|---|
| `src/app` | App Router entry points, auth and workspace route handlers |
| `src/components/workspace` | Dashboard, records, forms and operational screens |
| `src/components/ui` | Local shadcn-style accessible UI components |
| `src/lib/domain` | Typed schemas, authorization, date/schedule rules and worklists |
| `src/lib/db.ts` | Dexie schema and atomic local persistence |
| `supabase/migrations` | PostgreSQL tables, constraints, RLS, audit and transactional RPCs |
| `scripts` | Staff provisioning, database validation, OpenAPI and service-worker versioning |
| `tests` | Domain/storage and browser workflow checks |

The [development plan](DEVELOPMENT_PLAN.md) describes the implemented architecture and remaining milestones. The [checklist](DEVELOPMENT_CHECKLIST.md) separates verified work from unfinished engineering and external gates. Also see [API documentation](docs/API.md), [OpenAPI](docs/openapi.json), [the demo walkthrough](docs/DEMO_WALKTHROUGH.md) and [operating runbooks](docs/OPERATIONS.md).

This release is a **synthetic engineering demo**. Hosted integration, complete human-reviewed translations, field/device testing, clinical configuration approval, controller decisions and a demonstrated backup restore remain prerequisites for a live pilot. Advanced identity merge/transfer, incremental cursor sync, SMS and growth workflows are not implemented. The app does not diagnose, prescribe or replace official health cards and registers.
