"use client";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  CalendarPlus,
  Check,
  FileClock,
  Heart,
  Pencil,
  Plus,
  Printer,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Input, Select } from "@/components/ui/input";
import { useWorkspace } from "./provider";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Note,
  PageHeading,
  PersonCell,
  StatusBadge,
  type ViewProps,
} from "./shared";
import { canVerify, find, select, currentConsent } from "@/lib/domain/types";
import { ageLabel, formatDate, today } from "@/lib/domain/dates";
import {
  completion,
  effectiveEvents,
  eventDecision,
  timeline,
} from "@/lib/domain/schedule";
import { initials } from "@/lib/utils";

export function RecordsView({
  kind,
  navigate,
  openForm,
}: ViewProps & { kind: "mothers" | "children" }) {
  const { records, t, demo, language } = useWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(20);
  const people =
    kind === "mothers"
      ? select(records, "mothers")
      : select(records, "children");
  const filtered = people.filter(
    (person) =>
      `${person.data.name} ${person.data.reference} ${person.data.settlement}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "all" || person.data.status === status),
  );
  return (
    <>
      <PageHeading
        title={t(kind)}
        subtitle={t(
          kind === "mothers" ? "mothersSubtitle" : "childrenSubtitle",
        )}
      >
        <Button
          onClick={() =>
            openForm({ type: kind === "mothers" ? "mother" : "child" })
          }
        >
          <Plus />
          {t(kind === "mothers" ? "registerMother" : "addChild")}
        </Button>
      </PageHeading>
      <Card className="overflow-hidden">
        <div className="filter-bar">
          <Input
            aria-label={`Search ${kind}`}
            placeholder={t("searchShort")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(20);
            }}
          />
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setLimit(20);
            }}
          >
            <option value="all">{t("allStatuses")}</option>
            {kind === "mothers" ? (
              <>
                <option value="pregnant">{t("pregnant")}</option>
                <option value="postnatal">{t("postnatal")}</option>
                <option value="inactive">{t("inactive")}</option>
              </>
            ) : (
              <>
                <option value="active">Active</option>
                <option value="deceased">Inactive record</option>
              </>
            )}
            <option value="moved">Moved</option>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} {t("record")}
            {filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        {filtered.length ? (
          <>
            <table className="record-table">
              <thead>
                <tr>
                  <th scope="col">
                    {kind === "mothers" ? t("mother") : t("child")}
                  </th>
                  <th scope="col" className="hide-mobile">
                    {t("settlement")}
                  </th>
                  <th scope="col" className="hide-mobile">
                    {kind === "mothers" ? "Care summary" : "Due doses verified"}
                  </th>
                  <th scope="col">{t("status")}</th>
                  <th scope="col">
                    <span className="sr-only">Open record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((person) => {
                  const progress =
                    person.type === "children"
                      ? completion(timeline(records, person, today(), demo))
                      : null;
                  const contacts = effectiveEvents(records, person.id).filter(
                    (e) =>
                      e.data.kind === "anc" &&
                      eventDecision(records, e) === "verified",
                  ).length;
                  return (
                    <tr key={person.id}>
                      <td>
                        <PersonCell
                          person={person}
                          navigate={navigate}
                          hint={person.data.reference}
                        />
                      </td>
                      <td className="hide-mobile">
                        <p>{person.data.settlement}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {t("ward")} {person.wardId}
                        </p>
                      </td>
                      <td className="hide-mobile">
                        {progress ? (
                          <>
                            <span className="font-medium">
                              {progress.verified} / {progress.due}
                            </span>
                            <span className="ml-1 text-muted-foreground">
                              due doses
                            </span>
                            <div className="mt-2 h-1 w-20 overflow-hidden rounded-full bg-[#edf1e9]">
                              <div
                                className="h-full rounded-full bg-[#93b58b]"
                                style={{ width: `${progress.percent ?? 0}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <p>{contacts} verified ANC contacts</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {person.type === "mothers" &&
                                (person.data.phone || t("noPhone"))}
                            </p>
                          </>
                        )}
                      </td>
                      <td>
                        <StatusBadge
                          status={
                            person.type === "children" &&
                            person.data.dobSource !== "confirmed"
                              ? "review"
                              : person.data.status
                          }
                        />
                        {person.type === "children" && (
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            {person.data.dobSource === "confirmed"
                              ? ageLabel(person.data.dob)
                              : "Date to confirm"}
                          </p>
                        )}
                      </td>
                      <td className="w-12">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${person.data.name}`}
                          onClick={() => navigate(`/${kind}/${person.id}`)}
                        >
                          <ArrowRight />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <span className="text-[10px] text-muted-foreground">
                Showing {Math.min(limit, filtered.length)} of {filtered.length}{" "}
                · {formatDate(today(), language, { year: "numeric" })}
              </span>
              {limit < filtered.length && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLimit(limit + 20)}
                >
                  Show more
                </Button>
              )}
            </div>
          </>
        ) : (
          <EmptyState title={t("noRecords")} description={t("noRecordsHint")} />
        )}
      </Card>
      <div className="mt-5">
        <Note />
      </div>
    </>
  );
}
function CareHistory({
  subjectId,
  openForm,
}: {
  subjectId: string;
  openForm: ViewProps["openForm"];
}) {
  const { records, profile, t, language } = useWorkspace();
  const [showHistory, setShowHistory] = useState(false);
  const all = select(records, "care_events")
    .filter((e) => e.data.subjectId === subjectId)
    .sort(
      (a, b) =>
        b.data.date.localeCompare(a.data.date) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const currentIds = new Set(
    effectiveEvents(records, subjectId).map((e) => e.id),
  );
  const visible = showHistory
    ? all
    : all.filter((e) => currentIds.has(e.id)).slice(0, 8);
  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle>{t("history")}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="no-print text-[10px]"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? "Show current events" : "Show full history"}
        </Button>
      </CardHeader>
      {!visible.length ? (
        <EmptyState
          title="No care events yet"
          description="Record a provider contact or clearly sourced history when available."
        />
      ) : (
        <div>
          {visible.map((event) => (
            <div key={event.id} className="timeline-row flex-wrap">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[#58674f]">
                <FileClock className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">
                  {event.data.kind === "anc"
                    ? "ANC contact"
                    : event.data.kind === "td"
                      ? `Maternal Td · ${event.data.doseCode ?? "documented dose"}`
                      : event.data.kind === "vaccination"
                        ? event.data.doseCode?.toUpperCase()
                        : event.data.kind === "pnc_mother"
                          ? "Mother PNC"
                          : "Newborn PNC"}
                  {!currentIds.has(event.id) && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      · superseded
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {formatDate(event.data.date, language, { year: "numeric" })} ·{" "}
                  {event.data.source.replaceAll("_", " ")}
                  {event.data.timing ? ` · ${event.data.timing}` : ""}
                </p>
                {event.data.note && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {event.data.note}
                  </p>
                )}
              </div>
              <StatusBadge status={eventDecision(records, event)} />
              {canVerify(profile.role) && currentIds.has(event.id) && (
                <div className="no-print flex">
                  {eventDecision(records, event) === "pending" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Verify event ${event.id}`}
                      onClick={() => openForm({ type: "verify", id: event.id })}
                    >
                      <ShieldCheck />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Correct event ${event.id}`}
                    onClick={() =>
                      openForm({
                        type: "care",
                        subjectId,
                        subjectType: event.data.subjectType,
                        eventId: event.id,
                      })
                    }
                  >
                    <Pencil />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
export function DetailView({
  kind,
  id,
  navigate,
  openForm,
}: ViewProps & { kind: "mothers" | "children"; id: string }) {
  const { records, profile, t, demo, language, recordAccess } = useWorkspace();
  const person =
    kind === "mothers"
      ? find(records, "mothers", id)
      : find(records, "children", id);
  const [tab, setTab] = useState("all");
  const available = Boolean(person);
  useEffect(() => {
    if (available)
      void recordAccess("read", kind, id).catch((error) =>
        toast.error(error.message),
      );
  }, [id, kind, available, recordAccess]);
  if (!person)
    return (
      <EmptyState
        title="Record not available"
        description="This record may be outside your assignment or not yet downloaded."
      >
        <Button variant="outline" onClick={() => navigate(`/${kind}`)}>
          Return to records
        </Button>
      </EmptyState>
    );
  const isMother = person.type === "mothers";
  const pregnancies = select(records, "pregnancies")
    .filter((p) => p.data.motherId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latestPregnancy =
    pregnancies.find((p) => p.data.status === "active") ?? pregnancies[0];
  const events = effectiveEvents(records, id);
  const anc = events.filter(
    (e) =>
      e.data.kind === "anc" &&
      e.data.pregnancyId === latestPregnancy?.id &&
      eventDecision(records, e) === "verified",
  );
  const pnc = events.filter(
    (e) =>
      e.data.kind === (isMother ? "pnc_mother" : "pnc_child") &&
      eventDecision(records, e) === "verified",
  );
  const td = events.filter(
    (e) => e.data.kind === "td" && eventDecision(records, e) === "verified",
  );
  const childDoses =
    person.type === "children" ? timeline(records, person, today(), demo) : [];
  const coverage = completion(childDoses);
  const schedule =
    person.type === "children"
      ? find(records, "schedules", person.data.scheduleId)
      : undefined;
  const birth =
    person.type === "children"
      ? find(records, "births", person.data.birthId)
      : undefined;
  const appointments = select(records, "appointments")
    .filter((a) => a.data.subjectId === id)
    .sort((a, b) => a.data.date.localeCompare(b.data.date));
  const linkedChildren = select(records, "children").filter(
    (c) => c.data.motherId === id,
  );
  const consentHistory = select(records, "consents")
    .filter((c) => c.data.subjectId === id)
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
  const consent = currentConsent(records, person);
  async function print() {
    if (!canVerify(profile.role)) {
      toast.error("An authorized health worker must produce a record summary.");
      return;
    }
    try {
      await recordAccess("print", kind, id);
      window.print();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Printing is unavailable.",
      );
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        className="no-print mb-4 -ml-3 text-xs"
        onClick={() => navigate(`/${kind}`)}
      >
        <ArrowLeft />
        {t("back")} to {t(kind).toLowerCase()}
      </Button>
      <PageHeading
        title={person.data.name}
        subtitle={`${person.data.reference} · ${person.data.settlement} · ${t("ward")} ${person.wardId}`}
      >
        <Button
          variant="outline"
          className="no-print"
          onClick={() => openForm({ type: isMother ? "mother" : "child", id })}
        >
          <Pencil />
          {t("edit")}
        </Button>
        <Button
          variant="outline"
          className="no-print"
          onClick={() => void print()}
        >
          <Printer />
          {t("print")}
        </Button>
        {(canVerify(profile.role) || !isMother) && (
          <Button
            className="no-print"
            onClick={() =>
              openForm({
                type: "care",
                subjectId: id,
                subjectType: isMother ? "mother" : "child",
              })
            }
          >
            <Plus />
            {t("recordCare")}
          </Button>
        )}
      </PageHeading>
      <div className="detail-grid">
        <div className="min-w-0 space-y-5">
          {isMother ? (
            <>
              <Card>
                <CardHeader className="items-center">
                  <div className="flex items-center gap-2">
                    <Heart className="size-4 text-[#755b4b]" />
                    <CardTitle>Pregnancy care</CardTitle>
                  </div>
                  <Button
                    className="no-print text-[10px]"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      openForm({ type: "pregnancy", motherId: id })
                    }
                  >
                    <Plus />
                    {t("addPregnancy")}
                  </Button>
                </CardHeader>
                <CardContent>
                  {latestPregnancy ? (
                    <>
                      <div className="mb-5 grid grid-cols-2 gap-5">
                        <div>
                          <p className="text-[10px] text-muted-foreground">
                            Recorded expected delivery date
                          </p>
                          <p className="mt-1 text-base font-medium">
                            {formatDate(latestPregnancy.data.edd, language, {
                              year: "numeric",
                            })}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Source: {latestPregnancy.data.dateSource}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">
                            Verified ANC contacts · this episode
                          </p>
                          <p className="mt-1 text-base font-medium">
                            {anc.length}{" "}
                            {demo && (
                              <span className="text-sm font-normal text-muted-foreground">
                                / 8 sample target
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      {demo && (
                        <div
                          className="flex gap-1.5"
                          aria-label={`${anc.length} verified ANC contacts out of target 8`}
                        >
                          {Array.from({ length: 8 }, (_, i) => (
                            <div
                              key={i}
                              className={`h-2 flex-1 rounded-full ${i < anc.length ? "bg-[#92b38c]" : "bg-[#edf1e8]"}`}
                            />
                          ))}
                        </div>
                      )}
                      <p className="mt-3 text-[10px] text-muted-foreground">
                        {pregnancies.length} recorded episode
                        {pregnancies.length === 1 ? "" : "s"} · Follow-up dates
                        are set by your provider.
                      </p>
                    </>
                  ) : (
                    <div className="py-3 text-sm text-muted-foreground">
                      Add a pregnancy episode to begin recording ANC and
                      maternal Td care.
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-xs text-muted-foreground">
                      Mother PNC contacts
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{pnc.length}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Recorded separately from newborn care
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-xs text-muted-foreground">
                      Verified maternal Td events
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{td.length}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {td.length
                        ? "Provider-recorded history"
                        : "Previous history: review with health worker"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>{t("timeline")}</CardTitle>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    {schedule
                      ? `${schedule.data.name}${schedule.data.testOnly ? " · demonstration only" : ""}`
                      : "No approved schedule assigned"}
                  </p>
                </div>
                <Baby className="size-5 text-[#56664f]" />
              </CardHeader>
              {childDoses.length ? (
                <>
                  <div className="mx-5 mb-4 rounded-lg bg-[#f1f5ec] p-4">
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        {coverage.verified} / {coverage.due} due doses verified
                      </span>
                      <span className="font-semibold">
                        {coverage.percent === null
                          ? "N/A"
                          : `${coverage.percent}%`}
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-[#dfe8d9]">
                      <div
                        className="h-full rounded-full bg-[#8aab7e]"
                        style={{ width: `${coverage.percent ?? 0}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Future doses excluded · as of{" "}
                      {formatDate(today(), language)}
                    </p>
                  </div>
                  <div className="no-print flex gap-1 border-y border-border px-4 py-2">
                    {["all", "attention", "verified"].map((key) => (
                      <Button
                        key={key}
                        variant={tab === key ? "secondary" : "ghost"}
                        size="sm"
                        aria-pressed={tab === key}
                        onClick={() => setTab(key)}
                      >
                        {key === "all"
                          ? "All doses"
                          : key === "attention"
                            ? "Needs attention"
                            : "Verified"}
                      </Button>
                    ))}
                  </div>
                  {childDoses
                    .filter(
                      (dose) =>
                        tab === "all" ||
                        (tab === "verified"
                          ? dose.status === "verified"
                          : !["verified", "upcoming"].includes(dose.status)),
                    )
                    .map((dose) => (
                      <div key={dose.code} className="timeline-row">
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full ${dose.status === "verified" ? "bg-[#eaf3e4] text-[#556749]" : "border border-[#e3e8dc] text-[#5e645b]"}`}
                        >
                          {dose.status === "verified" ? (
                            <Check className="size-3.5" />
                          ) : (
                            <span className="size-1.5 rounded-full bg-current" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{dose.name}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Planned due date ·{" "}
                            {formatDate(dose.dueDate, language, {
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <StatusBadge status={dose.status} />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="no-print"
                          aria-label={`Record ${dose.name}`}
                          onClick={() =>
                            openForm({
                              type: "care",
                              subjectId: id,
                              subjectType: "child",
                              doseCode: dose.code,
                            })
                          }
                        >
                          <Plus />
                        </Button>
                      </div>
                    ))}
                </>
              ) : (
                <EmptyState
                  title="Health-worker review needed"
                  description="A confirmed birth date and an approved schedule are needed to calculate planned dates."
                >
                  <Button
                    variant="outline"
                    onClick={() => openForm({ type: "child", id })}
                  >
                    Review birth details
                  </Button>
                </EmptyState>
              )}
            </Card>
          )}
          <CareHistory subjectId={id} openForm={openForm} />
          <Card>
            <CardHeader className="items-center">
              <CardTitle>{t("appointments")}</CardTitle>
              {canVerify(profile.role) && (
                <Button
                  className="no-print text-[10px]"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    openForm({
                      type: "appointment",
                      subjectId: id,
                      subjectType: isMother ? "mother" : "child",
                    })
                  }
                >
                  <CalendarPlus />
                  {t("addAppointment")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {appointments.length ? (
                appointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="flex items-center justify-between border-b border-border py-3 last:border-0"
                  >
                    <span className="text-xs">
                      {appointment.data.type.toUpperCase()} ·{" "}
                      {appointment.data.note ||
                        "Provider-confirmed appointment"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(appointment.data.date, language, {
                        year: "numeric",
                      })}
                    </span>
                  </div>
                ))
              ) : (
                <p className="pb-2 text-xs text-muted-foreground">
                  No provider-confirmed appointments recorded.
                </p>
              )}
            </CardContent>
          </Card>
          <Note />
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
              <UserRound className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="mb-5 flex items-center gap-3">
                <span
                  className={`avatar ${!isMother ? "child" : ""} !size-12 !text-base`}
                >
                  {initials(person.data.name)}
                </span>
                <div>
                  <StatusBadge status={person.data.status} />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {isMother ? "Mother record" : "Child record"}
                  </p>
                </div>
              </div>
              <dl>
                <div className="detail-item">
                  <dt>{t("settlement")}</dt>
                  <dd>
                    {person.data.settlement} · {t("ward")} {person.wardId}
                  </dd>
                </div>
                {person.type === "mothers" ? (
                  <>
                    <div className="detail-item">
                      <dt>{t("age")}</dt>
                      <dd>{person.data.age ?? "Not recorded"}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>{t("phone")}</dt>
                      <dd>{person.data.phone || t("noPhone")}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>{t("language")}</dt>
                      <dd>
                        {
                          { en: "English", ne: "नेपाली", bho: "भोजपुरी" }[
                            person.data.language
                          ]
                        }
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="detail-item">
                      <dt>{t("dob")}</dt>
                      <dd>
                        {formatDate(person.data.dob, language, {
                          year: "numeric",
                        })}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {person.data.dobSource}
                        </p>
                      </dd>
                    </div>
                    <div className="detail-item">
                      <dt>Mother / caregiver</dt>
                      <dd>
                        {person.data.motherId ? (
                          <button
                            className="min-h-11 text-left text-primary"
                            onClick={() =>
                              navigate(`/mothers/${person.data.motherId}`)
                            }
                          >
                            {find(records, "mothers", person.data.motherId)
                              ?.data.name ?? "Linked mother"}
                            <ArrowRight className="ml-2 inline size-3" />
                          </button>
                        ) : (
                          person.data.consent.guardian || t("noMother")
                        )}
                      </dd>
                    </div>
                    <div className="detail-item">
                      <dt>Birth record</dt>
                      <dd>
                        {birth ? (
                          <>
                            {birth.data.place || "Place not recorded"}
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {birth.data.source} ·{" "}
                              {formatDate(birth.data.date, language)}
                              {birth.data.time ? ` · ${birth.data.time}` : ""}
                            </p>
                          </>
                        ) : (
                          "No birth event linked"
                        )}
                      </dd>
                    </div>
                    {person.data.correctionReason && (
                      <div className="detail-item">
                        <dt>Latest correction reason</dt>
                        <dd>{person.data.correctionReason}</dd>
                      </div>
                    )}
                    <div className="detail-item">
                      <dt>Newborn PNC contacts</dt>
                      <dd>{pnc.length} verified · separate newborn record</dd>
                    </div>
                  </>
                )}
                <div className="detail-item">
                  <dt>Digital record consent</dt>
                  <dd>
                    <span className="capitalize">{consent.status}</span>
                    {consentHistory.length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="flex min-h-11 cursor-pointer items-center text-primary">
                          Consent history ({consentHistory.length})
                        </summary>
                        {consentHistory.map((event) => (
                          <p key={event.id} className="mb-2 leading-relaxed">
                            {formatDate(event.createdAt, language)} ·{" "}
                            {event.data.consent.status} · {event.data.reason}
                          </p>
                        ))}
                      </details>
                    )}
                  </dd>
                </div>
                <div className="detail-item">
                  <dt>Last updated</dt>
                  <dd>
                    {formatDate(person.updatedAt, language, {
                      year: "numeric",
                    })}
                  </dd>
                </div>
              </dl>
              <Button
                variant="ghost"
                size="sm"
                className="no-print mt-3 w-full text-[10px]"
                onClick={() =>
                  openForm({
                    type: "consent",
                    subjectId: id,
                    subjectType: isMother ? "mother" : "child",
                  })
                }
              >
                Record a consent change
              </Button>
            </CardContent>
          </Card>
          {isMother && (
            <Card>
              <CardHeader className="items-center">
                <CardTitle>Linked children</CardTitle>
                <Button
                  className="no-print"
                  variant="ghost"
                  size="icon"
                  aria-label="Register linked child"
                  onClick={() => openForm({ type: "child", motherId: id })}
                >
                  <Plus />
                </Button>
              </CardHeader>
              <CardContent>
                {linkedChildren.length ? (
                  linkedChildren.map((child) => (
                    <div
                      className="border-b border-border py-2 last:border-0"
                      key={child.id}
                    >
                      <PersonCell
                        person={child}
                        navigate={navigate}
                        hint={
                          child.data.dobSource === "confirmed"
                            ? ageLabel(child.data.dob)
                            : "Birth date to confirm"
                        }
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No child records linked yet.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
      <div className="print-only hidden mt-6 border-t pt-4 text-xs">
        <strong>{t("printDisclaimer")}</strong>
        <p className="mt-2">
          Generated{" "}
          {new Date().toLocaleString("en-GB", { timeZone: "Asia/Kathmandu" })} ·{" "}
          {profile.facilityName}
          {demo ? " · Synthetic demonstration" : ""}
        </p>
      </div>
    </>
  );
}
