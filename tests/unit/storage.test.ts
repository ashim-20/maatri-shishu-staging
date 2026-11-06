import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { WorkspaceDatabase } from "@/lib/db";
import { makeSeed } from "@/lib/domain/seed";
import type { Operation } from "@/lib/domain/types";

it("keeps records and unacknowledged operations across a database restart", async () => {
  const name = `maatri-test-${crypto.randomUUID()}`;
  const db = new WorkspaceDatabase(name);
  const record = makeSeed()[1];
  const operation: Operation = {
    id: crypto.randomUUID(),
    entityId: record.id,
    entityType: record.type,
    action: "create",
    data: record.data,
    expectedVersion: 0,
    wardId: 3,
    createdAt: new Date().toISOString(),
  };
  await db.transaction("rw", [db.records, db.outbox], async () => {
    await db.records.put(record);
    await db.outbox.put(operation);
  });
  db.close();
  const reopened = new WorkspaceDatabase(name);
  expect((await reopened.records.get(record.id))?.data).toEqual(record.data);
  expect(await reopened.outbox.get(operation.id)).toEqual(operation);
  await reopened.delete();
});
it("rolls back both local record and outbox when a save transaction fails", async () => {
  const db = new WorkspaceDatabase(`maatri-test-${crypto.randomUUID()}`);
  const record = makeSeed()[1];
  await expect(
    db.transaction("rw", [db.records, db.outbox], async () => {
      await db.records.put(record);
      throw new Error("interrupted local save");
    }),
  ).rejects.toThrow("interrupted");
  expect(await db.records.count()).toBe(0);
  expect(await db.outbox.count()).toBe(0);
  await db.delete();
});
