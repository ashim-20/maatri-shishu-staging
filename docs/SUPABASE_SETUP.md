# Connect a Supabase workspace

The local demo needs no Supabase setup. These steps configure a separate connected test deployment. No hosted project was created or modified during implementation, and no hosted Auth integration test has been claimed.

For a new project and website deployment, start with [the Supabase + Vercel hosting guide](HOSTING.md). It provides the account setup sequence, SQL verification, environment helpers and deployment commands.

## 1. Prepare the project

Create or select a Supabase project in the approved hosting region. For initial testing, use a project containing synthetic data only. Keep staging/demo and future production separate.

Run [the SQL migration](../supabase/migrations/202611040001_workspace.sql) once using the project's SQL editor or your migration pipeline. It creates organizations, staff/scopes, domain tables, foreign keys, RLS, immutable history and command RPCs. Then run [the organization seed](../supabase/seed.sql) for a connected practice project. The seed inserts only a demonstration municipality and health post; it creates no patients, staff passwords or active clinical schedule.

For developers who already have the Supabase CLI and Docker, `supabase start` and `supabase db reset` can apply the checked-in configuration locally. **Reset targets a disposable local database and deletes its existing data.** Those tools are optional and were not used for this delivery.

Configure Auth to disable public signups. Add the application's exact origin/site URL, configure password/rate-limit controls and review session settings. Production must use HTTPS. Supabase's Auth service supplies authentication throttling; deployed limits still need validation.

Keep email sign-in enabled and anonymous sign-ins disabled. Run [verify.sql](../supabase/verify.sql) in SQL Editor after applying the migration; all 48 metadata/permission checks should return true. The local `supabase/config.toml` is not automatically applied to hosted Auth by a database push.

## 2. Configure the app

Run `npm run supabase:configure` to enter the Project URL and publishable key in your terminal. It creates `.env.local` without overwriting an existing file. Alternatively, copy `.env.example` to `.env.local` at the repository root and edit:

```dotenv
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PROJECT_PUBLISHABLE_KEY
```

Use the project's **publishable** key (or legacy anon key), never its service-role/secret key, for the public variable. The app does not need privileged credentials at runtime. Supabase RLS and RPC permissions protect public-key requests.

`npm run hosting:check` checks the environment format. `npm run supabase:check` performs read-only Auth, anonymous table-visibility and RPC probes. Neither command proves staff isolation or successful hosted sign-in; complete the connected tests below.

Use `npm run dev` for local connected development. For a hosted deployment, configure the variables in the hosting environment and run `npm run build` before starting. `NEXT_PUBLIC_*` values are compiled into the browser bundle; changing mode/project requires a rebuild. Do not serve an old demo build against a connected production environment.

Use different origins for demo and connected deployments. The IndexedDB databases are also separate: `maatri-shishu-demo-v1` and `maatri-shishu-connected-v1`.

## 3. Provision an individual staff account

Provisioning uses the Supabase administrative API from a trusted local terminal. Add these private values temporarily through your secret manager or untracked `.env.local`:

```dotenv
SUPABASE_SECRET_KEY=YOUR_PRIVATE_SECRET_KEY
STAFF_INITIAL_PASSWORD=YOUR_UNIQUE_PASSWORD_OF_AT_LEAST_12_CHARACTERS
```

Then run, replacing the example email/name with your authorized **test** operator:

```sh
npm run staff:create -- --email worker@example.org --name "Test health worker" --role health_worker --facility 10000000-0000-4000-8000-000000000002 --wards 3,4
```

The facility UUID above is created by the organization seed. For your own organization, insert its municipality/facility first and supply that facility UUID. Ward values are 1–99. Supported roles are `fchv`, `health_worker`, `supervisor`, `clinical_approver`, `municipality_admin` and `system_admin`. The provisioner prefers `SUPABASE_SECRET_KEY` (`sb_secret_...`) and also supports legacy `SUPABASE_SERVICE_ROLE_KEY`.

The script creates the Auth user, a disabled profile and scope rows, then enables the profile. If a later step fails, it reports the created user ID and leaves access disabled/unprovisioned for administrative recovery. It does not silently delete or recreate an existing account. Share the initial password through your approved private channel and apply your password rotation/recovery process.

Remove provisioning secrets from the app-host environment; keep them only in approved administrative tooling. They must never have a `NEXT_PUBLIC_` prefix or be committed. There is no shared default login.

## 4. Validate the connected workflow

1. Sign in at `/login`. Check the name, role, health post and wards in Settings.
2. Create a consented fictional mother, a pregnancy and a child. Confirm rows, revisions and audit events reach PostgreSQL after sync.
3. Use a second test account assigned to a different ward. Confirm lists, direct record IDs, linked mutations and JSON export cannot disclose the first ward's records.
4. As FCHV, enter reported vaccination history where an approved test-environment schedule is available. Confirm FCHV cannot verify care, record maternal clinical contacts or edit the clinic calendar.
5. Test an offline form, reconnect and reload. Inspect the queue and operation receipts. Repeat an identical request after withholding its first response; it must commit once.
6. Make conflicting edits on two browsers. Confirm the review queue shows both versions, no silent overwrite occurs, and linked forms are handled as a group.
7. Disable a test account in `staff_profiles`; verify its next online request is denied. Test logout independently: disabled staff can still revoke their session.
8. Check cookies in the deployed browser: HttpOnly, Secure on HTTPS, SameSite=Lax. No auth token should be in localStorage. Confirm API responses are private/no-store and mutation origins are enforced.
9. Test scope removal, lease expiry, account switching with pending data, audit upload and successful sign-out cleanup. A disconnected device can keep cached access until the configured lease expires.

These steps are a pending acceptance checklist, not evidence that hosted testing has already happened. See [VALIDATION.md](VALIDATION.md) for the local checks actually run.

## Schedules and roles

Connected workspaces start with no active vaccination schedule. An unknown DOB or missing approved version produces review state. Normal care registration can still be exercised with synthetic people.

Draft versions require source, authority, effective dates and dose rules. A designated clinical reviewer approves; a separate municipality/programme approver activates. Approved versions cannot be edited. A `testOnly` draft **cannot** be activated in connected storage. Do not remove the flag to bypass the clinical gate. Use local demo mode for the bundled sample timeline until the appropriate test/reference configuration is approved.

Staff management is currently an administrative script/dashboard procedure. Assignments, disablement and role changes must follow your approved access process; a self-service staff administration console is not included.

## Troubleshooting

| Symptom | Check |
|---|---|
| Demo still opens | Set mode to `false`, verify environment loading and rebuild/restart |
| Sign-in succeeds but no workspace | Active `staff_profiles` row, correct facility and at least one matching `staff_scopes` row |
| Endpoint returns 503 | Demo mode/configuration, project availability and deployed migrations |
| Sync returns 403 | Current account status, role, assigned ward, parent links and request origin |
| Sync returns 409 | Use the review queue; keep the original operation ID/payload for uncertain delivery |
| No child timeline | Confirmed DOB and applicable active, approved, non-test schedule |
| Unsynced work belongs to another account | Reauthenticate as the original operator; preserve local queues while recovering |
| Offline shell shows an earlier release | Close all app tabs, reopen online and let the new service worker activate |

Use [the operations runbook](OPERATIONS.md) before changing a real deployment, restoring backups or recovering lost devices.
