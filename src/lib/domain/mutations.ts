import { today } from "./dates";
import { effectiveEvents, eventDecision } from "./schedule";
import {
  canManageSchedules,
  canSupervise,
  canVerify,
  find,
  schemas,
  select,
  type AnyEntity,
  type Operation,
  type Profile,
  type RecordKind,
} from "./types";

export class DomainError extends Error {
  constructor(
    message: string,
    public code: "validation" | "forbidden" | "conflict" = "validation",
  ) {
    super(message);
  }
}
const immutable: RecordKind[] = [
  "care_events",
  "event_reviews",
  "attempts",
  "consents",
  "births",
];
export function applyOperation(
  records: AnyEntity[],
  op: Operation,
  profile: Profile,
  demo = false,
): AnyEntity {
  if (!profile.active || !profile.wardIds.includes(op.wardId))
    throw new DomainError(
      "This record is outside your assigned area.",
      "forbidden",
    );
  const existing = records.find(
    (r) => r.id === op.entityId && r.type === op.entityType,
  );
  if (
    existing &&
    (existing.facilityId !== profile.facilityId ||
      !profile.wardIds.includes(existing.wardId) ||
      existing.wardId !== op.wardId)
  )
    throw new DomainError(
      "A record's assigned area cannot be changed through a profile edit.",
      "forbidden",
    );
  if (op.action === "create" && op.expectedVersion !== 0)
    throw new DomainError(
      "A new record must start at version zero.",
      "conflict",
    );
  if (
    op.action === "create"
      ? Boolean(existing)
      : !existing || existing.version !== op.expectedVersion
  )
    throw new DomainError(
      "This record has changed. Review both versions before saving.",
      "conflict",
    );
  if (op.action === "update" && immutable.includes(op.entityType))
    throw new DomainError(
      "Care history cannot be overwritten. Add an audited correction.",
    );
  if (
    ["system_admin", "clinical_approver", "municipality_admin"].includes(
      profile.role,
    ) &&
    op.entityType !== "schedules"
  )
    throw new DomainError(
      "Your role does not permit clinical record changes.",
      "forbidden",
    );
  let input = op.data;
  if (op.entityType === "schedules") {
    if (!canManageSchedules(profile.role))
      throw new DomainError(
        "Schedule administration is restricted.",
        "forbidden",
      );
    const old = find(records, "schedules", op.entityId);
    if (op.action === "approve_clinical") {
      if (profile.role !== "clinical_approver" || old?.data.status !== "draft")
        throw new DomainError(
          "A clinical reviewer must approve a draft schedule.",
          "forbidden",
        );
      input = {
        ...old.data,
        status: "clinical_approved",
        clinicalApprover: profile.id,
      };
    } else if (op.action === "activate") {
      if (
        profile.role !== "municipality_admin" ||
        old?.data.status !== "clinical_approved" ||
        old.data.clinicalApprover === profile.id
      )
        throw new DomainError(
          "A different programme approver must activate this schedule.",
          "forbidden",
        );
      if (old.data.testOnly && !demo)
        throw new DomainError(
          "Test schedules cannot be activated in a connected workspace.",
        );
      input = { ...old.data, status: "active", programmeApprover: profile.id };
    } else if (old && old.data.status !== "draft")
      throw new DomainError(
        "Approved schedule versions are immutable. Create a new draft.",
      );
    else if (
      input.status !== "draft" ||
      input.clinicalApprover ||
      input.programmeApprover
    )
      throw new DomainError(
        "New or edited schedules must remain unapproved drafts.",
      );
  } else if (!["create", "update"].includes(op.action))
    throw new DomainError(
      "This action is only available for schedule versions.",
    );
  const parsed = schemas[op.entityType].safeParse(input);
  if (!parsed.success)
    throw new DomainError(
      parsed.error.issues[0]?.message ?? "Please check the entered values.",
    );
  const result = {
    id: op.entityId,
    type: op.entityType,
    data: parsed.data,
    version: (existing?.version ?? 0) + 1,
    facilityId: profile.facilityId,
    wardId: op.wardId,
    createdBy: existing?.createdBy ?? profile.id,
    createdAt: existing?.createdAt ?? op.createdAt,
    updatedAt: op.createdAt,
  } as AnyEntity;
  function requireRecord(type: RecordKind, id: string | null) {
    const parent = records.find((r) => r.id === id && r.type === type);
    if (
      !parent ||
      parent.facilityId !== profile.facilityId ||
      !profile.wardIds.includes(parent.wardId)
    )
      throw new DomainError(
        "A linked record is unavailable in your assigned area.",
        "forbidden",
      );
    return parent;
  }
  if (result.type === "mothers" || result.type === "children") {
    if (op.action === "create" && result.data.consent.status !== "given")
      throw new DomainError(
        "Consent is required to create this digital record. Healthcare remains available without it.",
      );
    if (
      op.action === "update" &&
      existing &&
      JSON.stringify(result.data.consent) !==
        JSON.stringify(
          existing.data && "consent" in existing.data
            ? existing.data.consent
            : null,
        )
    )
      throw new DomainError("Use the consent history form to change consent.");
  }
  if (result.type === "pregnancies")
    requireRecord("mothers", result.data.motherId);
  if (result.type === "births") {
    if (result.data.motherId) requireRecord("mothers", result.data.motherId);
    if (result.data.date && result.data.date > today())
      throw new DomainError("Birth date cannot be in the future.");
    if (result.data.pregnancyId) {
      requireRecord("pregnancies", result.data.pregnancyId);
      if (
        find(records, "pregnancies", result.data.pregnancyId)?.data.motherId !==
        result.data.motherId
      )
        throw new DomainError(
          "The pregnancy must belong to the linked mother.",
        );
    }
  }
  if (result.type === "children") {
    if (result.data.motherId) requireRecord("mothers", result.data.motherId);
    if (result.data.birthId) {
      requireRecord("births", result.data.birthId);
      if (
        find(records, "births", result.data.birthId)?.data.motherId !==
        result.data.motherId
      )
        throw new DomainError(
          "The birth and child must link to the same mother.",
        );
    }
    if (!result.data.motherId && !result.data.consent.guardian.trim())
      throw new DomainError("Record the guardian for an independent child.");
    if ((result.data.dobSource === "unknown") !== (result.data.dob === null))
      throw new DomainError(
        "Leave the birth date blank when its source is unknown.",
      );
    if (result.data.dob && result.data.dob > today())
      throw new DomainError("Date of birth cannot be in the future.");
    if (result.data.scheduleId) {
      requireRecord("schedules", result.data.scheduleId);
      const schedule = find(records, "schedules", result.data.scheduleId);
      if (
        !schedule ||
        schedule.data.status !== "active" ||
        (!demo && schedule.data.testOnly)
      )
        throw new DomainError("An approved schedule is required.");
    }
    const sensitiveChange =
      existing?.type === "children" &&
      (result.data.dob !== existing.data.dob ||
        result.data.dobSource !== existing.data.dobSource ||
        result.data.motherId !== existing.data.motherId ||
        result.data.birthId !== existing.data.birthId ||
        result.data.scheduleId !== existing.data.scheduleId);
    if (op.action === "update" && profile.role === "fchv" && sensitiveChange)
      throw new DomainError(
        "A health worker must review a birth-date or relationship correction.",
        "forbidden",
      );
    if (
      op.action === "update" &&
      sensitiveChange &&
      (result.data.correctionReason?.trim().length ?? 0) < 3
    )
      throw new DomainError(
        "Explain the birth-date, relationship or schedule correction.",
      );
  }
  if ("subjectId" in result.data && "subjectType" in result.data)
    requireRecord(
      result.data.subjectType === "mother" ? "mothers" : "children",
      result.data.subjectId,
    );
  if (result.type === "care_events") {
    const data = result.data;
    if (profile.role === "fchv" && data.kind !== "vaccination")
      throw new DomainError(
        "FCHVs can enter unverified vaccination history. A health worker records clinical contacts.",
        "forbidden",
      );
    if (data.date > today())
      throw new DomainError(
        "A completed care event cannot have a future date.",
      );
    if (
      (["vaccination", "pnc_child"].includes(data.kind)
        ? "child"
        : "mother") !== data.subjectType
    )
      throw new DomainError(
        "Mother and newborn care events must be recorded separately.",
      );
    if (
      (!canVerify(profile.role) &&
        (data.verified || data.source === "provider_administered")) ||
      (data.verified && data.source !== "provider_administered")
    )
      throw new DomainError(
        "Reported or transcribed events must await authorized verification.",
        "forbidden",
      );
    if (data.pregnancyId) {
      const pregnancy = find(records, "pregnancies", data.pregnancyId);
      requireRecord("pregnancies", data.pregnancyId);
      if (
        data.subjectType === "mother" &&
        pregnancy?.data.motherId !== data.subjectId
      )
        throw new DomainError("The pregnancy must belong to this mother.");
    }
    if (["anc", "td"].includes(data.kind) && !data.pregnancyId)
      throw new DomainError("Select the pregnancy episode for this event.");
    if (data.kind === "vaccination") {
      requireRecord("schedules", data.scheduleId);
      const schedule = find(records, "schedules", data.scheduleId);
      if (
        !schedule ||
        schedule.data.status !== "active" ||
        (!demo && schedule.data.testOnly) ||
        !schedule.data.doses.some((d) => d.code === data.doseCode)
      )
        throw new DomainError(
          "Select a documented dose from the assigned schedule.",
        );
    }
    if (data.supersedesId) {
      if (!canVerify(profile.role))
        throw new DomainError(
          "Corrections require an authorized health worker.",
          "forbidden",
        );
      const prior = find(records, "care_events", data.supersedesId);
      if (
        !prior ||
        prior.data.subjectId !== data.subjectId ||
        prior.data.kind !== data.kind ||
        data.note.trim().length < 3
      )
        throw new DomainError(
          "A correction must preserve the subject and event type and include a reason.",
        );
      if (
        select(records, "care_events").some(
          (e) => e.data.supersedesId === data.supersedesId,
        )
      )
        throw new DomainError(
          "This event already has a correction.",
          "conflict",
        );
    }
  }
  if (result.type === "event_reviews") {
    if (!canVerify(profile.role))
      throw new DomainError(
        "Only an authorized health worker can verify events.",
        "forbidden",
      );
    requireRecord("care_events", result.data.eventId);
    const latest = select(records, "event_reviews")
      .filter((r) => r.data.eventId === result.data.eventId)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )[0];
    if ((latest?.id ?? null) !== result.data.expectedReviewId)
      throw new DomainError(
        "Another reviewer has updated this event.",
        "conflict",
      );
  }
  if (result.type === "appointments" && !canVerify(profile.role))
    throw new DomainError(
      "Appointments must be confirmed by a health worker.",
      "forbidden",
    );
  if (result.type === "sessions" && !canVerify(profile.role))
    throw new DomainError(
      "Only authorized health-post staff can change sessions.",
      "forbidden",
    );
  if (result.type === "attempts") {
    const task = find(records, "follow_ups", result.data.taskId);
    requireRecord("follow_ups", result.data.taskId);
    if (profile.role === "fchv" && task?.data.assigneeId !== profile.id)
      throw new DomainError(
        "This follow-up belongs to another worker.",
        "forbidden",
      );
    if (result.data.date > today())
      throw new DomainError("A contact attempt cannot be in the future.");
  }
  if (result.type === "follow_ups") {
    if (
      profile.role === "fchv" &&
      (result.data.assigneeId !== profile.id ||
        (existing?.type === "follow_ups" &&
          existing.data.assigneeId !== profile.id))
    )
      throw new DomainError(
        "This follow-up belongs to another worker.",
        "forbidden",
      );
    if (result.data.status === "closed") {
      if (!canVerify(profile.role))
        throw new DomainError(
          "A health worker must confirm care completion.",
          "forbidden",
        );
      const event = effectiveEvents(records, result.data.subjectId).find(
        (e) => e.id === result.data.completionEventId,
      );
      if (
        !event ||
        !matchesTask(result.data, event) ||
        eventDecision(records, event) !== "verified"
      )
        throw new DomainError(
          "Choose a matching verified care event before closing this follow-up.",
        );
    } else if (result.data.completionEventId) {
      throw new DomainError(
        "Only a completed follow-up can link a completion event.",
      );
    }
  }
  if (result.type === "reviews" && result.data.relatedId) {
    requireRecord(
      result.data.subjectType === "mother" ? "mothers" : "children",
      result.data.relatedId,
    );
  }
  if (
    result.type === "reviews" &&
    (op.action === "update" || result.data.status === "resolved") &&
    !canSupervise(profile.role)
  )
    throw new DomainError(
      "A supervisor must resolve this review.",
      "forbidden",
    );
  if (
    result.type === "reviews" &&
    result.data.status === "resolved" &&
    result.data.resolution.length < 3
  )
    throw new DomainError("Record the review decision and reason.");
  return result;
}

export function matchesTask(
  task: import("./types").Data<"follow_ups">,
  event: import("./types").Entity<"care_events">,
) {
  return (
    event.data.subjectId === task.subjectId &&
    event.data.subjectType === task.subjectType &&
    (task.category === "general" ||
      (task.category === "pnc"
        ? event.data.kind ===
          (task.subjectType === "mother" ? "pnc_mother" : "pnc_child")
        : event.data.kind === task.category)) &&
    (!task.doseCode ||
      (event.data.doseCode === task.doseCode &&
        event.data.scheduleId === task.scheduleId))
  );
}
