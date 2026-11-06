"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { WorkspaceDatabase, databaseName, saveLocalOperations } from "@/lib/db";
import { isDemo } from "@/lib/config";
import { applyOperation } from "@/lib/domain/mutations";
import { visibleRecords } from "@/lib/domain/access";
import {
  orderOperations,
  operationBatches,
  dependsOn,
} from "@/lib/domain/sync";
import { demoProfile, makeSeed, seedId } from "@/lib/domain/seed";
import {
  type AnyEntity,
  type SaveSpec,
  type AuditEntry,
  type AccessEvent,
  type Data,
  type Entity,
  type Language,
  type Operation,
  type Profile,
  type RecordKind,
  type Role,
  type Workspace,
} from "@/lib/domain/types";
import { translate, type TranslationKey } from "@/lib/i18n";

interface WorkspaceContextValue {
  records: AnyEntity[];
  audit: AuditEntry[];
  profile: Profile;
  language: Language;
  online: boolean;
  demo: boolean;
  ready: boolean;
  error: string;
  pending: Operation[];
  pendingAudit: number;
  syncing: boolean;
  lastSync: string | null;
  t: (key: TranslationKey) => string;
  create: <K extends RecordKind>(
    type: K,
    data: Data<K>,
    options?: { id?: string; wardId?: number },
  ) => Promise<Entity<K>>;
  saveBatch: (items: SaveSpec[]) => Promise<AnyEntity[]>;
  update: <K extends RecordKind>(
    record: Entity<K>,
    data: Data<K>,
  ) => Promise<Entity<K>>;
  perform: (
    record: Entity<"schedules">,
    action: "approve_clinical" | "activate",
  ) => Promise<void>;
  sync: () => Promise<void>;
  resetDemo: () => Promise<void>;
  setLanguage: (language: Language) => void;
  switchRole: (role: Role) => Promise<void>;
  discardConflict: (id: string) => Promise<void>;
  retryConflict: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  exportRecords: () => Promise<void>;
  recordAccess: (
    action: AccessEvent["action"],
    entityType: AccessEvent["entityType"],
    entityId: string,
  ) => Promise<void>;
}
const Context = createContext<WorkspaceContextValue | null>(null);
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Workspace provider is missing.");
  return context;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [records, setRecords] = useState<AnyEntity[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [profile, setProfile] = useState<Profile>(demoProfile);
  const profileRef = useRef(profile);
  const [language, setLanguageState] = useState<Language>("en");
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Operation[]>([]);
  const [pendingAudit, setPendingAudit] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const db = useRef<WorkspaceDatabase | null>(null);
  const syncLock = useRef(false);
  const mounted = useRef(false);
  const readyRef = useRef(false);
  const retryAttempt = useRef(0);
  const publish = useCallback(async () => {
    if (!db.current || !mounted.current) return;
    const [items, ops, history, last, accessCount] = await Promise.all([
      db.current.records.toArray(),
      db.current.outbox.orderBy("createdAt").toArray(),
      db.current.audit.orderBy("at").reverse().limit(200).toArray(),
      db.current.meta.get("lastSync"),
      db.current.accessQueue.count(),
    ]);
    if (!mounted.current) return;
    setRecords(items);
    setPending(ops);
    setPendingAudit(accessCount);
    setAudit(history);
    setLastSync((last?.value as string) ?? null);
  }, []);
  const refreshConnected = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (response.status === 401) {
      readyRef.current = false;
      setReady(false);
      await db.current?.meta.put({ key: "offlineUntil", value: 0 });
      router.replace("/login");
      throw new Error("Please sign in again to sync.");
    }
    if (response.status === 403) {
      readyRef.current = false;
      setReady(false);
      setRecords([]);
      await db.current?.meta.put({ key: "offlineUntil", value: 0 });
    }
    if (!response.ok)
      throw new Error(
        "The workspace could not be loaded. Check your connection and staff assignment.",
      );
    const server = (await response.json()) as Workspace;
    const database = db.current!;
    const previous = (await database.meta.get("profile"))?.value as
      Profile | undefined;
    if (
      previous &&
      previous.id !== server.profile.id &&
      ((await database.outbox.count()) > 0 ||
        (await database.accessQueue.count()) > 0)
    )
      throw new Error(
        "This device has unsynced work for another account. Sign in to that account to resolve it first.",
      );
    profileRef.current = server.profile;
    setProfile(server.profile);
    await database.transaction(
      "rw",
      [database.records, database.meta, database.outbox, database.audit],
      async () => {
        await database.records.clear();
        await database.records.bulkPut(server.records);
        await database.audit.clear();
        if (server.audit.length) await database.audit.bulkPut(server.audit);
        const ops = orderOperations(await database.outbox.toArray());
        const overlay = [...server.records];
        for (const op of ops) {
          if (op.status === "conflict" || op.status === "rejected") continue;
          try {
            const changed = applyOperation(overlay, op, server.profile);
            const index = overlay.findIndex((r) => r.id === changed.id);
            if (index < 0) overlay.push(changed);
            else overlay[index] = changed;
            await database.records.put(changed);
          } catch {
            // A write may have committed before its acknowledgement was lost.
            // Replay its operation ID against the server before calling it a conflict.
          }
        }
        await database.meta.bulkPut([
          { key: "profile", value: server.profile },
          { key: "offlineUntil", value: Date.now() + 4 * 3600000 },
        ]);
      },
    );
  }, [router]);
  const sync = useCallback(async () => {
    const database = db.current;
    if (!database || !readyRef.current || syncLock.current || !navigator.onLine)
      return;
    syncLock.current = true;
    setSyncing(true);
    try {
      if (!isDemo) await refreshConnected();
      const batches = operationBatches(await database.outbox.toArray());
      const blocked: Operation[] = [];
      for (const batch of batches) {
        if (
          batch.some(
            (op) => op.status === "conflict" || op.status === "rejected",
          )
        ) {
          blocked.push(...batch);
          continue;
        }
        if (
          batch.some((op) => blocked.some((parent) => dependsOn(op, parent)))
        ) {
          for (const op of batch)
            await database.outbox.update(op.id, {
              status: "conflict",
              error:
                "A linked record or earlier edit needs review before this form can sync.",
            });
          blocked.push(...batch);
          continue;
        }
        if (!isDemo) {
          const response = await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operations: batch }),
          });
          if (!response.ok) {
            const message =
              (await response.json().catch(() => ({}))).error ??
              "Could not sync this change.";
            for (const op of batch)
              await database.outbox.update(op.id, {
                status:
                  response.status === 409
                    ? "conflict"
                    : response.status >= 500
                      ? "pending"
                      : "rejected",
                error: message,
              });
            blocked.push(...batch);
            if (response.status === 401 || response.status === 403) {
              readyRef.current = false;
              setReady(false);
              setRecords([]);
              await database.meta.put({ key: "offlineUntil", value: 0 });
            }
            if (
              response.status === 401 ||
              response.status === 403 ||
              response.status >= 500
            )
              throw new Error(message);
            continue;
          }
        }
        await database.transaction(
          "rw",
          [database.outbox, database.receipts],
          async () => {
            for (const op of batch) {
              await database.receipts.put({
                id: op.id,
                at: new Date().toISOString(),
              });
              await database.outbox.delete(op.id);
            }
          },
        );
      }
      if (!isDemo) await refreshConnected();
      if (!isDemo)
        for (const entry of await database.accessQueue
          .orderBy("occurredAt")
          .toArray()) {
          const response = await fetch("/api/audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry),
          });
          if (!response.ok)
            throw new Error(
              "Access history could not sync. It remains on this device; reconnect with the same staff account.",
            );
          await database.accessQueue.delete(entry.id);
        }
      await database.meta.put({
        key: "lastSync",
        value: new Date().toISOString(),
      });
      setError("");
      retryAttempt.current = 0;
    } catch (failure) {
      retryAttempt.current += 1;
      setError(
        failure instanceof Error
          ? failure.message
          : "Sync is unavailable. Your pending work is still on this device.",
      );
    } finally {
      syncLock.current = false;
      if (mounted.current) setSyncing(false);
      await publish();
    }
  }, [publish, refreshConnected]);
  useEffect(() => {
    mounted.current = true;
    const database = new WorkspaceDatabase(databaseName(isDemo));
    db.current = database;
    let cancelled = false;
    async function initialize() {
      try {
        await database.open();
        if (isDemo && !(await database.meta.get("seeded"))) {
          await database.transaction(
            "rw",
            [database.records, database.meta],
            async () => {
              await database.records.bulkPut(makeSeed());
              await database.meta.bulkPut([
                { key: "seeded", value: true },
                { key: "profile", value: demoProfile },
              ]);
            },
          );
        }
        if (!isDemo && navigator.onLine) await refreshConnected();
        else if (!isDemo) {
          const lease = (await database.meta.get("offlineUntil"))?.value as
            number | undefined;
          if (!lease || lease < Date.now())
            throw new Error(
              "Connect and sign in to unlock this workspace. Pending work remains on this device.",
            );
        }
        const savedProfile = (await database.meta.get("profile"))?.value as
          Profile | undefined;
        if (!savedProfile)
          throw new Error("Sign in online before using this device offline.");
        if (cancelled) return;
        profileRef.current = savedProfile;
        setProfile(savedProfile);
        setLanguageState(
          ((await database.meta.get("language"))?.value as Language) ?? "en",
        );
        setOnline(navigator.onLine);
        await publish();
        readyRef.current = true;
        setReady(true);
      } catch (failure) {
        if (!cancelled)
          setError(
            failure instanceof Error
              ? failure.message
              : "Local storage is unavailable. Check browser permissions.",
          );
      }
    }
    void initialize();
    const updateConnection = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sync();
    };
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      cancelled = true;
      readyRef.current = false;
      mounted.current = false;
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      database.close();
    };
  }, [publish, refreshConnected, sync]);
  useEffect(() => {
    if (
      ready &&
      online &&
      (pendingAudit > 0 ||
        pending.some((op) => !op.status || op.status === "pending"))
    ) {
      const timer = setTimeout(
        () => {
          void sync();
        },
        Math.min(60000, 800 * 2 ** retryAttempt.current),
      );
      return () => clearTimeout(timer);
    }
  }, [pending, pendingAudit, ready, online, sync]);

  const recordAccess = useCallback(
    async (
      action: AccessEvent["action"],
      entityType: AccessEvent["entityType"],
      entityId: string,
    ) => {
      const database = db.current;
      if (!database || !readyRef.current)
        throw new Error("Unlock the workspace before opening a record.");
      const currentProfile = profileRef.current;
      const record = await database.records.get(entityId);
      if (
        !record ||
        record.type !== entityType ||
        record.facilityId !== currentProfile.facilityId ||
        !currentProfile.wardIds.includes(record.wardId) ||
        !["fchv", "health_worker", "supervisor"].includes(currentProfile.role)
      )
        throw new Error("This record is outside your assignment.");
      if (
        action === "print" &&
        !["health_worker", "supervisor"].includes(currentProfile.role)
      )
        throw new Error("Print requires health-post authorization.");
      if (!isDemo && (await database.accessQueue.count()) >= 1000) {
        readyRef.current = false;
        setReady(false);
        setRecords([]);
        setError(
          "Connect and reload to sync device access history before opening more records.",
        );
        throw new Error(
          "The device audit queue is full. Connect and reload to sync.",
        );
      }
      const event: AccessEvent = {
        id: crypto.randomUUID(),
        action,
        entityId,
        entityType,
        occurredAt: new Date().toISOString(),
      };
      await database.transaction(
        "rw",
        [database.audit, database.accessQueue],
        async () => {
          await database.audit.put({
            id: event.id,
            actor: currentProfile.name,
            action,
            entityId,
            entityType,
            at: event.occurredAt,
          });
          if (!isDemo) await database.accessQueue.put(event);
        },
      );
      await publish();
    },
    [publish],
  );

  useEffect(() => {
    if (isDemo || !ready) return;
    let cancelled = false;
    const checkLease = async () => {
      const lease = Number(
        (await db.current?.meta.get("offlineUntil"))?.value ?? 0,
      );
      if (!cancelled && lease <= Date.now()) {
        readyRef.current = false;
        setReady(false);
        setRecords([]);
        setError(
          "Your offline session has expired. Connect and sign in again to unlock the workspace. Pending work remains on this device.",
        );
      }
    };
    const timer = setInterval(() => void checkLease(), 10000);
    window.addEventListener("focus", checkLease);
    document.addEventListener("visibilitychange", checkLease);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", checkLease);
      document.removeEventListener("visibilitychange", checkLease);
    };
  }, [ready]);

  async function mutate(op: Operation): Promise<AnyEntity> {
    const database = db.current!;
    if (!readyRef.current)
      throw new Error("Unlock the workspace before recording work.");
    if (!isDemo) {
      const lease = (await database.meta.get("offlineUntil"))?.value as
        number | undefined;
      if (!lease || lease < Date.now())
        throw new Error("Reconnect and sign in before recording more work.");
    }
    const [saved] = await saveLocalOperations(
      database,
      [op],
      profileRef.current,
      isDemo,
    );
    await publish();
    return saved;
  }
  async function create<K extends RecordKind>(
    type: K,
    data: Data<K>,
    options?: { id?: string; wardId?: number },
  ): Promise<Entity<K>> {
    return (await mutate({
      id: crypto.randomUUID(),
      entityId: options?.id ?? crypto.randomUUID(),
      entityType: type,
      action: "create",
      data: data as Record<string, unknown>,
      expectedVersion: 0,
      wardId: options?.wardId ?? profileRef.current.wardIds[0],
      createdAt: new Date().toISOString(),
      status: "pending",
    })) as Entity<K>;
  }
  async function saveBatch(items: SaveSpec[]): Promise<AnyEntity[]> {
    const database = db.current!;
    if (!readyRef.current)
      throw new Error("Unlock the workspace before recording work.");
    if (
      !isDemo &&
      Number((await database.meta.get("offlineUntil"))?.value ?? 0) < Date.now()
    )
      throw new Error("Reconnect and sign in before recording more work.");
    if (!items.length || items.length > 30)
      throw new Error("A form can save between 1 and 30 related records.");
    const batchId = crypto.randomUUID();
    const ops: Operation[] = items.map((item) => ({
      id: crypto.randomUUID(),
      batchId,
      entityId: item.id ?? crypto.randomUUID(),
      entityType: item.type,
      action: item.expectedVersion ? "update" : "create",
      data: item.data,
      expectedVersion: item.expectedVersion ?? 0,
      wardId: item.wardId ?? profileRef.current.wardIds[0],
      createdAt: new Date().toISOString(),
      status: "pending",
    }));
    const saved = await saveLocalOperations(
      database,
      ops,
      profileRef.current,
      isDemo,
    );
    await publish();
    return saved;
  }
  async function update<K extends RecordKind>(
    record: Entity<K>,
    data: Data<K>,
  ): Promise<Entity<K>> {
    return (await mutate({
      id: crypto.randomUUID(),
      entityId: record.id,
      entityType: record.type,
      action: "update",
      data: data as Record<string, unknown>,
      expectedVersion: record.version,
      wardId: record.wardId,
      createdAt: new Date().toISOString(),
      status: "pending",
    })) as Entity<K>;
  }
  async function perform(
    record: Entity<"schedules">,
    action: "approve_clinical" | "activate",
  ) {
    await mutate({
      id: crypto.randomUUID(),
      entityId: record.id,
      entityType: "schedules",
      action,
      data: {},
      expectedVersion: record.version,
      wardId: record.wardId,
      createdAt: new Date().toISOString(),
      status: "pending",
    });
  }
  async function resetDemo() {
    if (!isDemo) return;
    await db.current!.transaction(
      "rw",
      [
        db.current!.records,
        db.current!.outbox,
        db.current!.audit,
        db.current!.receipts,
        db.current!.meta,
        db.current!.accessQueue,
      ],
      async () => {
        await db.current!.records.clear();
        await db.current!.outbox.clear();
        await db.current!.audit.clear();
        await db.current!.receipts.clear();
        await db.current!.accessQueue.clear();
        await db.current!.records.bulkPut(makeSeed());
        await db.current!.meta.delete("lastSync");
        await db.current!.meta.put({ key: "profile", value: demoProfile });
      },
    );
    profileRef.current = demoProfile;
    setProfile(demoProfile);
    await publish();
    toast.success("Practice workspace reset.");
  }
  function setLanguage(value: Language) {
    setLanguageState(value);
    document.documentElement.lang = value;
    void db.current?.meta.put({ key: "language", value });
  }
  async function switchRole(role: Role) {
    if (!isDemo) return;
    const changed = {
      ...demoProfile,
      role,
      id:
        role === "clinical_approver"
          ? seedId(90)
          : role === "municipality_admin"
            ? seedId(91)
            : seedId(1),
      name:
        role === "clinical_approver"
          ? "Clinical reviewer (demo)"
          : role === "municipality_admin"
            ? "Programme approver (demo)"
            : demoProfile.name,
    };
    await db.current!.meta.put({ key: "profile", value: changed });
    profileRef.current = changed;
    setProfile(changed);
  }
  async function discardConflict(id: string) {
    const operation = await db.current!.outbox.get(id);
    if (!operation) return;
    const related = (await db.current!.outbox.toArray()).filter(
      (op) =>
        op.id === id || (operation.batchId && op.batchId === operation.batchId),
    );
    await db.current!.transaction(
      "rw",
      [db.current!.outbox, db.current!.audit],
      async () => {
        for (const item of related) {
          await db.current!.outbox.delete(item.id);
          await db.current!.audit.put({
            id: crypto.randomUUID(),
            actor: profile.name,
            action: "discard_conflicting_local_change",
            entityId: item.entityId,
            entityType: item.entityType,
            at: new Date().toISOString(),
          });
        }
      },
    );
    if (!isDemo) await refreshConnected();
    await publish();
  }
  async function retryConflict(id: string) {
    const op = await db.current!.outbox.get(id);
    if (!op || op.action !== "update")
      throw new Error(
        "This operation must be re-entered through the original form after review.",
      );
    if (
      op.batchId &&
      (await db.current!.outbox.toArray()).filter(
        (item) => item.batchId === op.batchId,
      ).length > 1
    )
      throw new Error(
        "This form contains linked changes. Review the whole group, discard it, and re-enter the form against the shared records.",
      );
    if (!isDemo) await refreshConnected();
    const current = await db.current!.records.get(op.entityId);
    if (!current)
      throw new Error("The record is no longer available in your scope.");
    await mutate({
      ...op,
      id: crypto.randomUUID(),
      expectedVersion: current.version,
      status: "pending",
      error: undefined,
      createdAt: new Date().toISOString(),
    });
    await db.current!.outbox.delete(id);
    await publish();
  }
  async function signOut() {
    if (navigator.onLine) await sync();
    if (
      (await db.current!.outbox.count()) > 0 ||
      (await db.current!.accessQueue.count()) > 0
    )
      throw new Error(
        "Sync or resolve your pending changes before signing out.",
      );
    if (!isDemo) {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Reconnect to sign out securely.");
    }
    await db.current!.delete();
    window.location.assign(isDemo ? "/" : "/login");
  }
  async function exportRecords() {
    if (!["health_worker", "supervisor"].includes(profile.role))
      throw new Error("Export requires an authorized health-post worker.");
    let body: unknown;
    if (isDemo)
      body = {
        format: "maatri-shishu/1",
        synthetic: true,
        exportedAt: new Date().toISOString(),
        records: await db.current!.records.toArray(),
      };
    else {
      const response = await fetch("/api/export", { cache: "no-store" });
      if (!response.ok)
        throw new Error(
          "Export is unavailable. Connect and verify your permissions.",
        );
      body = await response.json();
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "maatri-shishu-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
    await db.current!.audit.put({
      id: crypto.randomUUID(),
      actor: profile.name,
      action: "export",
      entityId: profile.facilityId,
      entityType: "workspace",
      at: new Date().toISOString(),
    });
    await publish();
  }
  return (
    <Context.Provider
      value={{
        records: ready ? visibleRecords(records, profile, isDemo) : [],
        audit: ready ? audit : [],
        profile,
        language,
        online,
        demo: isDemo,
        ready,
        error,
        pending,
        pendingAudit,
        syncing,
        lastSync,
        t: (key) => translate(language, key),
        create,
        saveBatch,
        update,
        perform,
        sync,
        resetDemo,
        setLanguage,
        switchRole,
        discardConflict,
        retryConflict,
        signOut,
        exportRecords,
        recordAccess,
      }}
    >
      {children}
    </Context.Provider>
  );
}
