"use client";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  Globe2,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Input, Select } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "./provider";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Note,
  PageHeading,
  StatCard,
  StatusBadge,
  TaskTable,
  type ViewProps,
} from "./shared";
import {
  canManageSchedules,
  canSupervise,
  canVerify,
  find,
  roleLabels,
  roles,
  select,
  type Role,
  type Entity,
} from "@/lib/domain/types";
import { addDays, addMonths, formatDate, today } from "@/lib/domain/dates";
import {
  completion,
  effectiveEvents,
  eventDecision,
  timeline,
} from "@/lib/domain/schedule";
import { workspaceStats } from "@/lib/domain/worklist";

export function FollowupsView(props: ViewProps) {
  const { records, profile, demo, t } = useWorkspace();
  const [filter, setFilter] = useState("attention");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const { tasks } = workspaceStats(records, profile, demo);
  const visible = tasks.filter(
    (task) =>
      (subjectFilter === "all" || task.data.subjectType === subjectFilter) &&
      `${task.person.data.name} ${task.data.reason}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "complete"
          ? task.resolved
          : !task.resolved &&
            (filter === "attention"
              ? task.data.dueDate <= today()
              : filter === "today"
                ? task.data.dueDate === today()
                : task.data.dueDate > today()))),
  );
  return (
    <>
      <PageHeading title={t("followups")} subtitle={t("followupSubtitle")} />
      <Card className="overflow-hidden">
        <div className="filter-bar flex-wrap">
          <div className="flex flex-wrap gap-1">
            {[
              ["attention", "Needs attention"],
              ["today", t("due")],
              ["upcoming", t("upcoming")],
              ["complete", "Resolved"],
              ["all", t("all")],
            ].map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={filter === key ? "secondary" : "ghost"}
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  setLimit(20);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <Select
            className="!w-auto"
            aria-label="Follow-up subject"
            value={subjectFilter}
            onChange={(event) => {
              setSubjectFilter(event.target.value);
              setLimit(20);
            }}
          >
            <option value="all">All people</option>
            <option value="mother">Mothers</option>
            <option value="child">Children</option>
          </Select>
          <Input
            className="ml-auto !max-w-64"
            placeholder={t("searchShort")}
            aria-label="Search follow-ups"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <TaskTable items={visible.slice(0, limit)} {...props} />
        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-[10px] text-muted-foreground">
          <span>
            {visible.length} care action{visible.length === 1 ? "" : "s"} ·
            Attempts are separate from care completion
          </span>
          {visible.length > limit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLimit(limit + 20)}
            >
              Show more
            </Button>
          )}
        </div>
      </Card>
      <div className="mt-5">
        <Note>
          “Date passed” asks the care team to verify status. It does not mean a
          dose was refused or definitely missed. Service delays and care
          elsewhere can also explain a pending record.
        </Note>
      </div>
    </>
  );
}
export function CalendarView({ openForm }: ViewProps) {
  const { records, profile, t, language, pending } = useWorkspace();
  const [month, setMonth] = useState(`${today().slice(0, 7)}-01`);
  const [selected, setSelected] = useState<string | null>(null);
  const sessions = select(records, "sessions").sort(
    (a, b) =>
      a.data.date.localeCompare(b.data.date) ||
      a.data.startTime.localeCompare(b.data.startTime),
  );
  const monthEnd = addDays(addMonths(month, 1), -1);
  const startDay = new Date(`${month}T12:00:00Z`).getUTCDay();
  const days = Number(monthEnd.slice(-2));
  const shown = sessions.filter((s) =>
    selected
      ? s.data.date === selected
      : s.data.date.slice(0, 7) === month.slice(0, 7),
  );
  return (
    <>
      <PageHeading title={t("calendar")} subtitle={t("calendarSubtitle")}>
        {canVerify(profile.role) && (
          <Button onClick={() => openForm({ type: "session" })}>
            <Plus />
            {t("createSession")}
          </Button>
        )}
      </PageHeading>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="items-center">
            <CardTitle>
              {formatDate(month, language, {
                day: undefined,
                month: "long",
                year: "numeric",
              })}
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous month"
                onClick={() => {
                  setMonth(addMonths(month, -1));
                  setSelected(null);
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next month"
                onClick={() => {
                  setMonth(addMonths(month, 1));
                  setSelected(null);
                }}
              >
                <ChevronRight />
              </Button>
            </div>
          </CardHeader>
          <div className="grid grid-cols-7 border-y border-border bg-[#fafbf8] py-3 text-center text-[10px] text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: startDay }, (_, i) => (
              <div
                key={`blank-${i}`}
                className="min-h-16 border-b border-r border-[#edf0e9] bg-[#fdfefb]"
              />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`;
              const hasSessions = sessions.some(
                (s) => s.data.date === date && s.data.status !== "cancelled",
              );
              return (
                <button
                  key={date}
                  onClick={() => setSelected(selected === date ? null : date)}
                  aria-label={`${date}${hasSessions ? ", clinic session" : ""}`}
                  aria-pressed={selected === date}
                  className={`flex min-h-16 flex-col items-center justify-center gap-2 border-b border-r border-[#edf0e9] text-xs transition-colors hover:bg-secondary sm:min-h-20 ${selected === date ? "bg-[#e8f0df] text-primary" : date === today() ? "bg-[#f0f5ec] font-semibold text-primary" : ""}`}
                >
                  <span>{i + 1}</span>
                  <span
                    className={`size-1 rounded-full ${hasSessions ? "bg-[#97b787]" : "bg-transparent"}`}
                  />
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-[#97b787]" />
              Clinic session
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setMonth(`${today().slice(0, 7)}-01`);
                setSelected(null);
              }}
            >
              {t("today")}
            </Button>
          </div>
        </Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">
              {selected
                ? formatDate(selected, language, { year: "numeric" })
                : "This month’s sessions"}
            </h2>
            {selected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(null)}
              >
                Show all
              </Button>
            )}
          </div>
          {shown.length ? (
            shown.map((session) => (
              <Card key={session.id}>
                <CardContent className="pt-5">
                  <div className="mb-4 flex items-start gap-3">
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-[#f0f4e9] py-2 text-[#536844]">
                      <span className="text-[9px] uppercase">
                        {formatDate(session.data.date, language, {
                          day: undefined,
                          month: "short",
                        })}
                      </span>
                      <span className="text-xl font-semibold">
                        {Number(session.data.date.slice(-2))}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">
                        {session.data.title}
                      </h3>
                      <div className="mt-2">
                        <StatusBadge status={session.data.status} />
                        {pending.some((op) => op.entityId === session.id) && (
                          <Badge className="ml-1 badge-pending">
                            Local · unpublished
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mb-2 flex items-start gap-2 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" />
                    {session.data.location}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    {session.data.startTime} · Nepal local time
                  </p>
                  {session.data.note && (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {session.data.note}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                    <span className="text-[9px] text-muted-foreground">
                      Updated {formatDate(session.updatedAt, language)}
                    </span>
                    {canVerify(profile.role) && (
                      <Button
                        aria-label={`Edit session ${session.data.title}`}
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          openForm({ type: "session", id: session.id })
                        }
                      >
                        {t("edit")}
                        <ArrowRight />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState
              title="No sessions on these dates"
              description="Add a local service session when the health post confirms its date and location."
            />
          )}
        </div>
      </div>
      <div className="mt-5">
        <Note>
          Clinic sessions are service opportunities. Rescheduling a session does
          not change a child’s planned vaccine due date.
        </Note>
      </div>
    </>
  );
}
export function ReviewView({ openForm, navigate }: ViewProps) {
  const { records, profile, demo, pending, t, discardConflict, retryConflict } =
    useWorkspace();
  const stats = workspaceStats(records, profile, demo);
  const conflicts = pending.filter(
    (op) => op.status === "conflict" || op.status === "rejected",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const op = conflicts.find((item) => item.id === selected);
  const serverRecord = op
    ? records.find((r) => r.id === op.entityId)
    : undefined;
  return (
    <>
      <PageHeading title={t("review")} subtitle={t("reviewSubtitle")} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Care evidence to verify</CardTitle>
            <Badge>{stats.pendingEvents.length}</Badge>
          </CardHeader>
          {stats.pendingEvents.length ? (
            <CardContent className="space-y-3">
              {stats.pendingEvents.map((event) => {
                const person =
                  event.data.subjectType === "mother"
                    ? find(records, "mothers", event.data.subjectId)
                    : find(records, "children", event.data.subjectId);
                return (
                  <div
                    key={event.id}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-medium">
                        {person?.data.name ?? "Care record"}
                      </h3>
                      <StatusBadge status="reported" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {event.data.kind.replaceAll("_", " ")} ·{" "}
                      {event.data.doseCode?.toUpperCase() ?? "Care contact"}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDate(event.data.date)} ·{" "}
                      {event.data.source.replaceAll("_", " ")}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/${event.data.subjectType === "mother" ? "mothers" : "children"}/${event.data.subjectId}`,
                          )
                        }
                      >
                        Open record
                      </Button>
                      {canVerify(profile.role) && (
                        <Button
                          size="sm"
                          onClick={() =>
                            openForm({ type: "verify", id: event.id })
                          }
                        >
                          <ShieldCheck />
                          Review evidence
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          ) : (
            <EmptyState
              title="No pending evidence"
              description="Reported or transcribed care will appear here for health-worker verification."
            />
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Identity & record review</CardTitle>
            <Badge>{stats.needsReview.length}</Badge>
          </CardHeader>
          {stats.needsReview.length ? (
            <CardContent className="space-y-3">
              {stats.needsReview.map((review) => {
                const person =
                  review.data.subjectType === "mother"
                    ? find(records, "mothers", review.data.subjectId)
                    : find(records, "children", review.data.subjectId);
                return (
                  <div
                    key={review.id}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="mb-2 flex gap-2">
                      <CircleAlert className="mt-0.5 size-4 text-[#735f34]" />
                      <h3 className="text-sm font-medium">
                        {person?.data.name ?? "Record review"}
                      </h3>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {review.data.reason}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/${review.data.subjectType === "mother" ? "mothers" : "children"}/${review.data.subjectId}`,
                          )
                        }
                      >
                        Open record
                      </Button>
                      {canSupervise(profile.role) && (
                        <Button
                          size="sm"
                          onClick={() =>
                            openForm({ type: "review", id: review.id })
                          }
                        >
                          Resolve review
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          ) : (
            <EmptyState
              title="Records are ready"
              description="Duplicate candidates and uncertain birth dates will be flagged here."
            />
          )}
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Sync conflicts & rejected changes</CardTitle>
          <Badge>{conflicts.length}</Badge>
        </CardHeader>
        <CardContent>
          {conflicts.length ? (
            conflicts.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 last:border-0"
              >
                <div>
                  <p className="text-xs font-medium">
                    {item.entityType.replaceAll("_", " ")} · {item.action}
                  </p>
                  <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                    {item.error}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(item.id)}
                >
                  Review change
                </Button>
              </div>
            ))
          ) : (
            <p className="pb-2 text-xs text-muted-foreground">
              No unresolved sync changes. Original records and queued work are
              preserved when a conflict occurs.
            </p>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(op)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Review a queued change</DialogTitle>
          <DialogDescription>{op?.error}</DialogDescription>
          {op && serverRecord && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <h3 className="mb-2 text-xs font-semibold">
                  Shared / current record
                </h3>
                <pre className="max-h-64 overflow-auto rounded-lg bg-secondary p-3 text-[10px] whitespace-pre-wrap break-all">
                  {JSON.stringify(serverRecord.data, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold">
                  Your queued change
                </h3>
                <pre className="max-h-64 overflow-auto rounded-lg bg-secondary p-3 text-[10px] whitespace-pre-wrap break-all">
                  {JSON.stringify(op.data, null, 2)}
                </pre>
              </div>
            </div>
          )}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Use the shared version to discard this queued change. An authorized
            reviewer can reapply an editable change after comparing both
            versions. Care-event corrections must use the original form.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  if (op) await discardConflict(op.id);
                  setSelected(null);
                } catch (error) {
                  toast.error(String(error));
                }
              }}
            >
              Use shared version
            </Button>
            {serverRecord &&
              op?.action === "update" &&
              canVerify(profile.role) && (
                <Button
                  onClick={async () => {
                    try {
                      await retryConflict(op.id);
                      setSelected(null);
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Could not reapply the change.",
                      );
                    }
                  }}
                >
                  Reapply reviewed change
                </Button>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function ReportsView({ navigate }: ViewProps) {
  const { records, profile, demo, t, exportRecords } = useWorkspace();
  const stats = workspaceStats(records, profile, demo);
  const events = effectiveEvents(records).filter(
    (e) => e.data.kind === "vaccination",
  );
  const verified = events.filter(
    (e) => eventDecision(records, e) === "verified",
  );
  const resolved = stats.tasks.filter((task) => task.resolved).length;
  const unknown = stats.children.filter(
    (child) => child.data.dobSource !== "confirmed",
  ).length;
  return (
    <>
      <PageHeading title={t("reports")} subtitle={t("reportsSubtitle")}>
        {canVerify(profile.role) && (
          <Button
            variant="outline"
            onClick={() =>
              void exportRecords().catch((error) => toast.error(error.message))
            }
          >
            <ArrowDownToLine />
            {t("export")}
          </Button>
        )}
      </PageHeading>
      <div className="stat-grid">
        <StatCard
          label="Active registrations"
          value={stats.mothers.length + stats.children.length}
          detail={`${stats.mothers.length} mothers · ${stats.children.length} children`}
          icon={<Database />}
        />
        <StatCard
          label="Verified vaccination events"
          value={verified.length}
          detail={`${verified.length} of ${events.length} recorded events`}
          icon={<ShieldCheck />}
          tint="blue"
        />
        <StatCard
          label="Follow-ups resolved"
          value={resolved}
          detail={`${resolved} of ${stats.tasks.length} generated / recorded actions`}
          icon={<Check />}
          tint="peach"
        />
        <StatCard
          label="Birth dates to confirm"
          value={unknown}
          detail={`${unknown} of ${stats.children.length} active children`}
          icon={<CalendarDays />}
          tint="yellow"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where recorded vaccine evidence comes from</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              ["provider_administered", "Provider-administered"],
              ["card_transcription", "Card transcription"],
              ["caregiver_reported", "Caregiver reported"],
            ].map(([source, label]) => {
              const count = events.filter(
                (e) => e.data.source === source,
              ).length;
              return (
                <div key={source}>
                  <div className="mb-2 flex justify-between text-xs">
                    <span>{label}</span>
                    <span>
                      {count} / {events.length}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#edf2e8]">
                    <div
                      className={`h-full rounded-full ${source === "provider_administered" ? "bg-[#87aa7c]" : source === "card_transcription" ? "bg-[#cbb88b]" : "bg-[#c5a28c]"}`}
                      style={{
                        width: `${events.length ? (count / events.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="pt-2 text-[10px] leading-relaxed text-muted-foreground">
              Source is retained even after verification. Superseded events are
              excluded from these counts.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How to read this report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">Cohort:</strong> active
              registered mothers and children in your authorized catchment.
              These counts are not population coverage estimates.
            </p>
            <p>
              <strong className="text-foreground">Dose completion:</strong>{" "}
              verified unique doses due by the as-of date. Future doses are
              excluded. Unknown birth dates or unapproved schedules cannot
              produce a completion rate.
            </p>
            <p>
              <strong className="text-foreground">Follow-up resolution:</strong>{" "}
              an operational outcome, separate from verified care completion. An
              attempted contact is not completed care.
            </p>
            <p className="text-[10px]">
              Source: this workspace · {profile.facilityName} · as of{" "}
              {formatDate(today(), "en", { year: "numeric" })}
              {demo ? " · synthetic data" : ""}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-5 overflow-hidden">
        <CardHeader>
          <CardTitle>Child timeline reconciliation</CardTitle>
        </CardHeader>
        <table className="record-table">
          <thead>
            <tr>
              <th>Child reference</th>
              <th>Due doses</th>
              <th>Verified</th>
              <th>Completion</th>
            </tr>
          </thead>
          <tbody>
            {stats.children.map((child) => {
              const result = completion(
                timeline(records, child, today(), demo),
              );
              return (
                <tr key={child.id}>
                  <td>
                    <button
                      className="min-h-11 text-left text-primary"
                      onClick={() => navigate(`/children/${child.id}`)}
                    >
                      {child.data.reference}
                    </button>
                  </td>
                  <td>{result.due}</td>
                  <td>{result.verified}</td>
                  <td>
                    {result.percent === null
                      ? "Needs review / N/A"
                      : `${result.percent}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
export function SchedulesView({ openForm }: ViewProps) {
  const { records, profile, t, perform } = useWorkspace();
  const schedules = select(records, "schedules");
  const [expanded, setExpanded] = useState<string | null>(
    schedules[0]?.id ?? null,
  );
  async function act(
    schedule: Entity<"schedules">,
    action: "activate" | "approve_clinical",
  ) {
    try {
      await perform(schedule, action);
      toast.success(
        action === "activate"
          ? "Schedule activated."
          : "Clinical approval recorded.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Approval could not be recorded.",
      );
    }
  }
  return (
    <>
      <PageHeading title={t("schedules")} subtitle={t("schedulesSubtitle")}>
        {canManageSchedules(profile.role) && (
          <Button onClick={() => openForm({ type: "schedule" })}>
            <Plus />
            Create draft
          </Button>
        )}
      </PageHeading>
      <div className="space-y-5">
        {schedules.map((schedule) => (
          <Card key={schedule.id} className="overflow-hidden">
            <CardHeader>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{schedule.data.name}</CardTitle>
                  <StatusBadge status={schedule.data.status} />
                  {schedule.data.testOnly && (
                    <Badge className="badge-pending">Sample · demo only</Badge>
                  )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {schedule.data.authority}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {schedule.data.source}
                </p>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Effective{" "}
                  {formatDate(schedule.data.effectiveFrom, "en", {
                    year: "numeric",
                  })}
                  {schedule.data.effectiveTo
                    ? ` through ${formatDate(schedule.data.effectiveTo)}`
                    : " · no end date"}{" "}
                  · {schedule.data.doses.length} dose rules
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExpanded(expanded === schedule.id ? null : schedule.id)
                  }
                >
                  {expanded === schedule.id
                    ? "Hide dose rules"
                    : "View dose rules"}
                </Button>
                {profile.role === "clinical_approver" &&
                  schedule.data.status === "draft" && (
                    <Button
                      size="sm"
                      onClick={() => void act(schedule, "approve_clinical")}
                    >
                      Record clinical approval
                    </Button>
                  )}
                {profile.role === "municipality_admin" &&
                  schedule.data.status === "clinical_approved" && (
                    <Button
                      size="sm"
                      onClick={() => void act(schedule, "activate")}
                    >
                      Activate approved version
                    </Button>
                  )}
              </div>
              {schedule.data.status !== "draft" && (
                <p className="mt-3 text-[10px] text-muted-foreground">
                  Approved content is immutable. Changes require a new version
                  and separate approvals.
                </p>
              )}
            </CardContent>
            {expanded === schedule.id && (
              <table className="record-table">
                <thead>
                  <tr>
                    <th>Dose</th>
                    <th>Age rule</th>
                    <th className="hide-mobile">Dose identifier</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.data.doses.map((rule) => (
                    <tr key={rule.code}>
                      <td>{rule.name}</td>
                      <td>
                        {rule.age === 0
                          ? "At birth"
                          : `${rule.age} ${rule.unit}`}
                      </td>
                      <td className="hide-mobile font-mono text-[10px] text-muted-foreground">
                        {rule.code}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))}
        {!schedules.length && (
          <EmptyState
            title="No approved schedules"
            description="A designated administrator must create a version for independent clinical and programme approval."
          />
        )}
      </div>
      <div className="mt-5">
        <Note>
          Schedule approval must be backed by the authorized source. Demo
          fixtures cannot be activated in a connected workspace, and new
          versions never silently rewrite old child timelines.
        </Note>
      </div>
    </>
  );
}
export function SettingsView({ navigate }: ViewProps) {
  const {
    profile,
    language,
    setLanguage,
    demo,
    online,
    lastSync,
    pending,
    pendingAudit,
    sync,
    syncing,
    t,
    resetDemo,
    switchRole,
    signOut,
    audit,
    error,
  } = useWorkspace();
  const [resetOpen, setResetOpen] = useState(false);
  return (
    <>
      <PageHeading title={t("settings")} subtitle={t("settingsSubtitle")} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Language & workspace</CardTitle>
            <Globe2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <label
              className="mb-2 block text-xs font-medium"
              htmlFor="workspace-language"
            >
              Interface language
            </label>
            <Select
              id="workspace-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
            >
              <option value="en">English</option>
              <option value="ne">नेपाली</option>
              <option value="bho">भोजपुरी</option>
            </Select>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              {t("languageReview")}
            </p>
            <dl className="mt-4">
              <div className="detail-item">
                <dt>{t("facility")}</dt>
                <dd>{profile.facilityName}</dd>
              </div>
              <div className="detail-item">
                <dt>Assigned wards</dt>
                <dd>{profile.wardIds.join(", ")}</dd>
              </div>
              <div className="detail-item">
                <dt>Signed in as</dt>
                <dd>
                  {profile.name} · {roleLabels[profile.role]}
                </dd>
              </div>
            </dl>
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() =>
                void signOut().catch((error) => toast.error(error.message))
              }
            >
              {t("signOut")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Device & synchronization</CardTitle>
            {online ? (
              <Wifi className="size-4 text-[#53674b]" />
            ) : (
              <WifiOff className="size-4 text-amber-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg bg-secondary p-4">
              <div>
                <p className="text-sm font-medium">
                  {online
                    ? demo
                      ? t("savedLocally")
                      : t("synced")
                    : t("offline")}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {pending.length} queued changes · {pendingAudit} queued access
                  events
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("sync")}
                disabled={!online || syncing}
                onClick={() => void sync()}
              >
                <RefreshCw className={syncing ? "animate-spin" : ""} />
              </Button>
            </div>
            <dl className="mt-4">
              <div className="detail-item">
                <dt>{t("lastSync")}</dt>
                <dd>
                  {lastSync ? new Date(lastSync).toLocaleString() : t("never")}
                  {demo ? " (local demo acknowledgement)" : ""}
                </dd>
              </div>
              <div className="detail-item">
                <dt>Pending conflicts</dt>
                <dd>
                  {
                    pending.filter(
                      (op) =>
                        op.status === "conflict" || op.status === "rejected",
                    ).length
                  }
                </dd>
              </div>
            </dl>
            {error && <p className="mt-3 text-xs text-amber-800">{error}</p>}
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Sync before clearing browser data, uninstalling, or changing
              devices. Browser storage is not a backup and is not automatically
              encrypted.
            </p>
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={() => navigate("/review")}
            >
              Review pending changes
              <ArrowRight />
            </Button>
          </CardContent>
        </Card>
        {demo && (
          <Card className="border-[#e1e8d6] bg-[#f2f5eb]">
            <CardHeader>
              <CardTitle>Practice workspace</CardTitle>
              <RotateCcw className="size-4 text-[#58674c]" />
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("demoNotice")}
              </p>
              <label
                htmlFor="demo-role"
                className="mb-2 mt-5 block text-xs font-medium"
              >
                Explore a staff role
              </label>
              <Select
                id="demo-role"
                value={profile.role}
                onChange={(e) => void switchRole(e.target.value as Role)}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Role switching is available only in the local synthetic demo.
              </p>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => setResetOpen(true)}
              >
                <RotateCcw />
                Reset practice data
              </Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Recent audit activity</CardTitle>
            <ShieldCheck className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {audit.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="border-b border-border py-2.5 last:border-0"
              >
                <p className="text-xs">
                  {item.action.replaceAll("_", " ")} ·{" "}
                  {item.entityType.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {item.actor} · {new Date(item.at).toLocaleString()}
                </p>
              </div>
            ))}
            {!audit.length && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Changes, verification, and exports will appear here. Audit
                records contain action metadata rather than clinical notes.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogTitle>Reset the practice workspace?</DialogTitle>
          <DialogDescription>
            This removes this device’s demo changes and restores the original
            synthetic records. No connected Supabase data is affected.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={async () => {
                await resetDemo();
                setResetOpen(false);
              }}
            >
              Reset practice data
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
