import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { seedId } from "../src/lib/domain/seed";
import type { Operation } from "../src/lib/domain/types";

// PostgreSQL execution without Docker. auth.uid() and Supabase roles are simulated;
// this verifies migrations/RPC/RLS semantics, not a hosted Auth deployment.
async function main() {
  const db = new PGlite();
  const checks: string[] = [];
  const worker = seedId(1),
    fchv = seedId(12),
    other = seedId(13),
    clinical = seedId(90),
    programme = seedId(91),
    admin = seedId(92);
  const facility = seedId(2);
  const mother = seedId(700);
  const child = seedId(701);
  const schedule = seedId(702);
  async function identity(id: string) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  }
  async function root() {
    await db.exec("reset role");
  }
  async function run(name: string, fn: () => Promise<void>) {
    await fn();
    checks.push(name);
    console.log(`PASS ${name}`);
  }
  async function reject(fn: () => Promise<unknown>, code?: string) {
    let caught = false;
    try {
      await fn();
    } catch (error) {
      caught = true;
      if (code) assert.equal((error as { code: string }).code, code);
    }
    assert.ok(caught, "Expected the operation to be rejected");
  }
  function operation(
    type: Operation["entityType"],
    data: Record<string, unknown>,
    id = crypto.randomUUID(),
    ward = 3,
  ): Operation {
    return {
      id: crypto.randomUUID(),
      entityId: id,
      entityType: type,
      action: "create",
      data,
      expectedVersion: 0,
      wardId: ward,
      createdAt: new Date().toISOString(),
    };
  }
  async function apply(op: Operation) {
    return (
      await db.query<{
        result: {
          record: { version: number; data: Record<string, unknown> };
          duplicate: boolean;
        };
      }>("select public.apply_operation($1::jsonb) as result", [
        JSON.stringify(op),
      ])
    ).rows[0].result;
  }
  const consent = {
    status: "given",
    language: "ne",
    method: "verbal",
    guardian: "Synthetic guardian",
  };
  const motherData = {
    name: "Synthetic mother",
    reference: "TEST-M-001",
    settlement: "Test settlement",
    age: 25,
    phone: "",
    language: "ne",
    status: "pregnant",
    consent,
  };
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant usage on schema public to authenticated,anon;",
    );
    await db.exec(
      await readFile("supabase/migrations/202611040001_workspace.sql", "utf8"),
    );
    checks.push("Migration applies to a clean PostgreSQL database");
    await db.exec(await readFile("supabase/seed.sql", "utf8"));
    const verificationSql = await readFile("supabase/verify.sql", "utf8");
    await run(
      "Hosted schema verification passes all 48 RLS/grant checks",
      async () => {
        const { rows } = await db.query<{ check_name: string; ok: boolean }>(
          verificationSql,
        );
        assert.equal(rows.length, 48);
        assert.ok(
          rows.every((row) => row.ok),
          JSON.stringify(rows.filter((row) => !row.ok)),
        );
      },
    );
    await run(
      "Hosted schema verification detects disabled RLS and exposed helpers",
      async () => {
        await db.exec(
          "begin; alter table public.mothers disable row level security; grant execute on function public.require_record(text,uuid,uuid) to authenticated;",
        );
        try {
          const { rows } = await db.query<{ check_name: string; ok: boolean }>(
            verificationSql,
          );
          assert.deepEqual(
            rows
              .filter((row) => !row.ok)
              .map((row) => row.check_name)
              .sort(),
            [
              "Internal helper protected: public.require_record(text,uuid,uuid)",
              "RLS enabled: mothers",
            ],
          );
        } finally {
          await db.exec("rollback");
        }
      },
    );
    for (const [id, role, ward] of [
      [worker, "health_worker", 3],
      [fchv, "fchv", 3],
      [other, "health_worker", 4],
      [clinical, "clinical_approver", 3],
      [programme, "municipality_admin", 3],
      [admin, "system_admin", 3],
    ] as const) {
      await db.query("insert into auth.users(id) values($1)", [id]);
      await db.query(
        "insert into public.staff_profiles(id,full_name,role,facility_id) values($1,$2,$3,$4)",
        [id, `Synthetic ${role}`, role, facility],
      );
      await db.query(
        "insert into public.staff_scopes(user_id,facility_id,ward_number) values($1,$2,$3)",
        [id, facility, ward],
      );
    }
    await identity(worker);
    const first = operation("mothers", motherData, mother);
    await run(
      "Authorized registration commits once with an idempotent receipt",
      async () => {
        const created = await apply(first);
        const repeated = await apply(first);
        assert.equal(created.record.version, 1);
        assert.equal(repeated.duplicate, true);
        assert.equal(
          (
            await db.query<{ count: number }>(
              "select count(*)::int as count from public.mothers",
            )
          ).rows[0].count,
          1,
        );
      },
    );
    await run("A replay with another payload is rejected", async () =>
      reject(
        () =>
          apply({ ...first, data: { ...motherData, name: "Another value" } }),
        "40001",
      ),
    );
    await run(
      "Direct authenticated writes and self-promotion are denied",
      async () => {
        await reject(
          () =>
            db.query(
              "update public.staff_profiles set role='system_admin' where id=$1",
              [worker],
            ),
          "42501",
        );
        await reject(
          () =>
            db.query("update public.mothers set data=data where id=$1", [
              mother,
            ]),
          "42501",
        );
      },
    );
    await identity(other);
    await run(
      "RLS hides another ward's mother even when its ID is known",
      async () =>
        assert.equal(
          (await db.query("select * from public.mothers where id=$1", [mother]))
            .rows.length,
          0,
        ),
    );
    await run("RPC rejects a forged cross-ward parent link", async () =>
      reject(
        () =>
          apply(
            operation(
              "pregnancies",
              {
                motherId: mother,
                lmp: null,
                edd: null,
                dateSource: "unknown",
                status: "active",
              },
              crypto.randomUUID(),
              4,
            ),
          ),
        "42501",
      ),
    );
    await identity(worker);
    await run("Consent refusal blocks a new digital mother record", async () =>
      reject(
        () =>
          apply(
            operation("mothers", {
              ...motherData,
              consent: { ...consent, status: "declined" },
            }),
          ),
        "22023",
      ),
    );
    await identity(clinical);
    const draft = operation(
      "schedules",
      {
        name: "Temporary test rule",
        source: "Isolated automated test only",
        authority: "Test fixture",
        effectiveFrom: "2020-01-01",
        effectiveTo: null,
        status: "draft",
        clinicalApprover: null,
        programmeApprover: null,
        testOnly: false,
        doses: [{ code: "bcg-1", name: "BCG", age: 0, unit: "days" }],
      },
      schedule,
    );
    await apply(draft);
    const approve = {
      ...operation("schedules", {}, schedule),
      action: "approve_clinical" as const,
      expectedVersion: 1,
    };
    await identity(worker);
    await run("A health worker cannot approve a programme schedule", async () =>
      reject(() => apply(approve), "42501"),
    );
    await identity(clinical);
    await apply(approve);
    const activate = {
      ...operation("schedules", {}, schedule),
      action: "activate" as const,
      expectedVersion: 2,
    };
    await run("Clinical approval cannot self-activate a schedule", async () =>
      reject(() => apply(activate), "42501"),
    );
    await identity(programme);
    await run(
      "A separately authorized programme approver can activate",
      async () =>
        assert.equal((await apply(activate)).record.data.status, "active"),
    );
    await identity(clinical);
    await run("Activated schedule content is immutable", async () =>
      reject(
        () =>
          apply({
            ...draft,
            id: crypto.randomUUID(),
            action: "update",
            expectedVersion: 3,
          }),
        "42501",
      ),
    );
    const testSchedule = seedId(703);
    const testDraft = {
      ...draft,
      id: crypto.randomUUID(),
      entityId: testSchedule,
      data: { ...draft.data, testOnly: true },
    };
    await apply(testDraft);
    await apply({
      ...approve,
      id: crypto.randomUUID(),
      entityId: testSchedule,
    });
    await identity(programme);
    await run(
      "A demonstration fixture cannot be activated in connected storage",
      async () =>
        reject(
          () =>
            apply({
              ...activate,
              id: crypto.randomUUID(),
              entityId: testSchedule,
            }),
          "22023",
        ),
    );
    await identity(worker);
    await apply(
      operation(
        "children",
        {
          name: "Synthetic child",
          reference: "TEST-C-001",
          motherId: mother,
          birthId: null,
          dob: "2025-01-01",
          dobSource: "confirmed",
          sex: "not_recorded",
          settlement: "Test settlement",
          scheduleId: schedule,
          status: "active",
          consent,
        },
        child,
      ),
    );
    const vaccination = {
      subjectId: child,
      subjectType: "child",
      pregnancyId: null,
      kind: "vaccination",
      date: "2025-01-01",
      source: "provider_administered",
      verified: true,
      provider: "Synthetic provider",
      doseCode: "bcg-1",
      scheduleId: schedule,
      timing: "",
      supersedesId: null,
      note: "",
    };
    await identity(fchv);
    await run("FCHV cannot forge provider-verified care", async () =>
      reject(() => apply(operation("care_events", vaccination)), "42501"),
    );
    const reported = operation("care_events", {
      ...vaccination,
      source: "caregiver_reported",
      verified: false,
    });
    await apply(reported);
    const review = operation("event_reviews", {
      eventId: reported.entityId,
      decision: "verified",
      expectedReviewId: null,
      reason: "Synthetic card reviewed",
    });
    await run(
      "FCHV cannot grant verification through a review record",
      async () => reject(() => apply(review), "42501"),
    );
    await identity(worker);
    await apply(review);
    await run("Concurrent stale verification is rejected", async () =>
      reject(
        () =>
          apply({
            ...review,
            id: crypto.randomUUID(),
            entityId: crypto.randomUUID(),
          }),
        "40001",
      ),
    );
    await run("Care event updates cannot overwrite history", async () =>
      reject(
        () =>
          apply({
            ...reported,
            id: crypto.randomUUID(),
            action: "update",
            expectedVersion: 1,
          }),
        "42501",
      ),
    );
    const correction = operation("care_events", {
      ...vaccination,
      supersedesId: reported.entityId,
      note: "Corrected date from synthetic provider record",
    });
    await apply(correction);
    await run(
      "Corrections preserve both original and superseding events",
      async () =>
        assert.equal(
          (
            await db.query<{ count: number }>(
              "select count(*)::int as count from public.care_events",
            )
          ).rows[0].count,
          2,
        ),
    );
    await run(
      "Maternal and newborn PNC cannot share a subject flag",
      async () =>
        reject(
          () =>
            apply(
              operation("care_events", {
                ...vaccination,
                subjectId: mother,
                subjectType: "mother",
                kind: "pnc_child",
                doseCode: null,
                scheduleId: null,
              }),
            ),
          "22023",
        ),
    );
    await run("Stale demographic writes are rejected", async () =>
      reject(
        () =>
          apply({
            ...first,
            id: crypto.randomUUID(),
            action: "update",
            expectedVersion: 0,
          }),
        "40001",
      ),
    );
    await apply({
      ...first,
      id: crypto.randomUUID(),
      action: "update",
      expectedVersion: 1,
      data: { ...motherData, age: 26 },
    });
    await run("Demographic revisions retain previous versions", async () =>
      assert.equal(
        (
          await db.query<{ count: number }>(
            "select count(*)::int as count from public.record_revisions where record_id=$1",
            [mother],
          )
        ).rows[0].count,
        2,
      ),
    );
    await run("Invalid calendar dates are rejected by PostgreSQL", async () =>
      reject(
        () =>
          apply(
            operation("appointments", {
              subjectId: mother,
              subjectType: "mother",
              date: "2025-02-29",
              type: "anc",
              note: "",
            }),
          ),
        "22023",
      ),
    );
    const childData = (
      await db.query<{ data: Record<string, unknown> }>(
        "select data from public.children where id=$1",
        [child],
      )
    ).rows[0].data;
    const birth = operation("births", {
      motherId: mother,
      pregnancyId: null,
      date: "2025-01-01",
      time: "08:30",
      place: "Synthetic birth centre",
      source: "card",
    });
    const twin = operation("children", {
      ...childData,
      name: "Synthetic twin A",
      reference: "TEST-TWIN-A",
      birthId: birth.entityId,
    });
    async function batch(operations: Operation[]) {
      return (
        await db.query<{ result: { results: { duplicate: boolean }[] } }>(
          "select public.apply_operations($1::jsonb) as result",
          [JSON.stringify(operations)],
        )
      ).rows[0].result;
    }
    await run(
      "Linked registration failure rolls back birth, audit and revision",
      async () => {
        await reject(
          () =>
            batch([
              birth,
              {
                ...twin,
                data: {
                  ...twin.data,
                  consent: { ...consent, status: "declined" },
                },
              },
            ]),
          "22023",
        );
        assert.equal(
          (
            await db.query("select id from public.births where id=$1", [
              birth.entityId,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select id from public.audit_events where entity_id=$1",
              [birth.entityId],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select id from public.record_revisions where record_id=$1",
              [birth.entityId],
            )
          ).rows.length,
          0,
        );
      },
    );
    await run(
      "Lost batch acknowledgement replays receipts without creating duplicate twins",
      async () => {
        await batch([birth, twin]);
        const replay = await batch([birth, twin]);
        assert.ok(replay.results.every((result) => result.duplicate));
        await apply(
          operation("children", {
            ...twin.data,
            name: "Synthetic twin B",
            reference: "TEST-TWIN-B",
          }),
        );
        assert.equal(
          (
            await db.query("select id from public.children where birth_id=$1", [
              birth.entityId,
            ])
          ).rows.length,
          2,
        );
      },
    );
    await run("Child birth linkage cannot name another mother", async () => {
      const another = operation("mothers", {
        ...motherData,
        reference: "TEST-M-OTHER",
      });
      await apply(another);
      await reject(
        () =>
          apply(
            operation("children", {
              ...childData,
              motherId: another.entityId,
              birthId: birth.entityId,
            }),
          ),
        "22023",
      );
    });
    await run(
      "DOB correction requires a reason retained in its revision",
      async () => {
        const correction: Operation = {
          ...operation("children", { ...childData, dob: "2025-01-02" }, child),
          action: "update",
          expectedVersion: 1,
        };
        await reject(() => apply(correction), "22023");
        correction.data.correctionReason =
          "Date confirmed against synthetic birth record";
        await apply(correction);
        const revision = (
          await db.query<{ reason: string }>(
            "select data->>'correctionReason' as reason from public.record_revisions where record_id=$1 and version=2",
            [child],
          )
        ).rows[0];
        assert.equal(revision.reason, correction.data.correctionReason);
      },
    );
    const task = operation("follow_ups", {
      subjectId: child,
      subjectType: "child",
      dueDate: "2025-01-01",
      category: "vaccination",
      reason: "Synthetic vaccination follow-up",
      assigneeId: worker,
      doseCode: "bcg-1",
      scheduleId: schedule,
      status: "open",
    });
    await apply(task);
    const pendingEvent = operation("care_events", {
      ...vaccination,
      source: "caregiver_reported",
      verified: false,
    });
    await apply(pendingEvent);
    const closeTask: Operation = {
      ...operation(
        "follow_ups",
        {
          ...task.data,
          status: "closed",
          completionEventId: pendingEvent.entityId,
        },
        task.entityId,
      ),
      action: "update",
      expectedVersion: 1,
    };
    await run(
      "Contact or reported evidence cannot close a clinical follow-up",
      async () => {
        await reject(() => apply(closeTask), "22023");
        await reject(
          () =>
            apply({
              ...closeTask,
              data: { ...closeTask.data, completionEventId: reported.entityId },
            }),
          "22023",
        );
      },
    );
    await run(
      "Matching current verified care can complete a follow-up",
      async () => {
        const saved = await apply({
          ...closeTask,
          data: { ...closeTask.data, completionEventId: correction.entityId },
        });
        assert.equal(saved.record.data.status, "closed");
      },
    );
    await identity(fchv);
    await run(
      "FCHV cannot enter maternal PNC even as reported history",
      async () => {
        await reject(
          () =>
            apply(
              operation("care_events", {
                ...vaccination,
                subjectId: mother,
                subjectType: "mother",
                kind: "pnc_mother",
                source: "caregiver_reported",
                verified: false,
                scheduleId: null,
                doseCode: null,
              }),
            ),
          "42501",
        );
      },
    );
    await run(
      "FCHV cannot create an already resolved supervisor review",
      async () => {
        await reject(
          () =>
            apply(
              operation("reviews", {
                subjectId: mother,
                subjectType: "mother",
                category: "duplicate",
                relatedId: null,
                status: "resolved",
                reason: "Synthetic duplicate",
                resolution: "Forged review decision",
              }),
            ),
          "42501",
        );
      },
    );
    await identity(worker);
    const accessEvent = {
      id: crypto.randomUUID(),
      action: "read",
      entityType: "children",
      entityId: child,
      occurredAt: "2026-11-04T05:00:00.000Z",
    };
    await run(
      "Offline access audit replay is idempotent and preserves observation metadata",
      async () => {
        await db.query("select public.record_access_event($1::jsonb)", [
          JSON.stringify(accessEvent),
        ]);
        await db.query("select public.record_access_event($1::jsonb)", [
          JSON.stringify(accessEvent),
        ]);
        const events = (
          await db.query<{
            safe_summary: { accessId: string; deviceObservedAt: string };
          }>(
            "select safe_summary from public.audit_events where safe_summary->>'accessId'=$1",
            [accessEvent.id],
          )
        ).rows;
        assert.equal(events.length, 1);
        assert.equal(events[0].safe_summary.accessId, accessEvent.id);
        assert.ok(events[0].safe_summary.deviceObservedAt);
        await reject(
          () =>
            db.query(
              "update public.audit_events set action='changed' where safe_summary->>'accessId'=$1",
              [accessEvent.id],
            ),
          "42501",
        );
      },
    );
    await identity(other);
    await run(
      "Offline read audit cannot reference another ward's record",
      async () => {
        await reject(
          () =>
            db.query("select public.record_access_event($1::jsonb)", [
              JSON.stringify({ ...accessEvent, id: crypto.randomUUID() }),
            ]),
          "42501",
        );
      },
    );
    await identity(admin);
    await run(
      "System administration does not grant clinical browsing",
      async () => {
        const snapshot = (
          await db.query<{ result: { records: { type: string }[] } }>(
            "select public.load_workspace() as result",
          )
        ).rows[0].result;
        assert.ok(
          snapshot.records.every((record) => record.type === "schedules"),
        );
        assert.equal(
          (await db.query("select * from public.children")).rows.length,
          0,
        );
      },
    );
    await root();
    await db.query("delete from public.staff_scopes where user_id=$1", [
      worker,
    ]);
    await identity(worker);
    await run(
      "Receipt replay rechecks a removed catchment assignment",
      async () => reject(() => apply(first), "42501"),
    );
    await root();
    await db.query(
      "update public.staff_profiles set active=false where id=$1",
      [fchv],
    );
    await identity(fchv);
    await run("Disabled staff lose read and mutation access", async () => {
      assert.equal(
        (await db.query("select * from public.mothers")).rows.length,
        0,
      );
      await reject(() => apply(operation("mothers", motherData)), "42501");
    });
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/database-validation.json",
      JSON.stringify(
        {
          environment:
            "PGlite PostgreSQL; simulated Supabase auth.uid and roles",
          at: new Date().toISOString(),
          checks,
        },
        null,
        2,
      ),
    );
    console.log(`Database validation: ${checks.length} checks passed.`);
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(
    "Database validation failed:",
    error instanceof Error ? error.message : String(error),
  );
  console.error("SQL code:", (error as { code?: string }).code);
  process.exitCode = 1;
});
