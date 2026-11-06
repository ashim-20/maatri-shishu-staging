import { v5 as uuidv5 } from "uuid";
import { addDays, today } from "./dates";
import { matchesTask } from "./mutations";
import {
  completion,
  effectiveEvents,
  eventDecision,
  timeline,
} from "./schedule";
import {
  type AnyEntity,
  type Data,
  type Entity,
  type Profile,
  find,
  currentConsent,
  select,
} from "./types";

export interface WorkItem {
  id: string;
  data: Data<"follow_ups">;
  wardId: number;
  person: Entity<"mothers"> | Entity<"children">;
  generated: boolean;
  lastAttempt?: Entity<"attempts">;
  resolved: boolean;
}
const NAMESPACE = "32b2039d-5cb0-4d2f-bf75-66c254a667d8";
export function worklist(
  records: AnyEntity[],
  profile: Profile,
  demo: boolean,
  asOf = today(),
): WorkItem[] {
  const tasks = [...select(records, "follow_ups")];
  const generated = new Set<string>();
  for (const child of select(records, "children").filter(
    (c) => c.data.status === "active",
  )) {
    for (const dose of timeline(records, child, asOf, demo)) {
      if (
        !dose.dueDate ||
        dose.status === "verified" ||
        dose.dueDate > addDays(asOf, 30)
      )
        continue;
      if (
        tasks.some(
          (t) =>
            t.data.subjectId === child.id &&
            t.data.doseCode === dose.code &&
            t.data.scheduleId === child.data.scheduleId,
        )
      )
        continue;
      const id = uuidv5(
        `${child.id}:${child.data.scheduleId}:${dose.code}`,
        NAMESPACE,
      );
      generated.add(id);
      tasks.push({
        id,
        type: "follow_ups",
        wardId: child.wardId,
        facilityId: child.facilityId,
        version: 0,
        createdAt: child.createdAt,
        updatedAt: child.updatedAt,
        createdBy: profile.id,
        data: {
          subjectId: child.id,
          subjectType: "child",
          dueDate: dose.dueDate,
          category: "vaccination",
          reason: `${dose.name} · planned follow-up`,
          doseCode: dose.code,
          scheduleId: child.data.scheduleId,
          status: "open",
          assigneeId: profile.id,
        },
      });
    }
  }
  for (const appointment of select(records, "appointments")) {
    const id = uuidv5(`appointment:${appointment.id}`, NAMESPACE);
    if (tasks.some((t) => t.id === id)) continue;
    generated.add(id);
    tasks.push({
      ...appointment,
      id,
      type: "follow_ups",
      version: 0,
      data: {
        subjectId: appointment.data.subjectId,
        subjectType: appointment.data.subjectType,
        dueDate: appointment.data.date,
        category:
          appointment.data.type === "other" ? "general" : appointment.data.type,
        reason: "Provider-confirmed appointment",
        assigneeId: profile.id,
        doseCode: null,
        scheduleId: null,
        status: "open",
      },
    });
  }
  return tasks
    .flatMap((task) => {
      const person =
        task.data.subjectType === "mother"
          ? find(records, "mothers", task.data.subjectId)
          : find(records, "children", task.data.subjectId);
      if (
        !person ||
        ["inactive", "moved", "deceased"].includes(person.data.status) ||
        currentConsent(records, person).status !== "given"
      )
        return [];
      if (profile.role === "fchv" && task.data.assigneeId !== profile.id)
        return [];
      const attempts = select(records, "attempts")
        .filter((a) => a.data.taskId === task.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const complete =
        task.data.doseCode &&
        effectiveEvents(records, person.id).some(
          (e) =>
            e.data.kind === "vaccination" &&
            e.data.doseCode === task.data.doseCode &&
            e.data.scheduleId === task.data.scheduleId &&
            eventDecision(records, e) === "verified",
        );
      const resolved = Boolean(
        complete ||
        (task.data.status === "closed" &&
          effectiveEvents(records, person.id).some(
            (event) =>
              event.id === task.data.completionEventId &&
              matchesTask(task.data, event) &&
              eventDecision(records, event) === "verified",
          )) ||
        attempts[0]?.data.outcome === "moved",
      );
      const dueDate = attempts[0]?.data.nextDate ?? task.data.dueDate;
      return [
        {
          id: task.id,
          data: { ...task.data, dueDate },
          wardId: task.wardId,
          person,
          generated: generated.has(task.id),
          lastAttempt: attempts[0],
          resolved,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.data.dueDate.localeCompare(b.data.dueDate) ||
        a.person.data.name.localeCompare(b.person.data.name),
    );
}
export function workspaceStats(
  records: AnyEntity[],
  profile: Profile,
  demo: boolean,
) {
  const mothers = select(records, "mothers").filter(
    (m) => !["inactive", "moved"].includes(m.data.status),
  );
  const children = select(records, "children").filter(
    (c) => c.data.status === "active",
  );
  const pendingEvents = effectiveEvents(records).filter(
    (e) => eventDecision(records, e) === "pending",
  );
  const needsReview = select(records, "reviews").filter(
    (r) => r.data.status === "open",
  );
  const tasks = worklist(records, profile, demo);
  const doses = children.flatMap((child) =>
    timeline(records, child, today(), demo),
  );
  return {
    mothers,
    children,
    pendingEvents,
    needsReview,
    tasks,
    due: tasks.filter((t) => !t.resolved && t.data.dueDate <= today()),
    coverage: completion(doses),
    reviewCount: pendingEvents.length + needsReview.length,
  };
}
