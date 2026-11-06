import { canManageSchedules, type AnyEntity, type Profile } from "./types";

/** Filter cached records before exposing them to views, search, and aggregates. */
export function visibleRecords(
  records: AnyEntity[],
  profile: Profile,
  demo: boolean,
) {
  if (!profile.active) return [];
  return records.filter(
    (record) =>
      record.facilityId === profile.facilityId &&
      profile.wardIds.includes(record.wardId) &&
      (record.type === "schedules"
        ? canManageSchedules(profile.role) ||
          (record.data.status === "active" && (demo || !record.data.testOnly))
        : ["fchv", "health_worker", "supervisor"].includes(profile.role)),
  );
}
