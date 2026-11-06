# Deployment and recovery runbooks

Status: procedures drafted for review. No hosted deployment, encrypted backup restore, real lost-device incident or live-pilot authorization was performed during implementation. Appoint an operations owner and data controller before using real records.

## Deploy or update

1. Use a separate staging Supabase project and app origin. Confirm the release's environment variables, migration version and clinical configuration status.
2. Run `npm ci`, lint/unit/database checks, generate OpenAPI and `npm run build`; run the production browser suite. Build-time public variables must match the target project/mode.
3. Apply reviewed migrations through the approved deployment process. The initial migration is for a clean database; do not rerun it over an existing schema. Add new versioned migrations for later releases.
4. Configure HTTPS and server environment variables on the Next.js host. Keep service-role/provisioning secrets out of the runtime/browser. Review Auth signup/rate limits and account assignment.
5. On Vercel, deploy using [the hosting guide](HOSTING.md) and the checked-in guarded build. For a self-managed Next.js host, start with `npm run start` behind TLS ingress. Check login, current scope, a synthetic registration/sync, audit, export restrictions and sign-out before releasing it to staff.
6. Have staff sync pending work before an update. The build versions the service-worker cache. Closing all app tabs and reopening online allows the waiting worker to activate; user data remains in IndexedDB.
7. Record release ID, build/migration versions, check results, approver and rollback target. CI configuration in this repository must be run and reviewed on the target repository/runner.

**Rollback:** stop rollout, retain a copy of diagnostics without clinical payloads, and restore the last compatible application build. Do not reverse migrations by deleting records or editing immutable history. Prefer an additive forward migration; if restoration is required, follow the clean-restore procedure and coordinate all clients with pending work.

## Provision, change scope or disable an account

Use the [staff provisioning guide](SUPABASE_SETUP.md). Administrative role/scope edits remain an authorized Supabase administration procedure. Record the requester, approver, actor, affected account, old/new scope and time in the organization's controlled access log.

Before a planned assignment change, let the operator sync and resolve their queue. Update the relevant `staff_profiles`/`staff_scopes` rows through trusted administration. Connected requests recheck active status and current scope; the next refresh replaces the downloaded working set.

For urgent disablement, set the profile inactive and revoke its Auth sessions through approved administrative tooling. Confirm online requests are denied. A disconnected browser cannot receive immediate revocation; its existing four-hour offline lease is the current engineering bound. That bound needs controller approval. Do not promise remote deletion of IndexedDB.

## Lost device or suspected exposure

1. Record the report, account/device, last known sync, incident time and responsible responder in the restricted incident system. Avoid placing clinical details in issue trackers or chat.
2. Disable the account, revoke Auth sessions and use approved device-management lock/wipe capabilities if available. This PWA does not implement remote wipe or a hardware-backed encryption key store.
3. Have the controller/security owner assess the likely cached/exported data and apply the organization's notification and retention duties.
4. Preserve audit/receipt evidence through restricted access. Do not reset browser storage on a recovered device until unsynced work has been assessed.
5. Reprovision a controlled device only after account access and current assignment are reviewed. Reconcile locally pending forms through a supervised recovery process; document any unrecoverable work.

## Unsynced work and conflicts

- Keep the same browser profile and original staff account. Clearing site data, uninstalling or deleting IndexedDB can destroy unsent work.
- Retry identical operation IDs after uncertain delivery. The database receipts prevent duplicate writes.
- Inspect local and shared values in Review queue. Reapply a single editable change only after checking the current record. A linked multi-record form is discarded/re-entered as a group; there is no automatic demographic merge.
- If scope/account changes block upload, stop editing and contact the authorized administrator. An approved temporary recovery scope or supervised reconciliation may be needed. Do not give broad access or use a service key in the browser.
- The access-audit queue is capped at 1,000 unsent events. Reconnect/reload to flush it if the device locks at that bound. Access metadata for a no-longer-permitted scope also requires administrative review.
- Successful sign-out clears the workspace database after queues are resolved. It does not delete exported files or printed copies. Follow the controller's handling policy for those artifacts.

## Backup and restore

Define and approve backup frequency, retention, RPO, RTO, encryption keys, storage region and authorized restore operators. The proposed daily cadence from the PRD is a policy target; it is not configured by this code.

Use the hosted project's supported backup/PITR and restore facilities, or an approved PostgreSQL backup process that includes the required Auth identity dependencies, domain data, revisions, audit, receipts and schema/privileges. Confirm the provider's backup contents and encryption/access guarantees rather than assuming a plan includes them. A public-schema-only dump can omit Auth identities required by foreign keys. The app's JSON export and a browser cache are not full backups.

A clean restore exercise must:

1. Select a known backup and record its time/integrity metadata using restricted access. Never put backup files or keys in this repository.
2. Restore into a **new isolated project/environment** with no outbound clinical notifications and no production clients connected. Do not overwrite the source to test recovery.
3. Restore the provider-supported Auth dependencies, schema, RLS/RPC grants and data; verify all intended migrations and immutable-history protections.
4. Compare table counts and IDs for mothers, pregnancies, births, children, care/verification events, appointments/tasks/attempts, consent, schedules, reviews, revisions, audit and sync receipts. Verify foreign keys and duplicate constraints.
5. Check representative synthetic relationships, prior versions, correction chains, verified/rejected states, old schedule assignments and scope isolation with separate test accounts.
6. Replay a previously acknowledged operation and confirm it is not duplicated. Create and sync a new synthetic form. Check read/print/export auditing.
7. Rotate/revoke sessions as required by the restore plan. Decide how clients with pending operations reconcile with the restored receipt/data timeline before reconnecting them.
8. Measure actual recovery point and elapsed recovery time. Record backup ID, commands/provider actions, counts, validation outputs, exceptions, reviewer and acceptance decision.

Keep the restore acceptance item unchecked until that evidence exists. The PGlite migration/RLS tests are not an encrypted backup/restore exercise.

## Rollout gate

Before a live pilot, obtain signed clinical sources/configuration; controller/consent/retention/device decisions; reviewed Nepali/Bhojpuri wording; actual-device and field task results; hosted Auth/security evidence; a clean restore result; trained staff and a named support route. Agree evaluation and stop criteria. Begin with a limited assigned catchment only after those gates pass.

No SMS is sent by this release. Any later reminder integration requires its own opt-in, neutral wording, delivery receipts and approval process.
