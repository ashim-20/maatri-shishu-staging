import type { Operation } from "./types";

const references = [
  "motherId",
  "birthId",
  "pregnancyId",
  "subjectId",
  "eventId",
  "taskId",
  "scheduleId",
  "supersedesId",
  "relatedId",
  "completionEventId",
];
export const dependsOn = (op: Operation, other: Operation) =>
  other.id !== op.id &&
  ((other.entityId === op.entityId &&
    other.expectedVersion < op.expectedVersion) ||
    (other.action === "create" &&
      references.some((key) => op.data[key] === other.entityId)));

/** Order dependent creates and revisions even when the device clock has equal timestamps. */
export function orderOperations(operations: Operation[]): Operation[] {
  const remaining = [...operations].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      a.expectedVersion - b.expectedVersion ||
      a.id.localeCompare(b.id),
  );
  const ordered: Operation[] = [];
  while (remaining.length) {
    const index = remaining.findIndex(
      (op) => !remaining.some((other) => dependsOn(op, other)),
    );
    if (index < 0)
      throw new Error(
        "Queued records have a circular dependency. Ask a supervisor to review them.",
      );
    ordered.push(remaining.splice(index, 1)[0]);
  }
  return ordered;
}

/** Each form's operations are sent in a single database transaction. */
export function operationBatches(operations: Operation[]): Operation[][] {
  const ordered = orderOperations(operations);
  const groups = new Map<string, Operation[]>();
  for (const op of ordered) {
    const key = op.batchId ?? op.id;
    groups.set(key, [...(groups.get(key) ?? []), op]);
  }
  const remaining = [...groups.values()];
  const result: Operation[][] = [];
  while (remaining.length) {
    const index = remaining.findIndex(
      (group) =>
        !remaining.some(
          (other) =>
            other !== group &&
            group.some((op) => other.some((parent) => dependsOn(op, parent))),
        ),
    );
    if (index < 0)
      throw new Error(
        "Linked forms have a circular dependency. Ask a supervisor to review them.",
      );
    result.push(remaining.splice(index, 1)[0]);
  }
  return result;
}
