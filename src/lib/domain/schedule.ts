import { addDays, addMonths, today } from "./dates";
import { type AnyEntity, type Entity, find, select } from "./types";
export type DoseStatus =
  "verified" | "reported" | "review" | "due" | "upcoming" | "date_passed";
export interface TimelineDose {
  code: string;
  name: string;
  dueDate: string | null;
  status: DoseStatus;
  event?: Entity<"care_events">;
}

export function effectiveEvents(records: AnyEntity[], subjectId?: string) {
  const events = select(records, "care_events").filter(
    (e) => !subjectId || e.data.subjectId === subjectId,
  );
  const superseded = new Set(
    events.map((e) => e.data.supersedesId).filter(Boolean),
  );
  return events.filter((e) => !superseded.has(e.id));
}
export function eventDecision(
  records: AnyEntity[],
  event: Entity<"care_events">,
): "verified" | "pending" | "rejected" {
  const review = select(records, "event_reviews")
    .filter((r) => r.data.eventId === event.id)
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    )[0];
  return review
    ? review.data.decision
    : event.data.verified
      ? "verified"
      : "pending";
}
export function scheduleFor(
  records: AnyEntity[],
  dob: string | null,
  allowTest = false,
): Entity<"schedules"> | undefined {
  if (!dob) return;
  return select(records, "schedules")
    .filter(
      (s) =>
        s.data.status === "active" &&
        (allowTest || !s.data.testOnly) &&
        s.data.effectiveFrom <= dob &&
        (!s.data.effectiveTo || s.data.effectiveTo >= dob),
    )
    .sort((a, b) =>
      b.data.effectiveFrom.localeCompare(a.data.effectiveFrom),
    )[0];
}
export function timeline(
  records: AnyEntity[],
  child: Entity<"children">,
  asOf = today(),
  allowTest = false,
): TimelineDose[] {
  const schedule = find(records, "schedules", child.data.scheduleId);
  if (
    !schedule ||
    schedule.data.status !== "active" ||
    (!allowTest && schedule.data.testOnly)
  )
    return [];
  const confirmed = child.data.dobSource === "confirmed" && child.data.dob;
  const events = effectiveEvents(records, child.id).filter(
    (e) => e.data.kind === "vaccination" && e.data.date <= asOf,
  );
  return schedule.data.doses.map((rule) => {
    const matches = events.filter(
      (e) => e.data.doseCode === rule.code && e.data.scheduleId === schedule.id,
    );
    const verified = matches.find(
      (e) => eventDecision(records, e) === "verified",
    );
    const reported = matches.find(
      (e) => eventDecision(records, e) === "pending",
    );
    const dueDate = confirmed
      ? rule.unit === "months"
        ? addMonths(confirmed, rule.age)
        : addDays(confirmed, rule.age * (rule.unit === "weeks" ? 7 : 1))
      : null;
    const status: DoseStatus = verified
      ? "verified"
      : reported
        ? "reported"
        : !dueDate
          ? "review"
          : dueDate < asOf
            ? "date_passed"
            : dueDate === asOf
              ? "due"
              : "upcoming";
    return {
      code: rule.code,
      name: rule.name,
      dueDate,
      status,
      event: verified ?? reported,
    };
  });
}
export function completion(doses: TimelineDose[], asOf = today()) {
  const due = doses.filter((d) => d.dueDate && d.dueDate <= asOf);
  const verified = due.filter((d) => d.status === "verified").length;
  return {
    verified,
    due: due.length,
    percent: due.length ? Math.round((verified / due.length) * 100) : null,
  };
}
