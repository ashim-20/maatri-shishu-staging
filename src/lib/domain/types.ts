import { z } from "zod";
import { isDateOnly } from "./dates";

export const roles = [
  "fchv",
  "health_worker",
  "supervisor",
  "municipality_admin",
  "clinical_approver",
  "system_admin",
] as const;
export type Role = (typeof roles)[number];
export type Language = "en" | "ne" | "bho";
export interface Profile {
  id: string;
  name: string;
  role: Role;
  facilityId: string;
  facilityName: string;
  wardIds: number[];
  active: boolean;
}
const uuid = z.string().uuid();
const optionalId = uuid.nullable();
export const dateSchema = z
  .string()
  .refine(isDateOnly, "Enter a valid calendar date.");
const dateOptional = dateSchema.nullable();
const name = z
  .string()
  .trim()
  .min(1, "A name or local identifier is required.")
  .max(120);
const note = z.string().trim().max(500).default("");
export const consentSchema = z.object({
  status: z.enum(["given", "declined", "withdrawn"]),
  language: z.enum(["en", "ne", "bho"]),
  method: z.enum(["verbal", "written"]),
  guardian: z.string().max(120).default(""),
});
export const doseRuleSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(1200),
  unit: z.enum(["days", "weeks", "months"]),
});
export type DoseRule = z.infer<typeof doseRuleSchema>;
export const outcomes = [
  "plans_to_attend",
  "attended_elsewhere",
  "card_unavailable",
  "temporarily_unavailable",
  "moved",
  "unable_to_contact",
  "declines",
  "session_postponed",
  "service_unavailable",
  "referred",
  "other",
] as const;
export const schemas = {
  mothers: z.object({
    name,
    reference: z.string().min(1).max(40),
    settlement: z.string().trim().min(1).max(100),
    age: z.number().int().min(10).max(100).nullable(),
    phone: z.string().max(25).default(""),
    language: z.enum(["en", "ne", "bho"]),
    status: z.enum(["pregnant", "postnatal", "inactive", "moved"]),
    consent: consentSchema,
  }),
  pregnancies: z.object({
    motherId: uuid,
    lmp: dateOptional,
    edd: dateOptional,
    dateSource: z.enum(["provider", "card", "reported", "unknown"]),
    status: z.enum(["active", "postnatal", "closed"]),
  }),
  births: z.object({
    motherId: optionalId,
    pregnancyId: optionalId,
    date: dateOptional,
    time: z
      .string()
      .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/)
      .default(""),
    place: z.string().max(120).default(""),
    source: z.enum(["provider", "card", "reported", "unknown"]),
  }),
  children: z.object({
    name,
    reference: z.string().min(1).max(40),
    motherId: optionalId,
    birthId: optionalId,
    dob: dateOptional,
    dobSource: z.enum(["confirmed", "approximate", "unknown"]),
    sex: z.enum(["female", "male", "not_recorded"]),
    settlement: z.string().min(1).max(100),
    scheduleId: optionalId,
    status: z.enum(["active", "moved", "deceased"]),
    consent: consentSchema,
    correctionReason: z.string().trim().max(500).optional(),
  }),
  care_events: z.object({
    subjectId: uuid,
    subjectType: z.enum(["mother", "child"]),
    pregnancyId: optionalId,
    kind: z.enum(["anc", "pnc_mother", "pnc_child", "td", "vaccination"]),
    date: dateSchema,
    source: z.enum([
      "provider_administered",
      "card_transcription",
      "caregiver_reported",
    ]),
    verified: z.boolean(),
    provider: z.string().max(120).default(""),
    doseCode: z.string().max(60).nullable(),
    scheduleId: optionalId,
    timing: z.string().max(60).default(""),
    supersedesId: optionalId,
    note,
  }),
  event_reviews: z.object({
    eventId: uuid,
    decision: z.enum(["verified", "rejected"]),
    expectedReviewId: optionalId,
    reason: z.string().trim().min(3).max(500),
  }),
  appointments: z.object({
    subjectId: uuid,
    subjectType: z.enum(["mother", "child"]),
    date: dateSchema,
    type: z.enum(["anc", "pnc", "vaccination", "other"]),
    note,
  }),
  follow_ups: z.object({
    subjectId: uuid,
    subjectType: z.enum(["mother", "child"]),
    dueDate: dateSchema,
    category: z.enum(["anc", "pnc", "vaccination", "general"]),
    reason: z.string().min(1).max(200),
    assigneeId: uuid,
    doseCode: z.string().max(60).nullable(),
    scheduleId: optionalId,
    status: z.enum(["open", "closed"]),
    completionEventId: optionalId.optional(),
  }),
  attempts: z.object({
    taskId: uuid,
    date: dateSchema,
    channel: z.enum(["home_visit", "phone", "health_post"]),
    outcome: z.enum(outcomes),
    nextDate: dateOptional,
    note,
  }),
  sessions: z.object({
    title: name,
    date: dateSchema,
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    location: z.string().min(1).max(150),
    service: z.enum(["immunization", "anc_pnc", "combined"]),
    status: z.enum(["scheduled", "confirmed", "cancelled"]),
    note,
  }),
  consents: z.object({
    subjectId: uuid,
    subjectType: z.enum(["mother", "child"]),
    consent: consentSchema,
    reason: z.string().min(3).max(300),
  }),
  schedules: z
    .object({
      name,
      source: z.string().min(1).max(500),
      authority: z.string().min(1).max(200),
      effectiveFrom: dateSchema,
      effectiveTo: dateOptional,
      status: z.enum(["draft", "clinical_approved", "active"]),
      clinicalApprover: optionalId,
      programmeApprover: optionalId,
      testOnly: z.boolean(),
      doses: z.array(doseRuleSchema).min(1).max(100),
    })
    .refine(
      (s) => new Set(s.doses.map((d) => d.code)).size === s.doses.length,
      "Dose codes must be unique.",
    ),
  reviews: z.object({
    subjectId: uuid,
    subjectType: z.enum(["mother", "child"]),
    category: z.enum(["duplicate", "uncertain_dob", "transfer", "correction"]),
    relatedId: optionalId,
    status: z.enum(["open", "resolved"]),
    reason: z.string().min(1).max(500),
    resolution: z.string().max(500).default(""),
  }),
};
export type RecordKind = keyof typeof schemas;
export const recordKinds = Object.keys(schemas) as RecordKind[];
export type Data<K extends RecordKind> = z.infer<(typeof schemas)[K]>;
export interface Entity<K extends RecordKind = RecordKind> {
  id: string;
  type: K;
  data: Data<K>;
  facilityId: string;
  wardId: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
export type AnyEntity = { [K in RecordKind]: Entity<K> }[RecordKind];
export type SaveSpec = {
  [K in RecordKind]: {
    type: K;
    data: Data<K>;
    id?: string;
    wardId?: number;
    expectedVersion?: number;
  };
}[RecordKind];
export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entityId: string;
  entityType: string;
  at: string;
}
export interface AccessEvent {
  id: string;
  action: "read" | "print";
  entityId: string;
  entityType: "mothers" | "children";
  occurredAt: string;
}
export interface Operation {
  id: string;
  entityId: string;
  entityType: RecordKind;
  action: "create" | "update" | "approve_clinical" | "activate";
  data: Record<string, unknown>;
  expectedVersion: number;
  wardId: number;
  createdAt: string;
  batchId?: string;
  error?: string;
  status?: "pending" | "conflict" | "rejected";
}
export interface Workspace {
  records: AnyEntity[];
  audit: AuditEntry[];
  profile: Profile;
}
export function select<K extends RecordKind>(
  records: AnyEntity[],
  type: K,
): Entity<K>[] {
  return records.filter((r) => r.type === type) as Entity<K>[];
}
export function find<K extends RecordKind>(
  records: AnyEntity[],
  type: K,
  id: string | null | undefined,
): Entity<K> | undefined {
  return select(records, type).find((r) => r.id === id);
}
export function canVerify(role: Role) {
  return role === "health_worker" || role === "supervisor";
}
export function currentConsent(
  records: AnyEntity[],
  person: Entity<"mothers"> | Entity<"children">,
) {
  return (
    select(records, "consents")
      .filter((event) => event.data.subjectId === person.id)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )[0]?.data.consent ?? person.data.consent
  );
}
export function canSupervise(role: Role) {
  return role === "supervisor" || role === "municipality_admin";
}
export function canManageSchedules(role: Role) {
  return ["clinical_approver", "municipality_admin", "system_admin"].includes(
    role,
  );
}
export const roleLabels: Record<Role, string> = {
  fchv: "FCHV",
  health_worker: "Health worker",
  supervisor: "Health-post in-charge",
  municipality_admin: "Municipality administrator",
  clinical_approver: "Clinical schedule reviewer",
  system_admin: "System administrator",
};
