import { addDays, addMonths, today } from "./dates";
import {
  type AnyEntity,
  type Data,
  type DoseRule,
  type Entity,
  type Profile,
  type RecordKind,
} from "./types";

export const seedId = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const demoProfile: Profile = {
  id: seedId(1),
  name: "Anita Chaudhary",
  role: "health_worker",
  facilityId: seedId(2),
  facilityName: "Parsa Community Health Post",
  wardIds: [3, 4],
  active: true,
};
export const demoDoses: DoseRule[] = [
  { code: "bcg-1", name: "BCG", age: 0, unit: "days" },
  ...[1, 2].flatMap((n) => [
    {
      code: `rota-${n}`,
      name: `Rotavirus ${n}`,
      age: n === 1 ? 6 : 10,
      unit: "weeks" as const,
    },
  ]),
  ...[1, 2, 3].flatMap((n) => [
    {
      code: `opv-${n}`,
      name: `Polio ${n}`,
      age: [6, 10, 14][n - 1],
      unit: "weeks" as const,
    },
    {
      code: `penta-${n}`,
      name: `Pentavalent ${n}`,
      age: [6, 10, 14][n - 1],
      unit: "weeks" as const,
    },
  ]),
  { code: "pcv-1", name: "PCV 1", age: 6, unit: "weeks" },
  { code: "pcv-2", name: "PCV 2", age: 10, unit: "weeks" },
  { code: "fipv-1", name: "fIPV 1", age: 14, unit: "weeks" },
  { code: "fipv-2", name: "fIPV 2", age: 9, unit: "months" },
  { code: "pcv-3", name: "PCV 3", age: 9, unit: "months" },
  { code: "mr-1", name: "MR 1", age: 9, unit: "months" },
  { code: "je-1", name: "Japanese encephalitis", age: 12, unit: "months" },
  { code: "mr-2", name: "MR 2", age: 15, unit: "months" },
  { code: "tcv-1", name: "Typhoid conjugate", age: 15, unit: "months" },
];
export function makeSeed(asOf = today()): AnyEntity[] {
  const records: AnyEntity[] = [];
  let counter = 1000;
  const at = `${asOf}T02:30:00.000Z`;
  function put<K extends RecordKind>(
    type: K,
    data: Data<K>,
    id = seedId(counter++),
    wardId = 3,
  ): Entity<K> {
    const record = {
      id,
      type,
      data,
      wardId,
      facilityId: seedId(2),
      version: 1,
      createdAt: at,
      updatedAt: at,
      createdBy: seedId(1),
    } as Entity<K>;
    records.push(record as AnyEntity);
    return record;
  }
  const consent = {
    status: "given" as const,
    language: "ne" as const,
    method: "verbal" as const,
    guardian: "",
  };
  put(
    "schedules",
    {
      name: "Nepal routine schedule · sample",
      source:
        "PRD §3.1 — demonstration fixture, not an approved clinical schedule",
      authority: "Synthetic demonstration only",
      effectiveFrom: "2020-01-01",
      effectiveTo: null,
      status: "active",
      clinicalApprover: seedId(90),
      programmeApprover: seedId(91),
      testOnly: true,
      doses: demoDoses,
    },
    seedId(10),
  );
  const names = [
    "Sunita Devi",
    "Rina Kumari",
    "Puja Chaudhary",
    "Asha Devi",
    "Manju Sah",
    "Sita Kumari",
  ];
  names.forEach((name, i) => {
    put(
      "mothers",
      {
        name,
        reference: `MS-M-${String(i + 1).padStart(4, "0")}`,
        settlement: [
          "Bairiya",
          "Pakaha",
          "Bairiya",
          "Sakhuwa",
          "Pakaha",
          "Sakhuwa",
        ][i],
        age: [24, 28, 22, 30, 26, 23][i],
        phone: "",
        language: i % 2 ? "bho" : "ne",
        status: i < 3 ? "pregnant" : "postnatal",
        consent,
      },
      seedId(100 + i),
      i === 5 ? 4 : 3,
    );
    put(
      "pregnancies",
      {
        motherId: seedId(100 + i),
        lmp: addDays(asOf, -[175, 225, 98, 280, 290, 300][i]),
        edd: i < 3 ? addDays(asOf, [105, 55, 182][i]) : null,
        dateSource: "provider",
        status: i < 3 ? "active" : "postnatal",
      },
      seedId(200 + i),
      i === 5 ? 4 : 3,
    );
    for (let c = 0; c < [4, 6, 2, 8, 7, 5][i]; c++)
      put("care_events", {
        subjectId: seedId(100 + i),
        subjectType: "mother",
        pregnancyId: seedId(200 + i),
        kind: "anc",
        date: addDays(asOf, -Math.max(1, 140 - c * 18)),
        source: "provider_administered",
        verified: true,
        provider: "Anita Chaudhary",
        doseCode: null,
        scheduleId: null,
        timing: `Contact ${c + 1}`,
        supersedesId: null,
        note: "",
      });
  });
  const children = [
    "Aarav Sah",
    "Anjali Kumari",
    "Rohan Chaudhary",
    "Baby of Asha",
    "Priya Kumari",
    "Nisha Sah",
    "Suman Kumar",
    "Baby of Sita",
  ];
  children.forEach((name, i) => {
    const dob =
      i === 6 ? null : addDays(asOf, -[104, 45, 278, 10, 72, 365, 0, 21][i]);
    put(
      "children",
      {
        name,
        reference: `MS-C-${String(i + 1).padStart(4, "0")}`,
        motherId: i === 6 ? null : seedId(100 + (i % 6)),
        birthId: null,
        dob,
        dobSource: dob ? "confirmed" : "unknown",
        sex: i % 2 ? "female" : "male",
        settlement: ["Bairiya", "Pakaha", "Sakhuwa"][i % 3],
        scheduleId: dob ? seedId(10) : null,
        status: "active",
        consent: { ...consent, guardian: i === 6 ? "Caregiver" : names[i % 6] },
      },
      seedId(300 + i),
      i === 7 ? 4 : 3,
    );
    if (dob)
      demoDoses.forEach((rule) => {
        const due =
          rule.unit === "months"
            ? addMonths(dob, rule.age)
            : addDays(dob, rule.age * (rule.unit === "weeks" ? 7 : 1));
        if (due <= addDays(asOf, -14))
          put("care_events", {
            subjectId: seedId(300 + i),
            subjectType: "child",
            pregnancyId: null,
            kind: "vaccination",
            date: due,
            source:
              i === 2 && rule.code === "mr-1"
                ? "card_transcription"
                : "provider_administered",
            verified: !(i === 2 && rule.code === "mr-1"),
            provider: "Anita Chaudhary",
            doseCode: rule.code,
            scheduleId: seedId(10),
            timing: "",
            supersedesId: null,
            note: "",
          });
      });
  });
  [
    {
      subjectId: seedId(300),
      subjectType: "child" as const,
      dueDate: addDays(asOf, -6),
      category: "vaccination" as const,
      reason: "14-week vaccination follow-up",
      doseCode: "fipv-1",
      scheduleId: seedId(10),
    },
    {
      subjectId: seedId(101),
      subjectType: "mother" as const,
      dueDate: asOf,
      category: "anc" as const,
      reason: "Provider-confirmed ANC appointment",
      doseCode: null,
      scheduleId: null,
    },
    {
      subjectId: seedId(301),
      subjectType: "child" as const,
      dueDate: addDays(asOf, -3),
      category: "vaccination" as const,
      reason: "6-week vaccination follow-up",
      doseCode: "penta-1",
      scheduleId: seedId(10),
    },
    {
      subjectId: seedId(103),
      subjectType: "mother" as const,
      dueDate: asOf,
      category: "pnc" as const,
      reason: "Mother PNC · provider follow-up",
      doseCode: null,
      scheduleId: null,
    },
    {
      subjectId: seedId(100),
      subjectType: "mother" as const,
      dueDate: addDays(asOf, 2),
      category: "anc" as const,
      reason: "Next ANC contact",
      doseCode: null,
      scheduleId: null,
    },
  ].forEach((task, i) =>
    put(
      "follow_ups",
      { ...task, assigneeId: seedId(1), status: "open" },
      seedId(400 + i),
    ),
  );
  [0, 3, 7, 12].forEach((days, i) =>
    put(
      "sessions",
      {
        title: [
          "Child immunization clinic",
          "Mother & newborn care",
          "Community outreach clinic",
          "Child immunization clinic",
        ][i],
        date: addDays(asOf, days),
        startTime: ["10:00", "09:30", "10:00", "10:30"][i],
        location: [
          "Bairiya community centre",
          "Parsa Community Health Post",
          "Sakhuwa outreach point",
          "Pakaha community centre",
        ][i],
        service: i === 1 ? "anc_pnc" : i === 2 ? "combined" : "immunization",
        status: i === 0 ? "confirmed" : "scheduled",
        note: "",
      },
      seedId(500 + i),
    ),
  );
  put("reviews", {
    subjectId: seedId(306),
    subjectType: "child",
    category: "uncertain_dob",
    relatedId: null,
    status: "open",
    reason: "Date of birth needs confirmation from a health worker.",
    resolution: "",
  });
  return records;
}
