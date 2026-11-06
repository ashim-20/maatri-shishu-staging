# Host Maatri-Shishu with Supabase and Vercel

Supabase hosts PostgreSQL and Auth. Vercel runs this Next.js website and its API routes. This guide starts with a new, synthetic staging project. Account connection, project creation and a live deployment are still pending; no hosted URL has been issued.

The repository includes `vercel.json`, a guarded hosted build, public-environment setup, read-only Supabase probes and a SQL verification query. The local demo remains available with `npm run dev` and no environment file.

## 1. Create your Supabase project

Install and connect the Supabase integration in ChatGPT to allow project setup in your account, or open the [Supabase dashboard](https://supabase.com/dashboard) and create a project:

- Name: `maatri-shishu-staging`.
- Organization: your own organization.
- Region: choose the region for your test deployment; place the Vercel functions nearby.
- Database password: generate it and save it privately in your password manager.

Wait until the project is ready. Open **Connect** and copy the **Project URL** and **publishable key**. The key starts with `sb_publishable_`. The setup command expects the default `https://PROJECT_REF.supabase.co` URL.

Run in this project directory:

```sh
npm run supabase:configure
```

Enter those two public values in the terminal. The command creates an ignored `.env.local`; it does not create a cloud project, request a password or overwrite an existing environment file. If `.env.local` already exists, edit these three entries there:

```dotenv
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The public key identifies the app; staff still need their own account. Never substitute a secret key or service-role key. See [Supabase's key guide](https://supabase.com/docs/guides/getting-started/api-keys).

## 2. Apply the database and Auth settings

In the new project's **SQL Editor**, execute these files separately, in order:

1. [Initial migration](../supabase/migrations/202611040001_workspace.sql), once on the empty database.
2. [Organization seed](../supabase/seed.sql), which creates only a demonstration municipality and health post.
3. [Schema verification](../supabase/verify.sql). All **48** rows must show `ok=true`.

The verification query reads PostgreSQL metadata and permissions. It makes no changes and returns no patient data. Do not rerun the initial migration over an existing schema.

For developers using the Supabase CLI, this is an **alternative** to applying the migration through SQL Editor:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --linked --include-seed --dry-run
npx supabase db push --linked --include-seed
```

Check the linked project and dry-run output before the last command. Enter private credentials only in the CLI's local authentication/password prompts. If SQL Editor already applied the migration, reconcile its migration history before using `db push`; do not apply it a second time. See [Supabase's migration workflow](https://supabase.com/docs/guides/deployment/managing-environments).

In **Authentication** settings:

- Enable email/password sign-in.
- Turn **Allow new users to sign up** off.
- Turn anonymous sign-ins off.
- In **URL Configuration**, use `http://127.0.0.1:3000` for initial local testing. Replace the Site URL with the actual HTTPS website URL after deploying in step 4.

`supabase/config.toml` configures the local CLI environment. Pushing SQL migrations does **not** apply those Auth settings to a hosted project.

Then run:

```sh
npm run hosting:check
npm run supabase:check
```

`hosting:check` validates build settings without network access. `supabase:check` uses only the public key to read Auth settings, probe all 20 tables without downloading rows, and check that the workspace RPC rejects anonymous access. It creates no users or records. An empty table alone cannot establish that RLS is correct, so keep the SQL verification and staff isolation tests below.

## 3. Create the first staff login

Add these **private, local-only** entries to your ignored `.env.local`, using the secret key from Supabase's API Keys settings:

```dotenv
SUPABASE_SECRET_KEY=YOUR_PRIVATE_SECRET_KEY
STAFF_INITIAL_PASSWORD=YOUR_UNIQUE_PASSWORD_OF_AT_LEAST_12_CHARACTERS
```

Run the existing staff provisioner with your test operator's actual email/name:

```sh
npm run staff:create -- --email worker@example.org --name "Test health worker" --role health_worker --facility 10000000-0000-4000-8000-000000000002 --wards 3,4
```

The script creates an Auth user, disabled staff profile and ward assignments before enabling access. It also supports the legacy `SUPABASE_SERVICE_ROLE_KEY`. Remove the private entries when provisioning is complete. They are never needed by Vercel. Detailed recovery and role instructions are in [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

Start `npm run dev` and sign in at `http://127.0.0.1:3000/login` before proceeding.

## 4. Deploy the Next.js website

Use the Vercel integration after installing and connecting it, or deploy this local directory with the [Vercel CLI](https://vercel.com/docs/cli). A Git repository is optional for the CLI route:

```sh
npx vercel login
npx vercel link
```

Create/select `maatri-shishu-staging` in your account, with this directory as the project root and **Next.js** as the framework. Use **Node.js 24.x**. The checked-in [Vercel configuration](../vercel.json) runs `npm ci` and `npm run build:hosted` automatically. It deliberately rejects missing configuration and demo mode. The postbuild command still versions the offline cache.

Add only these values in Vercel's project environment settings, or use these prompts:

```sh
npx vercel env add NEXT_PUBLIC_DEMO_MODE production
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
```

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | `false` |
| `NEXT_PUBLIC_SUPABASE_URL` | The new project's HTTPS Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The same public key used locally |

Here `production` is Vercel's deployment environment name; this is still the synthetic staging app. Configure Preview variables too before using preview deployments. Keep any future real-data environment separate.

Deploy:

```sh
npx vercel --prod
```

The command returns the real deployment URL. In Supabase **Authentication → URL Configuration**, set **Site URL** to that HTTPS origin and add the exact URLs used by the app to the redirect allowlist. Keep local URLs only in this test project's configuration. The current sign-in flow uses a password and does not implement OAuth, email-link login or password-recovery callbacks. See [Supabase URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

`.vercelignore` excludes local environment files and generated artifacts from CLI uploads. Configure cloud variables through Vercel. `NEXT_PUBLIC_*` values are compiled into the build; changing them requires a new deployment. The cloud build validates their format, and does not require a live database connection during compilation. See [Vercel build configuration](https://vercel.com/docs/project-configuration/vercel-json).

## 5. Finish hosted verification

- [ ] New Supabase project created in the intended account and region.
- [ ] Migration and organization seed applied; all 48 SQL checks pass remotely.
- [ ] Public signups and anonymous sign-ins disabled; `supabase:check` passes remotely.
- [ ] Individual test staff provisioned and able to log in.
- [ ] Vercel environment configured, build deployed and actual HTTPS URL recorded.
- [ ] Supabase Site URL/redirect settings updated to the deployed origin.
- [ ] Synthetic registration reaches Supabase, survives reload and syncs after reconnecting.
- [ ] A separately scoped staff account cannot read or modify the first account's records.
- [ ] Login, refresh, logout and Secure/HttpOnly cookies checked on HTTPS.

Use the complete connected acceptance checklist in [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Record real hosted results in [VALIDATION.md](VALIDATION.md); local mocks and successful compilation do not close those items.
