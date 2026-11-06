# Local validation evidence

Recorded 4 November 2026. Tests use fictional records and engineering schedule fixtures. None of these results establishes clinical approval or live-data authorization.

## Environment

- Windows workspace; Node.js 24.19.0 and npm 11.17.0.
- Next.js 16.4.5 production build, React 19.3.1 and TypeScript 6.0.3.
- Installed Google Chrome through Playwright's `chrome` channel; desktop and 360 × 800 viewport emulation.
- PGlite PostgreSQL with simulated Supabase roles and `auth.uid()`; no Docker or hosted Supabase project was used.

## Results

| Check | Result | Evidence |
|---|---|---|
| Locked dependency install | Passed after stopping the server to release a Windows compiler-file lock | `npm ci --cache .npm-cache --no-audit` |
| Production build | Passed, including TypeScript and static/route generation | `npm run build`; build-versioned offline shell |
| Lint | Passed without warnings | `npm run lint` |
| Type checking | Passed, including generated Next.js route types | `npm run typecheck` |
| Unit/domain/storage/hosting | **75 passed** | `tests/unit`; `artifacts/unit-validation.json` |
| PostgreSQL/RLS/RPC | **36 checks passed** | `scripts/test-database.ts`; `artifacts/database-validation.json` |
| Browser workflows | **13 passed** in the final expanded run | `tests/e2e`; production server; 32.2 seconds |
| OpenAPI | Generated from current domain schemas | `npm run api:docs`; `docs/openapi.json` |
| Production dependency audit | **0 vulnerabilities reported** | `npm audit --json --omit=dev` |

The unit/database cases cover calendar arithmetic and leap dates, stable schedule assignments, uncertainty, verified vs reported evidence, immutable corrections, role/scope restrictions, linked birth consistency, twins, failed form rollback, equal-timestamp dependency ordering, lost-acknowledgement receipt replay, stale revisions/reviews, consent and supervisor-review rules, task completion evidence and offline audit receipts.

Browser scenarios cover dashboard/navigation/search; consented registration and persistence; unknown DOB; separate vaccine verification; full offline reload; twins and DOB correction reason; attempted contact vs verified maternal-care completion; session creation/cancellation; language persistence and administrative search isolation; duplicate review; consent withdrawal; and 360px/axe checks across core screens and the child form. Axe checks include WCAG 2 A/AA and 2.1 AA tags; contrast issues found in the first run were fixed rather than suppressed.

Visual artifacts are written to `artifacts/dashboard-desktop.png`, `artifacts/dashboard-mobile.png` and `artifacts/child-form-mobile.png`. Machine reports, browser traces and screenshots are ignored generated artifacts, not source requirements. The database report explicitly identifies its simulated Auth environment.

## Hosting preparation checks

The hosting tooling was checked locally on 4 November 2026:

- `npm run build:hosted` passed with a **synthetic** Supabase URL/publishable key supplied only to the build process. This verifies connected-mode compilation, not project connectivity or deployment.
- `npm run build` then passed in demo mode, restoring the local demo output and versioning its service worker. No root `.env.local` was created.
- `npm run hosting:check` exited with code 1 when hosted settings were absent, as intended. Unit tests reject demo mode, missing public values, invalid project URLs, privileged/user keys, mismatched legacy projects and expired keys.
- Connection probes passed against mocked HTTP responses; tests also verify failure on public signups, invalid keys, readable rows, missing tables/RPCs and network errors. They verify GET/HEAD-only requests and proper publishable-key headers. No live `supabase:check` result is claimed.
- The setup command was exercised in an ignored temporary artifact directory. It created only public environment entries, preserved an existing file and rejected a private key without printing it or creating a file.
- `supabase/verify.sql` returned all 48 checks true in PGlite. Deliberately disabling RLS and exposing an internal helper caused the relevant checks to fail, and the test rolled back both changes.
- Lint and TypeScript checks passed after the tooling changes. The 13 browser checks above are the earlier application run; hosting-only changes did not add new browser-test evidence.

Supabase and Vercel integrations remain unconnected. No project, remote schema, staff account, cloud environment or hosted URL has been created by this hosting work. Continue with [HOSTING.md](HOSTING.md) after account access is available.

## Limits and outstanding checks

- Hosted Supabase login/cookie refresh/logout, remote RLS, actual Auth throttling, two-browser sync and account/scope revocation have **not** been tested against a configured project. Follow the setup guide's smoke test.
- A clean hosted encrypted backup restore and incident/lost-device exercise have **not** been demonstrated.
- Mobile viewport emulation is not a physical low-end Android benchmark, glyph review, full screen-reader/200% zoom review or field usability study.
- English/Nepali/Bhojpuri string coverage is incomplete, and translations/glossary have not received human clinical/language sign-off.
- Sync currently pulls a full scoped snapshot. Incremental cursor sync, advanced identity merge/transfer application, in-app staff management and approved HMIS CSV remain open. SMS/growth are deferred.
- Clinical schedules, overdue/grace rules, ANC/PNC configuration and controller/retention/device policy remain external gates. The four-hour offline lease and 1,000-event audit queue are engineering defaults.
- GitHub Actions is configured but no hosted CI execution was available in this workspace.

The full dependency audit reported **16 moderate development-only advisories**, originating from `minimatch <11.0.1` in the ESLint toolchain. npm's proposed automatic fixes include major downgrades; no forced downgrade was applied. ESLint 9.39.5 also emits a support/deprecation notice during installation. A compatible lint-toolchain upgrade is an open maintenance item; production dependencies had no reported advisory in the recorded audit.

Use the [development checklist](../DEVELOPMENT_CHECKLIST.md) to assign and close these remaining acceptance items with actual evidence.
