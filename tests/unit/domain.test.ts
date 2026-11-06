import { describe, expect, it, vi, afterEach } from "vitest";
import { addDays, addMonths, isDateOnly } from "@/lib/domain/dates";
import { makeSeed, demoProfile, seedId } from "@/lib/domain/seed";
import {
  completion,
  effectiveEvents,
  eventDecision,
  scheduleFor,
  timeline,
} from "@/lib/domain/schedule";
import { applyOperation } from "@/lib/domain/mutations";
import {
  find,
  select,
  type AnyEntity,
  type Entity,
  type Operation,
} from "@/lib/domain/types";
import { worklist } from "@/lib/domain/worklist";

afterEach(() => vi.useRealTimers());
describe("calendar arithmetic (synthetic engineering fixtures, not clinical approval)", () => {
  const fixtures: [string, number, "days" | "months", string][] = [
    ["2024-01-01", 42, "days", "2024-02-12"],
    ["2024-01-31", 42, "days", "2024-03-13"],
    ["2023-01-31", 42, "days", "2023-03-14"],
    ["2024-02-29", 42, "days", "2024-04-11"],
    ["2023-12-31", 42, "days", "2024-02-11"],
    ["2024-12-31", 70, "days", "2025-03-11"],
    ["2026-11-04", 42, "days", "2026-12-16"],
    ["2025-02-28", 9, "months", "2025-11-28"],
    ["2024-05-31", 9, "months", "2025-02-28"],
    ["2023-05-31", 9, "months", "2024-02-29"],
    ["2023-11-30", 15, "months", "2025-02-28"],
    ["2024-11-30", 15, "months", "2026-02-28"],
    ["2024-02-29", 12, "months", "2025-02-28"],
    ["2020-02-29", 12, "months", "2021-02-28"],
    ["2025-08-31", 12, "months", "2026-08-31"],
    ["2024-08-31", 9, "months", "2025-05-31"],
    ["2026-01-30", 1, "months", "2026-02-28"],
    ["2024-10-31", 15, "months", "2026-01-31"],
    ["2025-10-31", 15, "months", "2027-01-31"],
    ["2026-04-30", 98, "days", "2026-08-06"],
    ["2026-07-31", 70, "days", "2026-10-09"],
    ["2024-02-28", 98, "days", "2024-06-05"],
  ];
  it.each(fixtures)("%s plus %i %s is %s", (birth, amount, unit, expected) =>
    expect(
      unit === "days" ? addDays(birth, amount) : addMonths(birth, amount),
    ).toBe(expected),
  );
  it("rejects dates that JavaScript would normalize", () => {
    expect(isDateOnly("2025-02-29")).toBe(false);
    expect(isDateOnly("2026-04-31")).toBe(false);
    expect(() => addMonths("2026-04-31", 9)).toThrow();
  });
});
describe("verified care and reproducible schedules", () => {
  const records = makeSeed("2026-11-04");
  it("does not activate a demonstration fixture in connected mode", () => {
    expect(scheduleFor(records, "2026-01-01")).toBeUndefined();
    expect(timeline(records, find(records, "children", seedId(300))!)).toEqual(
      [],
    );
  });
  it("does not invent dates for an uncertain birth date", () => {
    const child = {
      ...find(records, "children", seedId(300))!,
      data: {
        ...find(records, "children", seedId(300))!.data,
        dobSource: "approximate" as const,
      },
    };
    const rows = timeline(records, child, "2026-11-04", true);
    expect(rows.every((r) => r.dueDate === null)).toBe(true);
    expect(completion(rows).percent).toBeNull();
  });
  it("excludes future doses and repeated event rows from the denominator/numerator", () => {
    const child = find(records, "children", seedId(303))!;
    const dose = select(records, "care_events").find(
      (e) => e.data.subjectId === child.id && e.data.doseCode === "bcg-1",
    );
    const inputs = dose
      ? ([...records, { ...dose, id: crypto.randomUUID() }] as AnyEntity[])
      : records;
    const result = completion(
      timeline(inputs, child, "2026-11-04", true),
      "2026-11-04",
    );
    expect(result.due).toBe(1);
    expect(result.verified).toBeLessThanOrEqual(1);
  });
  it("reported history does not count as verified until reviewed", () => {
    const original = select(records, "care_events")[0];
    const event = {
      ...original,
      id: crypto.randomUUID(),
      data: {
        ...original.data,
        source: "caregiver_reported" as const,
        verified: false,
      },
    };
    expect(eventDecision([event], event)).toBe("pending");
    const review: Entity<"event_reviews"> = {
      ...event,
      type: "event_reviews",
      id: crypto.randomUUID(),
      data: {
        eventId: event.id,
        decision: "verified",
        expectedReviewId: null,
        reason: "Card inspected by authorized worker",
      },
    };
    expect(eventDecision([event, review], event)).toBe("verified");
  });
  it("a correction preserves the original while excluding it from current care", () => {
    const prior = select(records, "care_events")[0];
    const corrected: Entity<"care_events"> = {
      ...prior,
      id: crypto.randomUUID(),
      data: {
        ...prior.data,
        supersedesId: prior.id,
        note: "Corrected recorded date",
      },
    };
    const all: AnyEntity[] = [prior, corrected];
    expect(all).toHaveLength(2);
    expect(effectiveEvents(all)).toEqual([corrected]);
  });
  it("does not close follow-up after an attempted contact", () => {
    const task = find(records, "follow_ups", seedId(400))!;
    const attempt: Entity<"attempts"> = {
      ...task,
      id: crypto.randomUUID(),
      type: "attempts",
      data: {
        taskId: task.id,
        date: "2026-11-04",
        channel: "phone",
        outcome: "attended_elsewhere",
        nextDate: null,
        note: "Evidence pending",
      },
    };
    expect(
      worklist([...records, attempt], demoProfile, true, "2026-11-04").find(
        (t) => t.id === task.id,
      )?.resolved,
    ).toBe(false);
  });
  it("selects a version at effective-date boundaries and retains a child's prior assignment", () => {
    const first = find(records, "schedules", seedId(10))!;
    const second: Entity<"schedules"> = {
      ...first,
      id: seedId(11),
      data: {
        ...first.data,
        effectiveFrom: "2026-01-01",
        name: "Second synthetic version",
      },
    };
    expect(scheduleFor([...records, second], "2025-12-31", true)?.id).toBe(
      first.id,
    );
    expect(scheduleFor([...records, second], "2026-01-01", true)?.id).toBe(
      second.id,
    );
    const child = find(records, "children", seedId(300))!;
    expect(child.data.scheduleId).toBe(first.id);
    expect(
      timeline([...records, second], child, "2026-11-04", true).length,
    ).toBe(first.data.doses.length);
  });
});
describe("mutation permissions and data integrity", () => {
  const records = makeSeed("2026-11-04");
  function operation(
    type: Operation["entityType"],
    data: Record<string, unknown>,
  ): Operation {
    return {
      id: crypto.randomUUID(),
      entityId: crypto.randomUUID(),
      entityType: type,
      action: "create",
      data,
      expectedVersion: 0,
      wardId: 3,
      createdAt: "2026-11-04T04:00:00Z",
    };
  }
  it("blocks a forged FCHV verification", () => {
    const event = select(records, "care_events").find(
      (e) => e.data.kind === "vaccination",
    )!;
    expect(() =>
      applyOperation(
        records,
        operation("care_events", event.data),
        { ...demoProfile, role: "fchv" },
        true,
      ),
    ).toThrow(/authorized|verification/i);
  });
  it("rejects an out-of-scope parent reference", () => {
    const hidden = { ...find(records, "mothers", seedId(100))!, wardId: 7 };
    const candidate = operation("pregnancies", {
      motherId: hidden.id,
      lmp: null,
      edd: null,
      dateSource: "unknown",
      status: "active",
    });
    expect(() =>
      applyOperation([hidden], candidate, demoProfile, true),
    ).toThrow(/linked record/i);
  });
  it("prevents overwriting a clinical event", () => {
    const event = select(records, "care_events")[0];
    expect(() =>
      applyOperation(
        records,
        {
          ...operation("care_events", event.data),
          entityId: event.id,
          action: "update",
          expectedVersion: 1,
        },
        demoProfile,
        true,
      ),
    ).toThrow(/overwritten/);
  });
  it("rejects stale profile updates", () => {
    const mother = find(records, "mothers", seedId(100))!;
    expect(() =>
      applyOperation(
        records,
        {
          ...operation("mothers", mother.data),
          action: "update",
          entityId: mother.id,
          expectedVersion: 0,
        },
        demoProfile,
        true,
      ),
    ).toThrow(/changed/);
  });
  it("does not permit consent refusal to create a nonessential digital record", () => {
    const data = find(records, "mothers", seedId(100))!.data;
    expect(() =>
      applyOperation(
        records,
        operation("mothers", {
          ...data,
          consent: { ...data.consent, status: "declined" },
        }),
        demoProfile,
        true,
      ),
    ).toThrow(/consent/i);
  });
  it("cannot collapse maternal and newborn PNC into one event", () => {
    const event = select(records, "care_events")[0];
    expect(() =>
      applyOperation(
        records,
        operation("care_events", {
          ...event.data,
          kind: "pnc_child",
          subjectType: "mother",
        }),
        demoProfile,
        true,
      ),
    ).toThrow(/separately/);
  });
});
