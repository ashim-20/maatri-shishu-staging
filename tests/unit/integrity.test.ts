import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { WorkspaceDatabase, saveLocalOperations } from "@/lib/db";
import { demoProfile, makeSeed, seedId } from "@/lib/domain/seed";
import { visibleRecords } from "@/lib/domain/access";
import { applyOperation } from "@/lib/domain/mutations";
import { orderOperations, operationBatches } from "@/lib/domain/sync";
import {
  find,
  select,
  type Operation,
  type AnyEntity,
} from "@/lib/domain/types";
import { worklist } from "@/lib/domain/worklist";

const records = makeSeed("2026-11-04");
const mother = find(records, "mothers", seedId(100))!;
const child = find(records, "children", seedId(300))!;
const op = (
  entityType: Operation["entityType"],
  data: Record<string, unknown>,
  entityId = crypto.randomUUID(),
): Operation => ({
  id: crypto.randomUUID(),
  entityType,
  data,
  entityId,
  expectedVersion: 0,
  wardId: 3,
  createdAt: "2026-11-04T04:00:00.000Z",
  action: "create",
});

it("withdrawn consent suppresses optional app follow-ups while retaining care history", () => {
  const person = find(records, "mothers", seedId(101))!;
  const withdrawal: AnyEntity = {
    ...person,
    id: crypto.randomUUID(),
    type: "consents",
    createdAt: "2030-01-01T00:00:00.000Z",
    data: {
      subjectId: person.id,
      subjectType: "mother",
      consent: { ...person.data.consent, status: "withdrawn" },
      reason: "Synthetic consent withdrawal",
    },
  };
  expect(
    worklist(records, demoProfile, true, "2026-11-04").some(
      (task) => task.person.id === person.id,
    ),
  ).toBe(true);
  expect(
    worklist([...records, withdrawal], demoProfile, true, "2026-11-04").some(
      (task) => task.person.id === person.id,
    ),
  ).toBe(false);
  expect(select([...records, withdrawal], "care_events").length).toBe(
    select(records, "care_events").length,
  );
});

it("FCHV cannot bypass supervisor review by creating an already resolved item", () => {
  const attempt = op("reviews", {
    subjectId: mother.id,
    subjectType: "mother",
    category: "duplicate",
    relatedId: null,
    status: "resolved",
    reason: "Possible duplicate",
    resolution: "Pretended supervisor decision",
  });
  expect(() =>
    applyOperation(records, attempt, { ...demoProfile, role: "fchv" }, true),
  ).toThrow(/supervisor/i);
});

describe("linked form transactions and replay ordering", () => {
  it("orders equal-timestamp parent creates before children and revisions", () => {
    const parent = op("mothers", mother.data);
    const birth = op("births", { motherId: parent.entityId });
    const infant = op("children", {
      motherId: parent.entityId,
      birthId: birth.entityId,
    });
    const update: Operation = {
      ...op("children", infant.data, infant.entityId),
      action: "update",
      expectedVersion: 1,
    };
    expect(
      orderOperations([update, infant, birth, parent]).map((item) => item.id),
    ).toEqual([parent.id, birth.id, infant.id, update.id]);
  });
  it("orders whole groups by dependencies even if a group's first operation has no parent", () => {
    const parent = { ...op("mothers", mother.data), batchId: "first" };
    const unrelated = {
      ...op("mothers", mother.data),
      batchId: "second",
      createdAt: "2026-11-04T03:00:00.000Z",
    };
    const linked = {
      ...op("children", { motherId: parent.entityId }),
      batchId: "second",
    };
    expect(
      operationBatches([unrelated, linked, parent]).map(
        (batch) => batch[0].batchId,
      ),
    ).toEqual(["first", "second"]);
  });
  it("rejects circular links instead of sending a partial form", () => {
    const first = op("children", {}),
      second = op("births", { motherId: first.entityId });
    first.data.birthId = second.entityId;
    expect(() => orderOperations([first, second])).toThrow(/circular/i);
  });
  it("rolls back a birth when linked child validation fails, then saves a valid retry once", async () => {
    const db = new WorkspaceDatabase(`maatri-batch-${crypto.randomUUID()}`);
    try {
      await db.records.bulkPut(records);
      const birth = op("births", {
        motherId: mother.id,
        pregnancyId: null,
        date: "2026-01-01",
        source: "reported",
        place: "Test centre",
        time: "10:30",
      });
      const infant = op("children", {
        ...child.data,
        birthId: birth.entityId,
        motherId: mother.id,
        consent: { ...child.data.consent, status: "declined" },
      });
      await expect(
        saveLocalOperations(db, [infant, birth], demoProfile, true),
      ).rejects.toThrow(/consent/i);
      expect(await db.records.get(birth.entityId)).toBeUndefined();
      expect(await db.outbox.count()).toBe(0);
      expect(await db.audit.count()).toBe(0);
      infant.data.consent = child.data.consent;
      await saveLocalOperations(db, [infant, birth], demoProfile, true);
      db.close();
      await db.open();
      expect(await db.records.get(birth.entityId)).toBeDefined();
      expect(await db.outbox.count()).toBe(2);
      expect(await db.audit.count()).toBe(2);
      await expect(
        saveLocalOperations(db, [birth, infant], demoProfile, true),
      ).rejects.toThrow(/changed/i);
      expect(await db.outbox.count()).toBe(2);
    } finally {
      await db.delete();
    }
  });
});

describe("role and relationship parity", () => {
  it("protects the existing ward even when the supplied ward is allowed", () => {
    const outside = { ...mother, wardId: 8 };
    expect(() =>
      applyOperation(
        [outside],
        {
          ...op("mothers", mother.data, mother.id),
          action: "update",
          expectedVersion: 1,
        },
        demoProfile,
        true,
      ),
    ).toThrow(/assigned area/i);
  });
  it("keeps drafts and clinical records out of unauthorized cached views", () => {
    const schedule = select(records, "schedules")[0];
    const draft: AnyEntity = {
      ...schedule,
      id: crypto.randomUUID(),
      data: { ...schedule.data, status: "draft" },
    };
    expect(
      visibleRecords([...records, draft], demoProfile, true).some(
        (item) => item.id === draft.id,
      ),
    ).toBe(false);
    expect(
      visibleRecords(
        records,
        { ...demoProfile, role: "system_admin" },
        true,
      ).every((item) => item.type === "schedules"),
    ).toBe(true);
    expect(
      visibleRecords(records, { ...demoProfile, active: false }, true),
    ).toEqual([]);
  });
  it("allows FCHV reported vaccination history but rejects maternal contact entry", () => {
    const event = select(records, "care_events").find(
      (item) => item.data.kind === "vaccination",
    )!;
    const actor = { ...demoProfile, role: "fchv" as const };
    expect(
      applyOperation(
        records,
        op("care_events", {
          ...event.data,
          source: "caregiver_reported",
          verified: false,
        }),
        actor,
        true,
      ).type,
    ).toBe("care_events");
    expect(() =>
      applyOperation(
        records,
        op("care_events", {
          ...event.data,
          subjectId: mother.id,
          subjectType: "mother",
          kind: "pnc_mother",
          source: "caregiver_reported",
          verified: false,
        }),
        actor,
        true,
      ),
    ).toThrow(/clinical contacts/i);
  });
  it("requires a reason for DOB correction and rejects FCHV source corrections", () => {
    const correction: Operation = {
      ...op(
        "children",
        { ...child.data, dob: "2026-01-01", correctionReason: "" },
        child.id,
      ),
      action: "update",
      expectedVersion: 1,
    };
    expect(() =>
      applyOperation(records, correction, demoProfile, true),
    ).toThrow(/Explain/);
    correction.data.correctionReason = "Confirmed from birth record";
    expect(
      applyOperation(records, correction, demoProfile, true).data,
    ).toMatchObject({ dob: "2026-01-01" });
    correction.data.dob = child.data.dob;
    correction.data.dobSource = "approximate";
    expect(() =>
      applyOperation(
        records,
        correction,
        { ...demoProfile, role: "fchv" },
        true,
      ),
    ).toThrow(/health worker/i);
  });
  it("validates birth-pregnancy-mother consistency and permits twins sharing a birth", () => {
    const pregnancy = select(records, "pregnancies")[0];
    expect(() =>
      applyOperation(
        records,
        op("births", {
          motherId: seedId(101),
          pregnancyId: pregnancy.id,
          date: null,
          source: "unknown",
        }),
        demoProfile,
        true,
      ),
    ).toThrow(/pregnancy.*mother/i);
    const birth = applyOperation(
      records,
      op("births", {
        motherId: mother.id,
        pregnancyId: null,
        date: child.data.dob,
        source: "card",
      }),
      demoProfile,
      true,
    );
    const twins = ["Twin A", "Twin B"].map((name) =>
      applyOperation(
        [...records, birth],
        op("children", { ...child.data, name, birthId: birth.id }),
        demoProfile,
        true,
      ),
    );
    expect(twins[0].id).not.toBe(twins[1].id);
    expect(
      twins.every(
        (twin) => twin.type === "children" && twin.data.birthId === birth.id,
      ),
    ).toBe(true);
    expect(() =>
      applyOperation(
        [...records, birth],
        op("children", {
          ...child.data,
          motherId: seedId(101),
          birthId: birth.id,
        }),
        demoProfile,
        true,
      ),
    ).toThrow(/same mother/i);
  });
});

it("requires matching verified evidence for task closure and reopens after evidence is rejected", () => {
  const task = find(records, "follow_ups", seedId(401))!;
  const base = select(records, "care_events")[0];
  const event: AnyEntity = {
    ...base,
    id: crypto.randomUUID(),
    data: {
      ...base.data,
      subjectId: task.data.subjectId,
      subjectType: "mother",
      kind: "anc",
      verified: true,
    },
  };
  const close: Operation = {
    ...op(
      "follow_ups",
      { ...task.data, status: "closed", completionEventId: event.id },
      task.id,
    ),
    action: "update",
    expectedVersion: task.version,
  };
  expect(() => applyOperation(records, close, demoProfile, true)).toThrow(
    /matching verified/i,
  );
  const closed = applyOperation([...records, event], close, demoProfile, true);
  const changed = [
    ...records.filter((item) => item.id !== task.id),
    event,
    closed,
  ];
  expect(
    worklist(changed, demoProfile, true, "2026-11-04").find(
      (item) => item.id === task.id,
    )?.resolved,
  ).toBe(true);
  const review: AnyEntity = {
    ...base,
    id: crypto.randomUUID(),
    type: "event_reviews",
    data: {
      eventId: event.id,
      decision: "rejected",
      expectedReviewId: null,
      reason: "Evidence does not support this record",
    },
  };
  expect(
    worklist([...changed, review], demoProfile, true, "2026-11-04").find(
      (item) => item.id === task.id,
    )?.resolved,
  ).toBe(false);
});
