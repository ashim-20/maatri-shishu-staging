"use client";
import {
  ArrowDownToLine,
  ArrowRight,
  Baby,
  CalendarDays,
  Check,
  CircleHelp,
  ClipboardCheck,
  Heart,
  Info,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "./provider";
import type { FormState } from "./forms";
import { cn, initials } from "@/lib/utils";
import { formatDate, today } from "@/lib/domain/dates";
import type { Entity } from "@/lib/domain/types";
import type { WorkItem } from "@/lib/domain/worklist";

export interface ViewProps {
  navigate: (path: string) => void;
  openForm: (form: FormState) => void;
}
export function PageHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && (
        <div className="heading-actions flex shrink-0 gap-2">{children}</div>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary">
        <Search className="size-5 opacity-50" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const { t } = useWorkspace();
  const config: Record<
    string,
    { label: string; className: string; icon?: boolean }
  > = {
    verified: { label: t("verified"), className: "badge-verified", icon: true },
    pregnant: { label: t("pregnant"), className: "badge-pending" },
    postnatal: { label: t("postnatal"), className: "badge-blue" },
    active: { label: "Active", className: "badge-verified" },
    upcoming: { label: t("upcoming"), className: "badge-neutral" },
    due: { label: t("due"), className: "badge-pending" },
    date_passed: { label: t("date_passed"), className: "badge-overdue" },
    reported: { label: t("reported"), className: "badge-pending" },
    pending: { label: t("reported"), className: "badge-pending" },
    review: { label: t("needsReview"), className: "badge-pending" },
    rejected: { label: t("rejected"), className: "badge-overdue" },
    scheduled: { label: "Scheduled", className: "badge-neutral" },
    confirmed: { label: "Confirmed", className: "badge-verified" },
    cancelled: { label: "Cancelled", className: "badge-overdue" },
    clinical_approved: { label: "Clinical approval", className: "badge-blue" },
    draft: { label: "Draft", className: "badge-neutral" },
    closed: { label: t("complete"), className: "badge-verified" },
    inactive: { label: t("inactive"), className: "badge-neutral" },
    moved: { label: "Moved", className: "badge-neutral" },
    deceased: { label: "Inactive record", className: "badge-neutral" },
  };
  const item = config[status] ?? { label: status, className: "badge-neutral" };
  return (
    <Badge className={cn("whitespace-normal", item.className)}>
      {item.icon ? (
        <Check className="size-3 shrink-0" />
      ) : (
        <span className="size-1.5 shrink-0 rounded-full bg-current opacity-60" />
      )}
      {item.label}
    </Badge>
  );
}
export function PersonCell({
  person,
  navigate,
  hint,
}: {
  person: Entity<"mothers"> | Entity<"children">;
  navigate: ViewProps["navigate"];
  hint?: string;
}) {
  const { t } = useWorkspace();
  return (
    <button
      type="button"
      className="flex min-h-11 items-center gap-2.5 text-left"
      onClick={() => navigate(`/${person.type}/${person.id}`)}
      aria-label={`Open ${person.data.name}`}
    >
      <span className={cn("avatar", person.type === "children" && "child")}>
        {initials(person.data.name)}
      </span>
      <span className="min-w-0">
        <span className="person-name">{person.data.name}</span>
        <span className="person-meta block">
          {hint ??
            `${t("ward")} ${person.wardId} · ${person.type === "children" ? t("child") : t("mother")}`}
        </span>
      </span>
    </button>
  );
}
export function TaskTable({
  items,
  navigate,
  openForm,
  compact = false,
}: ViewProps & { items: WorkItem[]; compact?: boolean }) {
  const { t, language } = useWorkspace();
  if (!items.length)
    return <EmptyState title={t("noTasks")} description={t("noTasksHint")} />;
  return (
    <table className="record-table">
      <thead>
        <tr>
          <th scope="col">{t("person")}</th>
          <th scope="col" className="hide-mobile">
            {t("careAction")}
          </th>
          <th
            scope="col"
            className={compact ? "hide-mobile hide-laptop" : "hide-mobile"}
          >
            {t("plannedDate")}
          </th>
          <th scope="col">{t("status")}</th>
          <th scope="col">
            <span className="sr-only">{t("action")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <PersonCell person={item.person} navigate={navigate} />
              <span className="mt-1 block max-w-40 text-[10px] leading-relaxed text-muted-foreground md:hidden">
                {item.data.reason}
                <br />
                {formatDate(item.data.dueDate, language)}
              </span>
            </td>
            <td className="hide-mobile">
              <div className="max-w-44 text-[11px] leading-relaxed">
                {item.data.reason}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {item.lastAttempt
                  ? `Last contact ${formatDate(item.lastAttempt.data.date, language)}`
                  : "Ready for follow-up"}
              </div>
            </td>
            <td className={compact ? "hide-mobile hide-laptop" : "hide-mobile"}>
              {formatDate(item.data.dueDate, language)}
            </td>
            <td>
              <StatusBadge
                status={
                  item.resolved
                    ? item.lastAttempt?.data.outcome === "moved"
                      ? "moved"
                      : "closed"
                    : item.data.dueDate < today()
                      ? "date_passed"
                      : item.data.dueDate === today()
                        ? "due"
                        : "upcoming"
                }
              />
            </td>
            <td className="w-12">
              <Button
                variant="ghost"
                size="icon"
                className="text-[#566755]"
                onClick={() => openForm({ type: "followup", task: item })}
                aria-label={`${t("recordOutcome")} for ${item.person.data.name}`}
              >
                <ArrowRight />
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function StatCard({
  label,
  value,
  detail,
  icon,
  tint = "green",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  tint?: "green" | "peach" | "yellow" | "blue";
}) {
  const colors = {
    green: "bg-[#ecf3e9] text-[#516549]",
    peach: "bg-[#faeee6] text-[#755b47]",
    yellow: "bg-[#faf2df] text-[#73613a]",
    blue: "bg-[#eaf2f0] text-[#52655e]",
  };
  return (
    <div className="stat-card">
      <span
        className={cn(
          "absolute right-4 top-5 flex size-9 items-center justify-center rounded-lg [&_svg]:size-[18px] [&_svg]:stroke-[1.6]",
          colors[tint],
        )}
      >
        {icon}
      </span>
      <p className="stat-label pr-8">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-detail">{detail}</p>
    </div>
  );
}
export function Note({ children }: { children?: ReactNode }) {
  const { t } = useWorkspace();
  return (
    <div className="inline-note">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>{children ?? t("clinicalNote")}</span>
    </div>
  );
}
export function RegistrationActions({ openForm }: Pick<ViewProps, "openForm">) {
  const { t } = useWorkspace();
  return (
    <>
      <Button variant="outline" onClick={() => openForm({ type: "child" })}>
        <Plus />
        {t("addChild")}
      </Button>
      <Button onClick={() => openForm({ type: "mother" })}>
        <Plus />
        {t("registerMother")}
      </Button>
    </>
  );
}
export const icons = {
  ArrowDownToLine,
  ArrowRight,
  Baby,
  CalendarDays,
  ClipboardCheck,
  Heart,
  UserRound,
  UsersRound,
  ShieldCheck,
  CircleHelp,
};
export { Button, Badge, Card, CardContent, CardHeader, CardTitle };
