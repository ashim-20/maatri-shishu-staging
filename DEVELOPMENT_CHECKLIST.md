# Maatri-Shishu development checklist

Updated 4 November 2026. Checked items are implemented engineering deliverables with source or local verification evidence. An unchecked item is still open; the full PRD and live-pilot gate are **not** complete.

Use [the plan](DEVELOPMENT_PLAN.md) for architecture and requirement mapping, [validation](docs/VALIDATION.md) for check results, and [the PRD](Maatri-Shishu_Research_Report_and_PRD.md) for original acceptance criteria. Owner labels describe responsibilities; no external reviewer has been appointed by this task.

## M0 — Scope and decisions

- [x] Adopt Next.js App Router + React + TypeScript, Tailwind + shadcn/ui, Supabase PostgreSQL + Auth.
- [x] Provide local synthetic demo mode and instructions to connect Supabase, as requested by the user.
- [x] Keep the original PRD and separate clinical/controller acceptance from engineering tests.
- [ ] Name delivery, health-post, clinical/programme, controller/privacy, language and support owners. Owner: product.
- [ ] Close D-01–D-08 in the plan with dated decisions and evidence. Owner: relevant local authority.

## M1 — Foundation

- [x] Root Next.js application, strict TypeScript, pinned dependencies/lockfile, environment example, lint/build/test commands.
- [x] Responsive workspace shell, local UI primitives, keyboard dialogs, loading/error/empty states and role-aware navigation.
- [x] Supabase Auth route handlers and server-side HttpOnly cookies; no client service key or public staff signup flow.
- [x] Migration for organizations, staff/scopes and all implemented domain entities; generated foreign keys and RLS.
- [x] RPC checks for current role, facility/ward, related records, expected versions, immutable history and idempotency.
- [x] Staff provisioning script creates a disabled profile and enables it only after scope assignment.
- [x] Atomic Dexie transactions and server form batches; receipt replay and rollback tests.
- [x] Versioned service-worker shell, manifest and PNG icons. Full offline reload verified in a production build.
- [x] Generate OpenAPI from the domain schemas; provide CI configuration.
- [ ] Exercise hosted Supabase login, refresh, logout, disabled-user handling, origin checks, RLS and project Auth rate limits with two real test accounts. Owner: engineering/QA.
- [ ] Review production auth, CSP/TLS, secret management, administrative and denied-access audit, and safe diagnostic correlation. Owner: security/operations.

## M2 — Mother, pregnancy, birth and care records

- [x] Consented mother registration with optional phone, search-before-create and duplicate review; identities remain separate.
- [x] Multiple pregnancy episodes with date sources, unknown dates and review flags.
- [x] Independent children with guardian information; no invented DOB or timeline.
- [x] Birth date/source, place/time, optional mother/pregnancy links and reuse for twins.
- [x] Reasoned DOB/link/schedule corrections; connected revisions preserve prior payloads.
- [x] ANC, separate mother/newborn PNC and maternal Td event recording, source/provider/date, verification and correction links.
- [x] FCHV limits match server rules for unverified vaccination history and clinical corrections.
- [x] Permissioned print summaries with generation information and official-card disclaimer.
- [ ] Complete approved duplicate merge/transfer application and richer pregnancy-history navigation. Owner: product/engineering/clinical.
- [ ] Obtain local agreement on consent wording, lawful basis, birth/date evidence, withdrawal, retention and death/move handling. Owner: controller/clinical.
- [ ] Add the approved late-first-ANC indicator and any signed ANC/PNC targets; do not infer them from an unreviewed configuration. Owner: clinical/engineering.

## M3 — Schedule and vaccinations

- [x] Versioned schedule fields: authority, source, effective dates, rules, clinical/programme approvers and test-only flag.
- [x] Separate clinical approval and programme activation; immutable approved versions.
- [x] Connected database rejects activation of test schedules.
- [x] Week/day and calendar-month calculations, leap-year/month-end fixtures, version boundaries and prior child assignments.
- [x] Planned dates, uncertain/unverified/rejected states, distinct verified completion and a due-only denominator.
- [x] Separate verification records and immutable correction chain; stale concurrent reviews rejected.
- [ ] Obtain current signed CHISS/local source and independent clinical expected-date fixtures. Owner: clinical/programme.
- [ ] Approve overdue/grace rules, birth-date reassignment policy and maternal/newborn terminology. Owner: clinical.

## M4 — Operational workflows

- [x] Worklists from assigned follow-ups, provider appointments and planned child doses; people/status/date buckets.
- [x] Structured contact outcomes with channel/date/next action; attempted contact never counts as completed care.
- [x] Explicit matching verified-care completion; reject or supersede the evidence and the task needs attention again.
- [x] Clinic creation/edit/cancellation with separate session dates and local/unpublished state.
- [x] Pending event verification, identity review and sync conflict UI.
- [x] Basic scoped cohort reports and permissioned/audited JSON export.
- [ ] Add staff reassignment UI, arbitrary date ranges, approved operational indicators and locally mapped export columns. Owner: product/engineering.
- [x] Suppress optional app follow-ups after withdrawal/decline, retain history and create a record-handling review.
- [ ] Agree the controller's final retention, access and disposal actions for that handling review. Owner: controller/health-post.

## M5 — Offline, languages and device hardening

- [x] Persistent registration/outbox after database restart and full offline browser reload.
- [x] Dependency ordering at equal timestamps and atomic grouped upload; no deletion before acknowledgement.
- [x] Visible conflict/rejection handling, local/shared comparison, single-edit reapply and whole-form discard/re-entry.
- [x] Current-assignment refresh before connected upload; four-hour offline lease and account-switch guard.
- [x] Bounded durable profile-read/print metadata queue, server receipt replay and sign-out guard.
- [x] English/Nepali/Bhojpuri preference persists; Devanagari fonts are packaged locally.
- [x] Automated axe checks and 360px layout tests for core screens and child registration; keyboard Escape tested.
- [ ] Finish externalizing every UI string and human-review Nepali/Bhojpuri catalogs/glossary. Owner: frontend/language/clinical.
- [ ] Test language changes with an in-progress form and complete keyboard/screen-reader/200% zoom review. Owner: UX/QA.
- [ ] Validate real Android glyph rendering, ≥44px touch targets and cached ≤3-second performance at the agreed data volume. Owner: QA/UX.
- [ ] Implement incremental cursor pull/scope-change minimization and benchmark large working sets. Owner: engineering.
- [ ] Test hosted two-device offline conflicts, revoked-account recovery and lost acknowledgements through actual HTTP/Auth. Owner: QA.
- [ ] Agree device lock/encryption, lease length, offline work recovery and queue retention policy. Owner: controller/operations.
- [ ] Conduct field tasks with at least 5 FCHVs and teach-back with at least 5 mothers/caregivers. Owner: UX/product/language.

## M6 — Delivery and release

- [x] Demo run/reset instructions, Supabase setup, staff provisioning, API documentation and synthetic walkthrough.
- [x] Local build, lint, TypeScript, unit/storage, PostgreSQL and browser checks; evidence listed in `docs/VALIDATION.md`.
- [x] GitHub Actions configuration for repeatable validation and artifact collection; no remote CI run claimed.
- [x] Deployment, backup/restore, incident, lost-device and rollout runbooks drafted.
- [x] Supabase/Vercel deployment tooling: public environment setup, guarded hosted build, read-only connection probes, 48 SQL schema/grant checks and private modern-key provisioning support.
- [ ] Create and connect the new Supabase project, provision test staff, deploy the Next.js website and record its actual HTTPS URL. Owner: engineering/account owner. See `docs/HOSTING.md`.
- [ ] Reproduce installation on another machine and run CI on the target repository/runner. Owner: engineering/QA.
- [ ] Configure hosted encrypted backups and restore into a clean isolated project; verify relationships/history and record RPO/RTO. Owner: operations.
- [ ] Exercise rollback, incident and lost-device runbooks with named responders. Owner: operations/controller.
- [ ] Finalize approved local-language training, support contact and budget. Owner: product/operations/language.
- [ ] Record independent engineering, clinical, privacy/controller, language, field/device and operational release decisions. Owner: appointed reviewers.

## Non-functional acceptance tracking

| PRD IDs | Evidence now | Open acceptance |
|---|---|---|
| NFR-001–003 | Production browser workflows, 360px/axe checks, keyboard dialog test | Reference-device performance, full touch/zoom/screen-reader review |
| NFR-004 | Transaction/restart/offline/replay tests | Hosted two-device failure exercise |
| NFR-005–007 | RLS/role/consent/immutable-history tests; HttpOnly server Auth integration | Deployed TLS/cookie/secret/privacy audit |
| NFR-008–009 | OpenAPI, strict types, migration, tests, CI configuration | Approved CSV mapping and hosted CI execution |
| NFR-010 | Catalogs, UTF-8, local fonts and language preference browser test | Complete strings, human sign-off and physical Android review |
| NFR-011 | Scoped JSON export and PostgreSQL recovery runbook | Clean encrypted backup restore and approved CSV |
| NFR-012 | Safe error messages and request IDs | Production logging/correlation, denied-access and operational monitoring review |

## Deferred backlog

- [ ] Phase 2: opt-in SMS with approved neutral text, gateway receipts and opt-out handling (FR-021).
- [ ] Phase 2: approved raw growth measurements without diagnosis/percentile interpretation (FR-022).
- [ ] Phase 2: mapped HMIS CSV, richer batch workflows, imports and optional caregiver access.
- [ ] Phase 3: authorized government integrations and multi-municipality service operations.

**Release gate:** Use synthetic data until clinical, controller, language, field/device, hosted-security and recovery gates have documented approval. No checklist tick or test count substitutes for those decisions.
