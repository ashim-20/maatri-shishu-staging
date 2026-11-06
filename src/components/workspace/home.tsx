"use client";
import {
  ArrowRight,
  Baby,
  CalendarDays,
  Check,
  Clock3,
  Heart,
  MapPin,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useWorkspace } from "./provider";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Note,
  PageHeading,
  RegistrationActions,
  StatCard,
  TaskTable,
  type ViewProps,
} from "./shared";
import { workspaceStats } from "@/lib/domain/worklist";
import { effectiveEvents, eventDecision } from "@/lib/domain/schedule";
import { find, select } from "@/lib/domain/types";
import { formatDate, today } from "@/lib/domain/dates";

export function HomeView({ navigate, openForm }: ViewProps) {
  const { records, profile, demo, t, language } = useWorkspace();
  const stats = workspaceStats(records, profile, demo);
  const families = new Set(stats.due.map((task) => task.person.id));
  const visible = stats.tasks
    .filter((task) => !task.resolved)
    .filter(
      (task, i, all) =>
        all.findIndex((other) => other.person.id === task.person.id) === i,
    )
    .slice(0, 5);
  const sessions = select(records, "sessions")
    .filter((s) => s.data.status !== "cancelled" && s.data.date >= today())
    .sort((a, b) => a.data.date.localeCompare(b.data.date));
  const nextSession = sessions[0];
  const recent = effectiveEvents(records)
    .sort((a, b) => b.data.date.localeCompare(a.data.date))
    .slice(0, 4);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kathmandu",
    }).format(new Date()),
  );
  return (
    <>
      <PageHeading
        title={`${t(hour < 12 ? "greeting" : hour < 17 ? "greetingAfternoon" : "greetingEvening")}, ${profile.name.split(" ")[0]}`}
        subtitle={t("homeSubtitle")}
      >
        <RegistrationActions openForm={openForm} />
      </PageHeading>
      <div className="stat-grid">
        <StatCard
          label={t("activeMothers")}
          value={stats.mothers.length}
          detail={`${stats.mothers.filter((m) => m.data.status === "pregnant").length} pregnant · ${stats.mothers.filter((m) => m.data.status === "postnatal").length} postnatal`}
          icon={<Heart />}
          tint="peach"
        />
        <StatCard
          label={t("activeChildren")}
          value={stats.children.length}
          detail="Individual records, connected care"
          icon={<Baby />}
        />
        <StatCard
          label={t("followupsDue")}
          value={families.size}
          detail={`${stats.due.length} care actions to check`}
          icon={<CalendarDays />}
          tint="yellow"
        />
        <StatCard
          label={t("verificationPending")}
          value={stats.reviewCount}
          detail="A little clarity makes a difference"
          icon={<ShieldCheck />}
          tint="blue"
        />
      </div>
      <div className="dashboard-grid">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <CardHeader className="items-center px-5 py-5">
              <div>
                <CardTitle>{t("followupTitle")}</CardTitle>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {t("followupSubtitle")}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 gap-1.5 text-[11px] text-primary"
                onClick={() => navigate("/follow-ups")}
              >
                {t("viewAll")}
                <ArrowRight className="!size-3.5" />
              </Button>
            </CardHeader>
            <TaskTable
              items={visible}
              navigate={navigate}
              openForm={openForm}
              compact
            />
            <div className="flex items-center justify-between border-t border-border bg-[#fdfefb] px-5 py-3 text-[10px] text-muted-foreground">
              <span>
                Showing {visible.length} families in your assigned area
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#9fba91]" />
                {t("ward")} {profile.wardIds.join(" & ")}
              </span>
            </div>
          </Card>
          <Note />
          <Card>
            <CardHeader className="items-center">
              <CardTitle>{t("recentActivity")}</CardTitle>
              <span className="section-eyebrow">Care, recorded</span>
            </CardHeader>
            <CardContent className="pb-2">
              {recent.map((event) => {
                const person =
                  event.data.subjectType === "mother"
                    ? find(records, "mothers", event.data.subjectId)
                    : find(records, "children", event.data.subjectId);
                const verified = eventDecision(records, event) === "verified";
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 border-b border-[#edf0e9] py-3.5 last:border-0"
                  >
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full ${verified ? "bg-[#eff5eb] text-[#526547]" : "bg-amber-50 text-amber-600"}`}
                    >
                      {verified ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Clock3 className="size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        className="min-h-6 text-left text-xs font-medium"
                        onClick={() =>
                          navigate(
                            `/${event.data.subjectType === "mother" ? "mothers" : "children"}/${event.data.subjectId}`,
                          )
                        }
                      >
                        {person?.data.name ?? "Care record"}
                      </button>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {event.data.kind === "vaccination"
                          ? event.data.doseCode?.toUpperCase()
                          : event.data.kind === "anc"
                            ? "ANC contact"
                            : event.data.kind.replaceAll("_", " ")}{" "}
                        ·{" "}
                        {verified
                          ? "provider verified"
                          : "verification pending"}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(event.data.date, language)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
        <aside className="dashboard-aside space-y-5 max-[980px]:space-y-0">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>{t("nextClinic")}</CardTitle>
              <CalendarDays className="size-4 text-[#586354]" />
            </CardHeader>
            <CardContent>
              {nextSession ? (
                <>
                  <div className="mb-5 flex items-center gap-3.5 rounded-lg bg-[#f2f5ed] p-3.5">
                    <div className="flex min-w-12 flex-col items-center border-r border-[#dfe7d7] pr-3.5">
                      <span className="text-[10px] uppercase tracking-wide text-[#5b6553]">
                        {formatDate(nextSession.data.date, language, {
                          day: undefined,
                          month: "short",
                        })}
                      </span>
                      <span className="text-[26px] font-semibold leading-tight text-[#526845]">
                        {Number(nextSession.data.date.slice(-2))}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-relaxed">
                        {nextSession.data.title}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatDate(nextSession.data.date, language, {
                          weekday: "long",
                          day: undefined,
                          month: undefined,
                        })}{" "}
                        · {nextSession.data.startTime}
                      </p>
                    </div>
                  </div>
                  <div className="mb-3 flex items-start gap-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#5c6355]" />
                    {nextSession.data.location}
                  </div>
                  <div className="mb-5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
                    <UsersRound className="size-3.5 shrink-0 text-[#5c6355]" />
                    {t("ward")} {nextSession.wardId} catchment
                  </div>
                  <Button
                    variant="outline"
                    className="h-10 w-full text-[11px]"
                    onClick={() => navigate("/calendar")}
                  >
                    View clinic calendar
                    <ArrowRight className="!size-3.5" />
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No upcoming sessions. Add a confirmed local session to help
                  your care team plan.
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-[#e1e8d9] bg-[#eff3e8]">
            <CardContent className="pt-5">
              <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-[#e1e9d6] text-[#556646]">
                <ShieldCheck className="size-[18px] stroke-[1.6]" />
              </div>
              <h2 className="text-[14px] font-semibold text-[#506746]">
                Trust starts with a clear record.
              </h2>
              <p className="mt-2 text-[11px] leading-[1.9] text-[#5b6652]">
                Reported care is a helpful starting point. A health worker
                verifies it before it counts as completed.
              </p>
              <button
                className="mt-3 flex min-h-11 items-center gap-2 text-[11px] font-semibold text-[#4f6842]"
                onClick={() => navigate("/review")}
              >
                {t("reviewNow")}
                <ArrowRight className="size-3.5" />
              </button>
            </CardContent>
          </Card>
          <div className="flex items-start gap-2.5 px-1 py-2 text-[10px] leading-relaxed text-[#5b6657]">
            <Sparkles className="mt-0.5 size-4 shrink-0 stroke-[1.5]" />
            <p>
              Small moments of care.
              <br />
              Stronger families, together.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
