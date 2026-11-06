import Dexie, { type EntityTable } from "dexie";
import type {
  AnyEntity,
  AuditEntry,
  AccessEvent,
  Operation,
} from "./domain/types";
import type { Profile } from "./domain/types";
import { applyOperation } from "./domain/mutations";
import { orderOperations } from "./domain/sync";

export class WorkspaceDatabase extends Dexie {
  records!: EntityTable<AnyEntity, "id">;
  outbox!: EntityTable<Operation, "id">;
  audit!: EntityTable<AuditEntry, "id">;
  meta!: EntityTable<{ key: string; value: unknown }, "key">;
  receipts!: EntityTable<{ id: string; at: string }, "id">;
  accessQueue!: EntityTable<AccessEvent, "id">;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      records: "id,type,wardId,updatedAt",
      outbox: "id,createdAt,status",
      audit: "id,at,entityId",
      meta: "key",
      receipts: "id",
    });
    this.version(2).stores({ accessQueue: "id,entityId,occurredAt" });
  }
}
export const databaseName = (demo: boolean) =>
  demo ? "maatri-shishu-demo-v1" : "maatri-shishu-connected-v1";

/** Persist a complete form, its audit entries, and its outbox in one transaction. */
export async function saveLocalOperations(
  db: WorkspaceDatabase,
  operations: Operation[],
  profile: Profile,
  demo: boolean,
) {
  const saved: AnyEntity[] = [];
  await db.transaction("rw", [db.records, db.outbox, db.audit], async () => {
    const current = await db.records.toArray();
    for (const op of orderOperations(operations)) {
      const record = applyOperation(current, op, profile, demo);
      const index = current.findIndex((item) => item.id === record.id);
      if (index < 0) current.push(record);
      else current[index] = record;
      saved.push(record);
      await db.records.put(record);
      await db.outbox.put(op);
      await db.audit.put({
        id: crypto.randomUUID(),
        actor: profile.name,
        action: op.action,
        entityId: record.id,
        entityType: record.type,
        at: op.createdAt,
      });
    }
  });
  return saved;
}
