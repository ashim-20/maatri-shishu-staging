"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "./provider";
import {
  find,
  select,
  canVerify,
  type Data,
  type SaveSpec,
} from "@/lib/domain/types";
import { today } from "@/lib/domain/dates";
import {
  scheduleFor,
  effectiveEvents,
  eventDecision,
} from "@/lib/domain/schedule";
import { matchesTask } from "@/lib/domain/mutations";
import { demoDoses } from "@/lib/domain/seed";
import { outcomeLabels } from "@/lib/i18n";
import type { WorkItem } from "@/lib/domain/worklist";

export type FormState =
  | { type: "mother"; id?: string }
  | { type: "child"; id?: string; motherId?: string }
  | { type: "pregnancy"; motherId: string }
  | {
      type: "care";
      subjectId: string;
      subjectType: "mother" | "child";
      kind?: Data<"care_events">["kind"];
      eventId?: string;
      doseCode?: string;
    }
  | { type: "appointment"; subjectId: string; subjectType: "mother" | "child" }
  | { type: "followup"; task: WorkItem }
  | { type: "session"; id?: string }
  | { type: "verify"; id: string }
  | { type: "review"; id: string }
  | { type: "consent"; subjectId: string; subjectType: "mother" | "child" }
  | { type: "schedule" }
  | { type: "help" };
const value = (f: FormData, name: string) => String(f.get(name) ?? "").trim();
const nullable = (f: FormData, name: string) => value(f, name) || null;
const reference = (prefix: string) =>
  `MS-${prefix}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

export function Field({
  label,
  children,
  hint,
  full = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  full?: boolean;
}) {
  const id = useId();
  const controls = Children.map(children, (child) => {
    if (!isValidElement<{ id?: string; "aria-describedby"?: string }>(child))
      return child;
    if (
      child.type !== Input &&
      child.type !== Select &&
      child.type !== Textarea &&
      !(
        typeof child.type === "string" &&
        ["input", "select", "textarea"].includes(child.type)
      )
    )
      return child;
    return cloneElement(child, {
      id,
      "aria-describedby": hint ? `${id}-hint` : child.props["aria-describedby"],
    });
  });
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="[&>input]:w-full [&>select]:w-full">{controls}</div>
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
    </div>
  );
}
function FormShell({
  title,
  description,
  children,
  onSave,
  onClose,
  submitLabel,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onSave: (form: FormData) => Promise<void>;
  onClose: () => void;
  submitLabel?: string;
}) {
  const { t } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onSave(form);
      toast.success(t("recordSaved"));
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Please check the record and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogTitle className="pr-7">{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <form onSubmit={submit} className="mt-6">
        <div className="field-grid">{children}</div>
        {error && (
          <div
            role="alert"
            className="mt-5 flex gap-2 rounded-lg bg-red-50 p-3 text-xs leading-relaxed text-red-800"
          >
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}
        <div className="form-footer">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            {t("cancel")}
          </Button>
          <Button disabled={busy} type="submit">
            {busy && <Loader2 className="animate-spin" />}
            {busy ? t("saving") : (submitLabel ?? t("save"))}
          </Button>
        </div>
      </form>
    </>
  );
}
function ConsentFields({ guardian = "" }: { guardian?: string }) {
  const { t } = useWorkspace();
  return (
    <div className="field full rounded-xl border border-[#dee8d9] bg-[#f4f7ef] p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4 text-primary" />
        {t("consent")}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {t("consentExplain")}
      </p>
      {guardian !== undefined && (
        <Input
          name="guardian"
          aria-label={t("guardian")}
          placeholder={t("guardian")}
          defaultValue={guardian}
          className="mt-2"
        />
      )}
      <label className="mt-2 flex min-h-11 items-center gap-3 text-xs leading-relaxed">
        <input name="consent" type="checkbox" required />
        {t("consentGiven")}
      </label>
    </div>
  );
}
function WardField({ initial }: { initial?: number }) {
  const { profile, t } = useWorkspace();
  return (
    <Field label={t("ward")}>
      <Select
        name="ward"
        aria-label={t("ward")}
        defaultValue={initial ?? profile.wardIds[0]}
      >
        {profile.wardIds.map((w) => (
          <option value={w} key={w}>
            {t("ward")} {w}
          </option>
        ))}
      </Select>
    </Field>
  );
}
function LanguageField({ initial }: { initial?: string }) {
  const { language, t } = useWorkspace();
  return (
    <Field label={t("language")}>
      <Select
        name="language"
        aria-label={t("language")}
        defaultValue={initial ?? language}
      >
        <option value="en">English</option>
        <option value="ne">नेपाली</option>
        <option value="bho">भोजपुरी</option>
      </Select>
    </Field>
  );
}

function MotherForm({
  state,
  onClose,
}: {
  state: Extract<FormState, { type: "mother" }>;
  onClose: () => void;
}) {
  const { records, saveBatch, update, t } = useWorkspace();
  const old = find(records, "mothers", state.id);
  const [recordId] = useState(() => old?.id ?? crypto.randomUUID());
  const [enteredName, setEnteredName] = useState(old?.data.name ?? "");
  const duplicates = select(records, "mothers").filter(
    (m) =>
      m.id !== old?.id &&
      enteredName.length > 2 &&
      m.data.name.toLowerCase().includes(enteredName.toLowerCase()),
  );
  return (
    <FormShell
      title={old ? "Update mother record" : t("registerMother")}
      description="Keep the details that help your care team follow up. Optional fields can be left blank."
      onClose={onClose}
      onSave={async (f) => {
        const data: Data<"mothers"> = {
          name: value(f, "name"),
          reference: old?.data.reference ?? reference("M"),
          settlement: value(f, "settlement"),
          age: value(f, "age") ? Number(value(f, "age")) : null,
          phone: value(f, "phone"),
          language: value(f, "language") as Data<"mothers">["language"],
          status: value(f, "status") as Data<"mothers">["status"],
          consent: old?.data.consent ?? {
            status: f.get("consent") ? "given" : "declined",
            language: value(f, "language") as "en" | "ne" | "bho",
            method: "verbal",
            guardian: value(f, "guardian"),
          },
        };
        if (old) await update(old, data);
        else {
          const wardId = Number(value(f, "ward"));
          const changes: SaveSpec[] = [
            { type: "mothers", id: recordId, data, wardId },
          ];
          for (const candidate of duplicates.slice(0, 5))
            changes.push({
              type: "reviews",
              wardId,
              data: {
                subjectId: recordId,
                subjectType: "mother",
                category: "duplicate",
                relatedId: candidate.id,
                status: "open",
                reason:
                  "Similar name found during registration. Confirm identities with the family before any merge.",
                resolution: "",
              },
            });
          await saveBatch(changes);
        }
      }}
    >
      <Field label={t("name")} full>
        <Input
          name="name"
          aria-label={t("name")}
          autoFocus
          required
          value={enteredName}
          onChange={(e) => setEnteredName(e.target.value)}
          placeholder="e.g. Sunita Devi"
        />
      </Field>
      {duplicates.length > 0 && (
        <div className="inline-note col-span-full">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Possible existing record:{" "}
            {duplicates
              .map((m) => `${m.data.name} (${m.data.reference})`)
              .join(", ")}
            . Review before creating another record. Saving will add a
            supervisor review; records stay separate.
          </span>
        </div>
      )}
      <Field label={t("settlement")}>
        <Input
          name="settlement"
          aria-label={t("settlement")}
          required
          defaultValue={old?.data.settlement}
          placeholder="Village or tole"
        />
      </Field>
      <WardField initial={old?.wardId} />
      <Field label={t("age")}>
        <Input
          name="age"
          aria-label={t("age")}
          type="number"
          min={10}
          max={100}
          defaultValue={old?.data.age ?? ""}
        />
      </Field>
      <Field label={t("phone")}>
        <Input
          name="phone"
          aria-label={t("phone")}
          type="tel"
          maxLength={25}
          defaultValue={old?.data.phone}
        />
      </Field>
      <LanguageField initial={old?.data.language} />
      <Field label={t("status")}>
        <Select
          name="status"
          aria-label={t("status")}
          defaultValue={old?.data.status ?? "pregnant"}
        >
          <option value="pregnant">{t("pregnant")}</option>
          <option value="postnatal">{t("postnatal")}</option>
          <option value="inactive">{t("inactive")}</option>
          <option value="moved">Moved out of catchment</option>
        </Select>
      </Field>
      {!old && <ConsentFields />}
    </FormShell>
  );
}
function ChildForm({
  state,
  onClose,
}: {
  state: Extract<FormState, { type: "child" }>;
  onClose: () => void;
}) {
  const { records, saveBatch, t, demo } = useWorkspace();
  const old = find(records, "children", state.id);
  const [recordId] = useState(() => old?.id ?? crypto.randomUUID());
  const [motherId, setMotherId] = useState(
    old?.data.motherId ?? state.motherId ?? "",
  );
  const [birthChoice, setBirthChoice] = useState(
    old?.data.birthId ?? (old ? "" : "new"),
  );
  const [dob, setDob] = useState(old?.data.dob ?? "");
  const [dobSource, setDobSource] = useState<Data<"children">["dobSource"]>(
    old?.data.dobSource ?? "confirmed",
  );
  const births = select(records, "births").filter(
    (b) =>
      (motherId && b.data.motherId === motherId) || b.id === old?.data.birthId,
  );
  const pregnancies = select(records, "pregnancies").filter(
    (p) => p.data.motherId === motherId,
  );
  return (
    <FormShell
      title={old ? "Update child record" : t("addChild")}
      description="Link a mother when known. A child can be registered independently, even if their birth date is uncertain."
      onClose={onClose}
      onSave={async (f) => {
        const birthDate = nullable(f, "dob");
        const dateSource = birthDate
          ? (value(f, "dobSource") as Data<"children">["dobSource"])
          : "unknown";
        const wardId = old?.wardId ?? Number(value(f, "ward"));
        const changes: SaveSpec[] = [];
        const birthId =
          birthChoice === "new" ? crypto.randomUUID() : birthChoice || null;
        if (birthChoice === "new")
          changes.push({
            type: "births",
            id: birthId!,
            wardId,
            data: {
              motherId: motherId || null,
              pregnancyId: nullable(f, "pregnancyId"),
              date: birthDate,
              time: value(f, "birthTime"),
              place: value(f, "birthPlace"),
              source: value(f, "birthSource") as Data<"births">["source"],
            },
          });
        const data: Data<"children"> = {
          name: value(f, "name") || "Unnamed child",
          reference: old?.data.reference ?? reference("C"),
          motherId: motherId || null,
          birthId,
          dob: birthDate,
          dobSource: dateSource,
          sex: value(f, "sex") as Data<"children">["sex"],
          settlement: value(f, "settlement"),
          scheduleId:
            dateSource === "confirmed"
              ? old?.data.dob === birthDate && old.data.scheduleId
                ? old.data.scheduleId
                : (scheduleFor(records, birthDate, demo)?.id ?? null)
              : null,
          status: value(f, "status") as Data<"children">["status"],
          consent: old?.data.consent ?? {
            status: f.get("consent") ? "given" : "declined",
            method: "verbal",
            language: value(f, "language") as "en" | "ne" | "bho",
            guardian: value(f, "guardian"),
          },
          correctionReason: old
            ? value(f, "correctionReason") || old.data.correctionReason || ""
            : "",
        };
        if (!data.motherId && !data.consent.guardian)
          throw new Error(
            "Record the guardian or person giving consent for an independent child record.",
          );
        const sensitiveChange =
          old &&
          (data.dob !== old.data.dob ||
            data.dobSource !== old.data.dobSource ||
            data.motherId !== old.data.motherId ||
            data.birthId !== old.data.birthId ||
            data.scheduleId !== old.data.scheduleId);
        if (sensitiveChange && value(f, "correctionReason").length < 3)
          throw new Error(
            "Record a reason for changing the birth date, relationships or schedule assignment.",
          );
        changes.push({
          type: "children",
          id: recordId,
          data,
          wardId,
          expectedVersion: old?.version,
        });
        if (
          (!birthDate || dateSource !== "confirmed" || !data.scheduleId) &&
          !select(records, "reviews").some(
            (r) =>
              r.data.subjectId === recordId &&
              r.data.category === "uncertain_dob" &&
              r.data.status === "open",
          )
        )
          changes.push({
            type: "reviews",
            wardId,
            data: {
              subjectId: recordId,
              subjectType: "child",
              category: "uncertain_dob",
              relatedId: null,
              status: "open",
              reason:
                "Birth date or schedule assignment needs health-worker review.",
              resolution: "",
            },
          });
        await saveBatch(changes);
      }}
    >
      <Field label="Child name (optional if not named)" full>
        <Input
          name="name"
          aria-label="Child name"
          autoFocus
          defaultValue={old?.data.name}
          placeholder="e.g. Aarav Sah"
        />
      </Field>
      <Field label="Linked mother" full>
        <Select
          name="motherId"
          aria-label="Linked mother"
          value={motherId}
          onChange={(event) => {
            setMotherId(event.target.value);
            setBirthChoice("new");
          }}
        >
          <option value="">Independent child · no mother record</option>
          {select(records, "mothers").map((m) => (
            <option key={m.id} value={m.id}>
              {m.data.name} · {m.data.reference}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t("dob")}
        hint="Leave blank when unknown; no date will be invented."
      >
        <Input
          name="dob"
          aria-label={t("dob")}
          type="date"
          max={today()}
          value={dob}
          onChange={(event) => setDob(event.target.value)}
        />
      </Field>
      <Field label="Birth date source">
        <Select
          name="dobSource"
          aria-label="Birth date source"
          value={dobSource}
          onChange={(event) => {
            setDobSource(event.target.value as Data<"children">["dobSource"]);
            if (event.target.value === "unknown") setDob("");
          }}
        >
          <option value="confirmed">Confirmed from record / provider</option>
          <option value="approximate">Approximate · needs review</option>
          <option value="unknown">Unknown</option>
        </Select>
      </Field>
      <Field
        label="Birth event"
        full
        hint="Twins can share one birth event. Each child keeps a separate identity and care history."
      >
        <Select
          name="birthId"
          aria-label="Birth event"
          value={birthChoice}
          onChange={(event) => {
            setBirthChoice(event.target.value);
            const birth = find(records, "births", event.target.value);
            if (birth) {
              setDob(birth.data.date ?? "");
              setDobSource(
                !birth.data.date
                  ? "unknown"
                  : ["provider", "card"].includes(birth.data.source)
                    ? "confirmed"
                    : "approximate",
              );
            }
          }}
        >
          <option value="new">Record a new birth event</option>
          <option value="">No birth event available</option>
          {births.map((birth) => (
            <option key={birth.id} value={birth.id}>
              Existing birth · {birth.data.date ?? "Date unknown"} ·{" "}
              {birth.data.place || "Place not recorded"}
            </option>
          ))}
        </Select>
      </Field>
      {birthChoice === "new" && (
        <>
          <Field label="Linked pregnancy" full>
            <Select
              key={motherId}
              name="pregnancyId"
              aria-label="Linked pregnancy"
              defaultValue=""
            >
              <option value="">No pregnancy episode linked</option>
              {pregnancies.map((pregnancy) => (
                <option key={pregnancy.id} value={pregnancy.id}>
                  {pregnancy.data.status} · EDD{" "}
                  {pregnancy.data.edd ?? "unknown"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Place of birth (optional)">
            <Input
              name="birthPlace"
              aria-label="Place of birth"
              maxLength={120}
            />
          </Field>
          <Field label="Time of birth (optional)">
            <Input name="birthTime" aria-label="Time of birth" type="time" />
          </Field>
          <Field label="Birth record source" full>
            <Select name="birthSource" aria-label="Birth record source">
              <option value="unknown">Unknown</option>
              <option value="reported">Reported by family</option>
              <option value="card">Transcribed from birth record</option>
              <option value="provider">Confirmed by provider</option>
            </Select>
          </Field>
        </>
      )}
      <Field label="Sex as recorded">
        <Select
          name="sex"
          aria-label="Sex as recorded"
          defaultValue={old?.data.sex ?? "not_recorded"}
        >
          <option value="not_recorded">Not recorded</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </Select>
      </Field>
      <WardField initial={old?.wardId} />
      <Field label={t("settlement")}>
        <Input
          name="settlement"
          aria-label={t("settlement")}
          required
          defaultValue={old?.data.settlement}
        />
      </Field>
      <LanguageField initial={old?.data.consent.language} />
      <Field label={t("status")} full>
        <Select
          name="status"
          aria-label={t("status")}
          defaultValue={old?.data.status ?? "active"}
        >
          <option value="active">Active</option>
          <option value="moved">Moved out of catchment</option>
          <option value="deceased">Deceased · authorized status only</option>
        </Select>
      </Field>
      {!old && (
        <ConsentFields
          guardian={find(records, "mothers", state.motherId)?.data.name ?? ""}
        />
      )}
      {old && (
        <Field
          label="Correction reason"
          full
          hint="Required when changing the birth date, mother, birth link or schedule. Previous versions remain in the audit history."
        >
          <Textarea
            name="correctionReason"
            aria-label="Correction reason"
            maxLength={500}
          />
        </Field>
      )}
    </FormShell>
  );
}
function PregnancyForm({
  motherId,
  onClose,
}: {
  motherId: string;
  onClose: () => void;
}) {
  const { saveBatch, records } = useWorkspace();
  const mother = find(records, "mothers", motherId)!;
  return (
    <FormShell
      title="Add pregnancy episode"
      description={`${mother.data.name} · Record dates only when known. Appointments remain provider-confirmed.`}
      onClose={onClose}
      onSave={async (f) => {
        const data: Data<"pregnancies"> = {
          motherId,
          lmp: nullable(f, "lmp"),
          edd: nullable(f, "edd"),
          dateSource: value(f, "source") as Data<"pregnancies">["dateSource"],
          status: "active",
        };
        const changes: SaveSpec[] = [
          { type: "pregnancies", data, wardId: mother.wardId },
        ];
        if (
          !data.edd ||
          data.dateSource === "unknown" ||
          data.dateSource === "reported"
        )
          changes.push({
            type: "reviews",
            wardId: mother.wardId,
            data: {
              subjectId: motherId,
              subjectType: "mother",
              category: "correction",
              relatedId: null,
              status: "open",
              reason:
                "Pregnancy dates or their source need health-worker review. No dates were inferred.",
              resolution: "",
            },
          });
        await saveBatch(changes);
      }}
    >
      <Field label="Last menstrual period (optional)">
        <Input
          name="lmp"
          aria-label="Last menstrual period"
          type="date"
          max={today()}
        />
      </Field>
      <Field label="Provider-confirmed due date (optional)">
        <Input name="edd" aria-label="Expected delivery date" type="date" />
      </Field>
      <Field label="Date source" full>
        <Select name="source" aria-label="Date source">
          <option value="unknown">Unknown</option>
          <option value="provider">Confirmed by provider</option>
          <option value="card">Transcribed from card</option>
          <option value="reported">Reported</option>
        </Select>
      </Field>
    </FormShell>
  );
}
function CareForm({
  state,
  onClose,
}: {
  state: Extract<FormState, { type: "care" }>;
  onClose: () => void;
}) {
  const { records, profile, create, t } = useWorkspace();
  const prior = find(records, "care_events", state.eventId);
  const subject =
    state.subjectType === "mother"
      ? find(records, "mothers", state.subjectId)!
      : find(records, "children", state.subjectId)!;
  const child = subject.type === "children" ? subject : undefined;
  const schedule = find(records, "schedules", child?.data.scheduleId);
  const [kind, setKind] = useState<Data<"care_events">["kind"]>(
    prior?.data.kind ??
      state.kind ??
      (state.subjectType === "mother" ? "anc" : "vaccination"),
  );
  const [source, setSource] = useState<Data<"care_events">["source"]>(
    prior?.data.source ??
      (canVerify(profile.role)
        ? "provider_administered"
        : "caregiver_reported"),
  );
  return (
    <FormShell
      title={prior ? "Add an audited correction" : t("recordCare")}
      description={`${subject.data.name} · Keep the record source visible. Original events are retained after a correction.`}
      onClose={onClose}
      onSave={async (f) => {
        await create(
          "care_events",
          {
            subjectId: state.subjectId,
            subjectType: state.subjectType,
            pregnancyId: nullable(f, "pregnancyId"),
            kind,
            date: value(f, "date"),
            source,
            verified:
              source === "provider_administered" && canVerify(profile.role),
            provider: value(f, "provider"),
            doseCode:
              kind === "vaccination"
                ? nullable(f, "dose")
                : kind === "td"
                  ? nullable(f, "doseLabel")
                  : null,
            scheduleId: kind === "vaccination" ? (schedule?.id ?? null) : null,
            timing: value(f, "timing"),
            supersedesId: prior?.id ?? null,
            note: value(f, "note"),
          },
          { wardId: subject.wardId },
        );
      }}
    >
      <Field label="Care event">
        <Select
          name="kind"
          aria-label="Care event"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          disabled={Boolean(prior)}
        >
          {state.subjectType === "mother" ? (
            <>
              <option value="anc">ANC contact</option>
              <option value="pnc_mother">Mother PNC contact</option>
              <option value="td">Maternal Td administration</option>
            </>
          ) : (
            <>
              <option value="vaccination">Vaccination</option>
              <option value="pnc_child">Newborn PNC contact</option>
            </>
          )}
        </Select>
      </Field>
      <Field label="Date of care">
        <Input
          name="date"
          aria-label="Date of care"
          type="date"
          required
          max={today()}
          defaultValue={prior?.data.date ?? today()}
        />
      </Field>
      {state.subjectType === "mother" && (
        <Field label="Pregnancy episode" full>
          <Select
            name="pregnancyId"
            aria-label="Pregnancy episode"
            defaultValue={
              prior?.data.pregnancyId ??
              select(records, "pregnancies").find(
                (p) =>
                  p.data.motherId === state.subjectId &&
                  p.data.status === "active",
              )?.id ??
              ""
            }
          >
            <option value="">Select episode / not applicable to PNC</option>
            {select(records, "pregnancies")
              .filter((p) => p.data.motherId === state.subjectId)
              .map((p, i) => (
                <option key={p.id} value={p.id}>
                  Episode {i + 1} · {p.data.status}
                  {p.data.edd ? ` · EDD ${p.data.edd}` : ""}
                </option>
              ))}
          </Select>
        </Field>
      )}
      {kind === "vaccination" && (
        <Field label="Vaccine / dose" full>
          <Select
            name="dose"
            aria-label="Vaccine / dose"
            required
            defaultValue={prior?.data.doseCode ?? state.doseCode ?? ""}
          >
            <option value="">Select a dose</option>
            {schedule?.data.doses.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </Select>
          {!schedule && (
            <p className="mt-2 text-xs text-amber-800">
              An approved schedule must be assigned before recording a routine
              dose.
            </p>
          )}
        </Field>
      )}
      {kind === "td" && (
        <Field
          label="Documented dose label"
          full
          hint="Record the administered dose. The app does not recommend a maternal Td dose."
        >
          <Input
            name="doseLabel"
            aria-label="Documented dose label"
            required
            defaultValue={prior?.data.doseCode ?? ""}
            placeholder="As written in the provider record"
          />
        </Field>
      )}
      <Field label={t("source")}>
        <Select
          name="source"
          aria-label={t("source")}
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
        >
          {canVerify(profile.role) && (
            <option value="provider_administered">
              Provider-administered / observed
            </option>
          )}
          <option value="card_transcription">
            Transcribed from card · pending
          </option>
          <option value="caregiver_reported">
            Reported by caregiver · unverified
          </option>
        </Select>
      </Field>
      <Field label="Provider / facility">
        <Input
          name="provider"
          aria-label="Provider / facility"
          defaultValue={
            prior?.data.provider ??
            (canVerify(profile.role) ? profile.name : "")
          }
        />
      </Field>
      {kind.startsWith("pnc") && (
        <Field
          label="Provider-confirmed contact timing"
          full
          hint="Timing is entered by the provider; a date alone does not establish an exact 24-hour interval."
        >
          <Select
            name="timing"
            aria-label="Contact timing"
            defaultValue={prior?.data.timing ?? ""}
          >
            <option value="">Timing not confirmed</option>
            <option>Within 24 hours · provider confirmed</option>
            <option>Day 3</option>
            <option>Days 7–14</option>
            <option>6 weeks</option>
            <option>Other documented contact</option>
          </Select>
        </Field>
      )}
      <Field
        label={prior ? "Correction reason (required)" : "Brief note (optional)"}
        full
      >
        <Textarea
          name="note"
          aria-label={prior ? "Correction reason" : "Brief note"}
          required={Boolean(prior)}
          maxLength={500}
          placeholder="Keep notes relevant to this record."
        />
      </Field>
      <div className="inline-note col-span-full">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        {source === "provider_administered"
          ? "This event is recorded by an authorized health worker."
          : "This event stays unverified until an authorized health worker reviews the evidence."}
      </div>
    </FormShell>
  );
}
function AppointmentForm({
  state,
  onClose,
}: {
  state: Extract<FormState, { type: "appointment" }>;
  onClose: () => void;
}) {
  const { create, records } = useWorkspace();
  const subject =
    state.subjectType === "mother"
      ? find(records, "mothers", state.subjectId)!
      : find(records, "children", state.subjectId)!;
  return (
    <FormShell
      title="Set a confirmed appointment"
      description={`${subject.data.name} · Enter the date agreed with the health post. This does not change a vaccine's planned due date.`}
      onClose={onClose}
      onSave={async (f) => {
        await create(
          "appointments",
          {
            subjectId: state.subjectId,
            subjectType: state.subjectType,
            date: value(f, "date"),
            type: value(f, "type") as Data<"appointments">["type"],
            note: value(f, "note"),
          },
          { wardId: subject.wardId },
        );
      }}
    >
      <Field label="Appointment date">
        <Input name="date" aria-label="Appointment date" type="date" required />
      </Field>
      <Field label="Appointment type">
        <Select name="type" aria-label="Appointment type">
          <option value="anc">ANC</option>
          <option value="pnc">PNC</option>
          <option value="vaccination">Vaccination</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Brief note" full>
        <Textarea name="note" aria-label="Brief note" />
      </Field>
    </FormShell>
  );
}
function FollowupForm({
  task,
  onClose,
}: {
  task: WorkItem;
  onClose: () => void;
}) {
  const { records, saveBatch, profile, t } = useWorkspace();
  const [mode, setMode] = useState("contact");
  const verified = effectiveEvents(records, task.person.id).filter(
    (event) =>
      matchesTask(task.data, event) &&
      eventDecision(records, event) === "verified",
  );
  return (
    <FormShell
      title={t("recordOutcome")}
      description={`${task.person.data.name} · ${task.data.reason}. A contact attempt does not mark care as complete.`}
      onClose={onClose}
      onSave={async (f) => {
        const existing = find(records, "follow_ups", task.id);
        const changes: SaveSpec[] = [];
        if (mode === "complete") {
          await saveBatch([
            {
              type: "follow_ups",
              id: task.id,
              wardId: task.wardId,
              expectedVersion: existing?.version,
              data: {
                ...(existing?.data ?? task.data),
                status: "closed",
                completionEventId: nullable(f, "completionEventId"),
              },
            },
          ]);
          return;
        }
        if (!existing)
          changes.push({
            type: "follow_ups",
            data: task.data,
            id: task.id,
            wardId: task.wardId,
          });
        changes.push({
          type: "attempts",
          wardId: task.wardId,
          data: {
            taskId: task.id,
            date: value(f, "date"),
            channel: value(f, "channel") as Data<"attempts">["channel"],
            outcome: value(f, "outcome") as Data<"attempts">["outcome"],
            nextDate: nullable(f, "nextDate"),
            note: value(f, "note"),
          },
        });
        await saveBatch(changes);
      }}
    >
      {canVerify(profile.role) && (
        <Field label="Follow-up action" full>
          <Select
            aria-label="Follow-up action"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="contact">Record a contact attempt</option>
            <option value="complete">Confirm completed care</option>
          </Select>
        </Field>
      )}
      {mode === "complete" ? (
        <Field
          label="Verified care event"
          full
          hint="Select the care event that fulfilled this appointment. If the evidence is later rejected or corrected, this task returns for review."
        >
          <Select
            name="completionEventId"
            aria-label="Verified care event"
            required
            defaultValue=""
          >
            <option value="">Choose a matching verified event</option>
            {verified.map((event) => (
              <option key={event.id} value={event.id}>
                {event.data.date} · {event.data.kind.replaceAll("_", " ")} ·{" "}
                {event.data.provider || event.data.source}
              </option>
            ))}
          </Select>
          {!verified.length && (
            <p className="mt-2 text-xs text-amber-900">
              Record or verify matching care from the person’s profile first.
            </p>
          )}
        </Field>
      ) : (
        <>
          <Field label="Date of contact">
            <Input
              name="date"
              aria-label="Date of contact"
              type="date"
              max={today()}
              required
              defaultValue={today()}
            />
          </Field>
          <Field label="Contact method">
            <Select name="channel" aria-label="Contact method">
              <option value="home_visit">Home visit</option>
              <option value="phone">Phone call</option>
              <option value="health_post">At the health post</option>
            </Select>
          </Field>
          <Field label="What happened?" full>
            <Select name="outcome" aria-label="What happened?">
              {Object.entries(outcomeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Next follow-up date (optional)"
            full
            hint="Enter a staff-defined next action, not an automated care recommendation."
          >
            <Input
              name="nextDate"
              aria-label="Next follow-up date"
              type="date"
              min={today()}
            />
          </Field>
          <Field label="Brief note (optional)" full>
            <Textarea name="note" aria-label="Brief note" maxLength={500} />
          </Field>
        </>
      )}
    </FormShell>
  );
}
function SessionForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { records, create, update, t } = useWorkspace();
  const old = find(records, "sessions", id);
  return (
    <FormShell
      title={old ? "Update clinic session" : t("createSession")}
      description="Share a service opportunity with your catchment. Changes become shared after sync."
      onClose={onClose}
      onSave={async (f) => {
        const data: Data<"sessions"> = {
          title: value(f, "title"),
          date: value(f, "date"),
          startTime: value(f, "time"),
          location: value(f, "location"),
          service: value(f, "service") as Data<"sessions">["service"],
          status: value(f, "status") as Data<"sessions">["status"],
          note: value(f, "note"),
        };
        if (old) await update(old, data);
        else await create("sessions", data);
      }}
    >
      <Field label="Session title" full>
        <Input
          name="title"
          aria-label="Session title"
          required
          defaultValue={old?.data.title}
          placeholder="e.g. Child immunization clinic"
        />
      </Field>
      <Field label="Session date">
        <Input
          name="date"
          aria-label="Session date"
          type="date"
          required
          defaultValue={old?.data.date}
        />
      </Field>
      <Field label="Start time">
        <Input
          name="time"
          aria-label="Start time"
          type="time"
          required
          defaultValue={old?.data.startTime ?? "10:00"}
        />
      </Field>
      <Field label="Location" full>
        <Input
          name="location"
          aria-label="Location"
          required
          defaultValue={old?.data.location}
        />
      </Field>
      <Field label="Services">
        <Select
          name="service"
          aria-label="Services"
          defaultValue={old?.data.service ?? "immunization"}
        >
          <option value="immunization">Child immunization</option>
          <option value="anc_pnc">ANC / PNC</option>
          <option value="combined">Combined outreach</option>
        </Select>
      </Field>
      <Field label="Session status">
        <Select
          name="status"
          aria-label="Session status"
          defaultValue={old?.data.status ?? "scheduled"}
        >
          <option value="scheduled">Scheduled</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </Field>
      <Field label="Update / cancellation reason" full>
        <Textarea
          name="note"
          aria-label="Update reason"
          defaultValue={old?.data.note}
        />
      </Field>
    </FormShell>
  );
}
function VerificationForm({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { records, create } = useWorkspace();
  const event = find(records, "care_events", id)!;
  const latest = select(records, "event_reviews")
    .filter((r) => r.data.eventId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return (
    <FormShell
      title="Review recorded evidence"
      description="Confirm the source against the provider record or card. The original event remains in the history."
      onClose={onClose}
      onSave={async (f) => {
        await create(
          "event_reviews",
          {
            eventId: id,
            decision: value(f, "decision") as "verified" | "rejected",
            expectedReviewId: latest?.id ?? null,
            reason: value(f, "reason"),
          },
          { wardId: event.wardId },
        );
      }}
    >
      <div className="inline-note col-span-full">
        <Info className="size-4 shrink-0" />
        {event.data.kind} · {event.data.date} ·{" "}
        {event.data.source.replaceAll("_", " ")}
        {event.data.doseCode ? ` · ${event.data.doseCode}` : ""}
      </div>
      <Field label="Decision" full>
        <Select name="decision" aria-label="Verification decision">
          <option value="verified">Evidence verified</option>
          <option value="rejected">Evidence does not confirm this event</option>
        </Select>
      </Field>
      <Field label="Evidence checked / reason" full>
        <Textarea
          name="reason"
          aria-label="Evidence checked / reason"
          required
          minLength={3}
          maxLength={500}
        />
      </Field>
    </FormShell>
  );
}
function ReviewForm({ id, onClose }: { id: string; onClose: () => void }) {
  const { records, update } = useWorkspace();
  const review = find(records, "reviews", id)!;
  return (
    <FormShell
      title="Resolve review item"
      description={review.data.reason}
      onClose={onClose}
      onSave={async (f) => {
        await update(review, {
          ...review.data,
          status: "resolved",
          resolution: value(f, "resolution"),
        });
      }}
    >
      <div className="inline-note col-span-full">
        <Info className="size-4 shrink-0" />
        Correct the underlying record first when needed. Resolving this item
        does not merge identities, confirm a birth date, or mark a dose
        complete.
      </div>
      <Field label="Review decision and reason" full>
        <Textarea
          name="resolution"
          aria-label="Review decision and reason"
          required
          minLength={3}
          maxLength={500}
        />
      </Field>
    </FormShell>
  );
}
function ConsentForm({
  state,
  onClose,
}: {
  state: Extract<FormState, { type: "consent" }>;
  onClose: () => void;
}) {
  const { saveBatch, records } = useWorkspace();
  const person =
    state.subjectType === "mother"
      ? find(records, "mothers", state.subjectId)!
      : find(records, "children", state.subjectId)!;
  return (
    <FormShell
      title="Record a consent change"
      description="Withdrawing optional participation does not deny healthcare or erase the official care history. The controller's retention policy applies."
      onClose={onClose}
      onSave={async (f) => {
        const data: Data<"consents"> = {
          subjectId: state.subjectId,
          subjectType: state.subjectType,
          consent: {
            status: value(f, "status") as Data<"consents">["consent"]["status"],
            language: value(f, "language") as "en" | "ne" | "bho",
            method: "verbal",
            guardian: value(f, "guardian"),
          },
          reason: value(f, "reason"),
        };
        const changes: SaveSpec[] = [
          { type: "consents", data, wardId: person.wardId },
        ];
        if (data.consent.status !== "given")
          changes.push({
            type: "reviews",
            wardId: person.wardId,
            data: {
              subjectId: state.subjectId,
              subjectType: state.subjectType,
              category: "correction",
              relatedId: null,
              status: "open",
              reason:
                "Digital participation withdrawn or declined. Optional app follow-ups are suppressed; apply the controller's record-handling policy. Healthcare remains available.",
              resolution: "",
            },
          });
        await saveBatch(changes);
      }}
    >
      <Field label="Consent status">
        <Select name="status" aria-label="Consent status">
          <option value="withdrawn">Withdrawn</option>
          <option value="given">Given</option>
          <option value="declined">Declined</option>
        </Select>
      </Field>
      <LanguageField />
      <Field label="Person giving consent" full>
        <Input
          name="guardian"
          aria-label="Person giving consent"
          defaultValue={person.data.consent.guardian || person.data.name}
        />
      </Field>
      <Field label="Reason / explanation recorded" full>
        <Textarea
          name="reason"
          aria-label="Consent change reason"
          required
          minLength={3}
        />
      </Field>
    </FormShell>
  );
}
function ScheduleForm({ onClose }: { onClose: () => void }) {
  const { create, demo } = useWorkspace();
  return (
    <FormShell
      title="Create a schedule draft"
      description="Drafts cannot generate live timelines. An authorized clinical reviewer and a separate programme approver must approve activation."
      onClose={onClose}
      onSave={async (f) => {
        let doses: unknown;
        try {
          doses = JSON.parse(value(f, "doses"));
        } catch {
          throw new Error("Dose rules must contain valid JSON.");
        }
        await create("schedules", {
          name: value(f, "name"),
          source: value(f, "source"),
          authority: value(f, "authority"),
          effectiveFrom: value(f, "effectiveFrom"),
          effectiveTo: nullable(f, "effectiveTo"),
          doses: doses as Data<"schedules">["doses"],
          status: "draft",
          clinicalApprover: null,
          programmeApprover: null,
          testOnly: demo,
        });
      }}
    >
      <Field label="Version name" full>
        <Input name="name" aria-label="Version name" required />
      </Field>
      <Field label="Issuing authority" full>
        <Input name="authority" aria-label="Issuing authority" required />
      </Field>
      <Field label="Source document / reference" full>
        <Input
          name="source"
          aria-label="Source document / reference"
          required
        />
      </Field>
      <Field label="Effective from">
        <Input
          name="effectiveFrom"
          aria-label="Effective from"
          type="date"
          required
        />
      </Field>
      <Field label="Effective to (optional)">
        <Input name="effectiveTo" aria-label="Effective to" type="date" />
      </Field>
      <Field
        label="Dose rules (JSON)"
        full
        hint="Each rule needs a unique code, name, age, and unit: days, weeks, or months. Confirm every rule against the signed reference."
      >
        <Textarea
          name="doses"
          aria-label="Dose rules"
          className="min-h-48 font-mono text-xs"
          defaultValue={JSON.stringify(
            demo ? demoDoses : [{ code: "", name: "", age: 0, unit: "days" }],
            null,
            2,
          )}
        />
      </Field>
    </FormShell>
  );
}

export function RecordDialog({
  state,
  onClose,
}: {
  state: FormState | null;
  onClose: () => void;
}) {
  const { t } = useWorkspace();
  if (!state) return null;
  let content: ReactNode;
  switch (state.type) {
    case "mother":
      content = <MotherForm state={state} onClose={onClose} />;
      break;
    case "child":
      content = <ChildForm state={state} onClose={onClose} />;
      break;
    case "pregnancy":
      content = <PregnancyForm motherId={state.motherId} onClose={onClose} />;
      break;
    case "care":
      content = <CareForm state={state} onClose={onClose} />;
      break;
    case "appointment":
      content = <AppointmentForm state={state} onClose={onClose} />;
      break;
    case "followup":
      content = <FollowupForm task={state.task} onClose={onClose} />;
      break;
    case "session":
      content = <SessionForm id={state.id} onClose={onClose} />;
      break;
    case "verify":
      content = <VerificationForm id={state.id} onClose={onClose} />;
      break;
    case "review":
      content = <ReviewForm id={state.id} onClose={onClose} />;
      break;
    case "consent":
      content = <ConsentForm state={state} onClose={onClose} />;
      break;
    case "schedule":
      content = <ScheduleForm onClose={onClose} />;
      break;
    case "help":
      content = (
        <>
          <DialogTitle>{t("help")}</DialogTitle>
          <DialogDescription>
            A little guidance for your working day.
          </DialogDescription>
          <div className="mt-6 space-y-5 text-sm leading-relaxed">
            <p>
              <strong>Find the next action.</strong> Open Today or Follow-ups to
              see assigned care and record contact outcomes.
            </p>
            <p>
              <strong>Keep evidence clear.</strong> Reported and transcribed
              events remain unverified until a health worker checks them.
            </p>
            <p>
              <strong>Working offline.</strong> A successful save is stored on
              this device. Reconnect to share pending work. Sync before signing
              out, clearing browser data, or uninstalling.
            </p>
            <p>
              <strong>For care questions.</strong> Contact your health post.
              This workspace does not diagnose, prescribe, or handle
              emergencies.
            </p>
            <div className="inline-note">
              <CheckCircle2 className="size-4 shrink-0" />
              {t("printDisclaimer")}
            </div>
          </div>
        </>
      );
      break;
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>{content}</DialogContent>
    </Dialog>
  );
}
