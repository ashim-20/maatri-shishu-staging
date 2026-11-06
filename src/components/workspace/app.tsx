"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Heart,
  HelpCircle,
  Home,
  Leaf,
  MapPin,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Baby,
  BarChart3,
  BookOpenCheck,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { WorkspaceProvider, useWorkspace } from "./provider";
import { HomeView } from "./home";
import { DetailView, RecordsView } from "./records";
import {
  CalendarView,
  FollowupsView,
  ReportsView,
  ReviewView,
  SchedulesView,
  SettingsView,
} from "./operations";
import { RecordDialog, type FormState } from "./forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, today } from "@/lib/domain/dates";
import { roleLabels, select } from "@/lib/domain/types";
import { workspaceStats } from "@/lib/domain/worklist";
import { cn, initials } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

const navigation: {
  href: string;
  key: TranslationKey;
  icon: typeof Home;
  group: "workspace" | "management";
}[] = [
  { href: "/", key: "today", icon: Home, group: "workspace" },
  { href: "/mothers", key: "mothers", icon: Heart, group: "workspace" },
  { href: "/children", key: "children", icon: Baby, group: "workspace" },
  {
    href: "/follow-ups",
    key: "followups",
    icon: ClipboardList,
    group: "workspace",
  },
  {
    href: "/calendar",
    key: "calendar",
    icon: CalendarDays,
    group: "workspace",
  },
  { href: "/review", key: "review", icon: ShieldCheck, group: "management" },
  { href: "/reports", key: "reports", icon: BarChart3, group: "management" },
  {
    href: "/schedules",
    key: "schedules",
    icon: BookOpenCheck,
    group: "management",
  },
  { href: "/settings", key: "settings", icon: Settings, group: "management" },
];
function Brand() {
  return (
    <div className="brand">
      <Image src="/icon.svg" width={34} height={34} alt="" priority />
      <div>
        <div className="brand-title">
          maatri<span className="font-normal text-[#566755]">-</span>shishu
        </div>
        <div className="brand-subtitle">MOTHER & CHILD CARE</div>
      </div>
    </div>
  );
}

function Shell() {
  const {
    ready,
    error,
    records,
    profile,
    demo,
    t,
    language,
    pending,
    pendingAudit,
    online,
    syncing,
    sync,
  } = useWorkspace();
  const [path, setPath] = useState("/");
  const [dialog, setDialog] = useState<FormState | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const handle = () =>
      setPath(
        window.location.pathname === "/offline"
          ? "/"
          : window.location.pathname,
      );
    queueMicrotask(handle);
    window.addEventListener("popstate", handle);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => window.removeEventListener("popstate", handle);
  }, []);
  function navigate(next: string) {
    window.history.pushState(null, "", next);
    setPath(next);
    setMobileMenu(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0 });
  }
  const active = navigation.find((item) =>
    item.href === "/" ? path === "/" : path.startsWith(item.href),
  );
  useEffect(() => {
    document.title = `${active ? t(active.key) : "Workspace"} · Maatri-Shishu`;
    document.documentElement.lang = language;
  }, [active, language, t]);
  const stats = workspaceStats(records, profile, demo);
  const conflictCount = pending.filter(
    (op) => op.status === "conflict" || op.status === "rejected",
  ).length;
  const reviewCount = stats.reviewCount + conflictCount;
  const adminOnly = [
    "system_admin",
    "clinical_approver",
    "municipality_admin",
  ].includes(profile.role);
  const allowedNav = adminOnly
    ? navigation.filter((item) => ["schedules", "settings"].includes(item.key))
    : navigation;
  const results = [
    ...select(records, "mothers"),
    ...select(records, "children"),
  ]
    .filter(
      (p) =>
        query.length > 0 &&
        `${p.data.name} ${p.data.reference} ${p.data.settlement}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice(0, 8);
  const renderNavigation = () => (
    <>
      {(["workspace", "management"] as const).map((group) => (
        <div key={group} className="nav-group">
          <p className="nav-group-title">{t(group)}</p>
          {allowedNav
            .filter((item) => item.group === group)
            .map((item) => (
              <a
                href={item.href}
                onClick={(event) => {
                  if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
                    event.preventDefault();
                    navigate(item.href);
                  }
                }}
                key={item.href}
                className={cn(
                  "nav-link",
                  active?.href === item.href && "active",
                )}
                aria-current={active?.href === item.href ? "page" : undefined}
              >
                <item.icon />
                <span>{t(item.key)}</span>
                {item.key === "review" && reviewCount > 0 && (
                  <span className="ml-auto rounded bg-[#f5eddf] px-1.5 py-0.5 text-[9px] font-medium text-[#735d38]">
                    {reviewCount}
                  </span>
                )}
              </a>
            ))}
        </div>
      ))}
    </>
  );
  let page;
  const props = { navigate, openForm: setDialog };
  const segments = path.split("/").filter(Boolean);
  if (adminOnly && !["schedules", "settings"].includes(segments[0]))
    page = <SchedulesView {...props} />;
  else if (!segments.length) page = <HomeView {...props} />;
  else if (
    (segments[0] === "mothers" || segments[0] === "children") &&
    segments.length === 1
  )
    page = <RecordsView key={segments[0]} kind={segments[0]} {...props} />;
  else if (
    (segments[0] === "mothers" || segments[0] === "children") &&
    segments[1]
  )
    page = (
      <DetailView
        key={segments[1]}
        kind={segments[0]}
        id={segments[1]}
        {...props}
      />
    );
  else if (segments[0] === "follow-ups") page = <FollowupsView {...props} />;
  else if (segments[0] === "calendar") page = <CalendarView {...props} />;
  else if (segments[0] === "review") page = <ReviewView {...props} />;
  else if (segments[0] === "reports") page = <ReportsView {...props} />;
  else if (segments[0] === "schedules") page = <SchedulesView {...props} />;
  else if (segments[0] === "settings") page = <SettingsView {...props} />;
  else
    page = (
      <div className="empty-state">
        <h1 className="text-xl font-medium">Page not found</h1>
        <p>This page is not part of the workspace.</p>
        <Button className="mt-5" onClick={() => navigate("/")}>
          Back to Today
        </Button>
      </div>
    );
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-50 bg-primary px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <aside className="app-sidebar">
        <Brand />
        <div className="facility-label">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#586353]" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold leading-relaxed">
              {profile.facilityName}
            </p>
            <p className="mt-1 text-[9px] text-[#5e6259]">
              Parsa, Madhesh · {t("ward")} {profile.wardIds.join(" & ")}
            </p>
          </div>
        </div>
        <nav
          aria-label="Main navigation"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {renderNavigation()}
        </nav>
        <div className="sidebar-care-note mx-5 mb-3 rounded-lg bg-[#f7f9f3] p-3.5">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-[#556549]">
            <Leaf className="size-3.5" />
            Care, close to home.
          </div>
          <p className="text-[9px] leading-relaxed text-[#5f6559]">
            Helping you be there for every mother and child.
          </p>
        </div>
        <button
          className="mx-4 flex min-h-11 items-center gap-2.5 px-3 text-[11px] text-[#5e6558]"
          onClick={() => setDialog({ type: "help" })}
        >
          <HelpCircle className="size-4" />
          {t("help")}
        </button>
        <button
          onClick={() => navigate("/settings")}
          className="flex min-h-20 items-center gap-2.5 border-t border-border px-5 text-left"
        >
          <span className="avatar !size-8 !bg-[#e8eddf] !text-[#5b664b]">
            {initials(profile.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold">
              {profile.name}
            </span>
            <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">
              {roleLabels[profile.role]}
            </span>
          </span>
          <Settings className="size-3.5 text-[#5c6255]" />
        </button>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 md:hidden"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenu(true)}
            >
              <Menu />
            </Button>
            <div className="hide-mobile flex items-center gap-2 text-[10px]">
              <span className="text-[#5c6259]">Workspace</span>
              <ChevronRight className="size-3 text-[#5e615b]" />
              <span className="font-medium text-[#586651]">
                {active ? t(active.key) : "Record"}
              </span>
            </div>
            <span className="text-sm font-semibold md:hidden">
              maatri-shishu
            </span>
            {demo && (
              <Badge className="border-[#e1e9d5] bg-[#f4f7eb] text-[9px] font-normal text-[#5a6449]">
                Demo
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              className="hide-mobile mr-3 flex min-h-11 items-center gap-2.5 text-[10px] text-[#5e635b]"
              onClick={() => setSearchOpen(true)}
              aria-label="Search all records"
            >
              <Search className="size-3.5" />
              <span className="hidden xl:block">{t("search")}</span>
            </button>
            <button
              onClick={() => void sync()}
              disabled={!online || syncing}
              className="flex min-h-11 items-center gap-1.5 text-[9px] text-[#56644f]"
              title={t("sync")}
              aria-label={online ? t("sync") : t("offline")}
            >
              {!online ? (
                <WifiOff className="size-3" />
              ) : syncing ? (
                <RefreshCw className="size-3 animate-spin" />
              ) : (
                <span className="size-1.5 rounded-full bg-[#9bb988]" />
              )}
              <span className="hide-mobile">
                {!online
                  ? t("offline")
                  : syncing
                    ? t("syncing")
                    : pending.length + pendingAudit
                      ? `${pending.length + pendingAudit} pending`
                      : demo
                        ? "Saved locally"
                        : t("synced")}
              </span>
            </button>
            <span className="hide-mobile mx-3 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={t("notifications")}
              onClick={() => navigate("/review")}
            >
              <Bell className="!size-[17px] stroke-[1.5]" />
              {reviewCount > 0 && (
                <span className="absolute right-3 top-2 size-1.5 rounded-full bg-[#c9a182]" />
              )}
            </Button>
            <span className="hide-mobile text-[10px] text-[#5d6356]">
              {formatDate(today(), language, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        </header>
        <main id="main-content" className="content">
          {!ready ? (
            error ? (
              <div className="mx-auto my-20 max-w-lg rounded-xl border border-border bg-white p-8 text-center">
                <ShieldCheck className="mx-auto size-8 text-primary" />
                <h1 className="mt-4 text-xl font-semibold">
                  Workspace unavailable
                </h1>
                <p
                  role="alert"
                  className="mt-3 text-sm leading-relaxed text-muted-foreground"
                >
                  {error}
                </p>
                <Button
                  className="mt-6"
                  onClick={() => window.location.reload()}
                >
                  Try again
                </Button>
                {!demo && (
                  <Link
                    href="/login"
                    className="mt-4 block text-sm text-primary"
                  >
                    Return to sign in
                  </Link>
                )}
              </div>
            ) : (
              <div aria-label="Loading workspace" className="space-y-6">
                <div className="skeleton h-10 w-72 max-w-full" />
                <div className="stat-grid">
                  {[1, 2, 3, 4].map((i) => (
                    <div className="skeleton h-32" key={i} />
                  ))}
                </div>
                <div className="skeleton h-96" />
              </div>
            )
          ) : (
            <>
              {error && (
                <div
                  role="status"
                  className="no-print mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
                >
                  {error}{" "}
                  <button className="underline" onClick={() => void sync()}>
                    Retry sync
                  </button>
                </div>
              )}
              {page}
              <footer className="page-footer">
                <p className="flex items-center gap-1.5">
                  <Heart className="size-3 stroke-[1.5]" />
                  Made for care. Rooted in community.
                </p>
                <p>{demo ? t("synthetic") : profile.facilityName} · v0.1</p>
              </footer>
            </>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {(adminOnly
          ? allowedNav
          : navigation.filter((item) =>
              [
                "today",
                "mothers",
                "children",
                "followups",
                "calendar",
              ].includes(item.key),
            )
        ).map((item) => (
          <a
            key={item.href}
            href={item.href}
            onClick={(event) => {
              event.preventDefault();
              navigate(item.href);
            }}
            className={active?.href === item.href ? "active" : ""}
            aria-current={active?.href === item.href ? "page" : undefined}
          >
            <item.icon />
            <span>{t(item.key)}</span>
          </a>
        ))}
      </nav>
      <Dialog open={mobileMenu} onOpenChange={setMobileMenu}>
        <DialogContent className="left-0 top-0 h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none p-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a workspace page.
          </DialogDescription>
          <Brand />
          <nav aria-label="Menu navigation">{renderNavigation()}</nav>
          <Button
            variant="ghost"
            className="mx-4"
            onClick={() => {
              setMobileMenu(false);
              setDialog({ type: "help" });
            }}
          >
            <HelpCircle />
            {t("help")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent>
          <DialogTitle>Find a record</DialogTitle>
          <DialogDescription>
            Search within your downloaded, assigned catchment.
          </DialogDescription>
          <Input
            className="mt-5"
            aria-label="Global record search"
            autoFocus
            placeholder={t("searchShort")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mt-3">
            {results.map((person) => (
              <button
                key={person.id}
                onClick={() => navigate(`/${person.type}/${person.id}`)}
                className="flex min-h-14 w-full items-center justify-between border-b border-border py-3 text-left"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {person.data.name}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {person.data.reference} · {person.data.settlement}
                  </span>
                </span>
                <ArrowRightIcon />
              </button>
            ))}
            {query && !results.length && (
              <p className="py-5 text-center text-xs text-muted-foreground">
                {t("noRecords")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <RecordDialog
        key={dialog ? JSON.stringify(dialog) : "closed"}
        state={ready ? dialog : null}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
function ArrowRightIcon() {
  return <ChevronRight className="size-4 text-muted-foreground" />;
}
export function WorkspaceApp() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}
