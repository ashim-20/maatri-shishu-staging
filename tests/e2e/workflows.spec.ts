import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { today } from "../../src/lib/domain/dates";

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByLabel("Loading workspace")).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toBeVisible();
}
async function save(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
}

test("twins share a birth event and a DOB correction retains its reason", async ({
  page,
}) => {
  await ready(page, "/children");
  for (const name of ["Synthetic Twin Alpha", "Synthetic Twin Beta"]) {
    await page.getByRole("button", { name: "Add child", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Child name", { exact: true }).fill(name);
    await dialog
      .getByLabel("Linked mother", { exact: true })
      .selectOption("10000000-0000-4000-8000-000000000100");
    if (name.endsWith("Alpha")) {
      await dialog
        .getByLabel("Date of birth", { exact: true })
        .fill("2026-01-01");
      await dialog
        .getByLabel("Linked pregnancy", { exact: true })
        .selectOption("10000000-0000-4000-8000-000000000200");
      await dialog
        .getByLabel("Place of birth", { exact: true })
        .fill("Synthetic birth centre");
      await dialog.getByLabel("Time of birth", { exact: true }).fill("09:45");
      await dialog
        .getByLabel("Birth record source", { exact: true })
        .selectOption("provider");
    } else {
      const birth = await dialog
        .getByLabel("Birth event", { exact: true })
        .locator("option")
        .filter({ hasText: "Existing birth" })
        .getAttribute("value");
      await dialog
        .getByLabel("Birth event", { exact: true })
        .selectOption(birth!);
      await expect(
        dialog.getByLabel("Date of birth", { exact: true }),
      ).toHaveValue("2026-01-01");
    }
    await dialog
      .getByLabel("Settlement", { exact: true })
      .fill("Synthetic settlement");
    await dialog.getByRole("checkbox").check();
    await save(page);
  }
  await page.getByLabel("Search children").fill("Synthetic Twin Beta");
  await page
    .getByRole("button", { name: "Open Synthetic Twin Beta", exact: true })
    .click();
  await expect(
    page.getByRole("definition").filter({ hasText: "Synthetic birth centre" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Date of birth", { exact: true })
    .fill("2026-01-02");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Record a reason");
  await page
    .getByRole("dialog")
    .getByLabel("Correction reason", { exact: true })
    .fill("Corrected from the synthetic birth record");
  await save(page);
  await page.reload();
  await expect(
    page.getByText("Corrected from the synthetic birth record", {
      exact: true,
    }),
  ).toBeVisible();
});

test("maternal care and a contact attempt stay distinct from verified task completion", async ({
  page,
}) => {
  await ready(page, "/follow-ups");
  await page
    .getByLabel("Follow-up subject", { exact: true })
    .selectOption("mother");
  await page
    .getByRole("button", {
      name: "Record outcome for Rina Kumari",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("What happened?", { exact: true })
    .selectOption("attended_elsewhere");
  await save(page);
  await expect(
    page.getByRole("button", {
      name: "Record outcome for Rina Kumari",
      exact: true,
    }),
  ).toBeVisible();
  await ready(page, "/mothers/10000000-0000-4000-8000-000000000101");
  await page.getByRole("button", { name: "Record care", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Provider / facility", { exact: true })
    .fill("Synthetic completion provider");
  await save(page);
  await ready(page, "/follow-ups");
  await page
    .getByRole("button", {
      name: "Record outcome for Rina Kumari",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Follow-up action", { exact: true })
    .selectOption("complete");
  const completion = await dialog
    .getByLabel("Verified care event", { exact: true })
    .locator("option")
    .filter({ hasText: "Synthetic completion provider" })
    .getAttribute("value");
  await dialog
    .getByLabel("Verified care event", { exact: true })
    .selectOption(completion!);
  await save(page);
  await expect(
    page.getByRole("button", {
      name: "Record outcome for Rina Kumari",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Resolved", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Record outcome for Rina Kumari",
      exact: true,
    }),
  ).toBeVisible();
});

test("clinic sessions can be created and cancelled with a retained reason", async ({
  page,
}) => {
  await ready(page, "/calendar");
  await page.getByRole("button", { name: "Add session", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Session title", { exact: true })
    .fill("Synthetic outreach session");
  await dialog.getByLabel("Session date", { exact: true }).fill(today());
  await dialog
    .getByLabel("Location", { exact: true })
    .fill("Synthetic community hall");
  await save(page);
  const card = page
    .locator("div")
    .filter({
      has: page.getByText("Synthetic outreach session", { exact: true }),
    })
    .filter({
      has: page.getByRole("button", {
        name: "Edit session Synthetic outreach session",
        exact: true,
      }),
    })
    .last();
  await page
    .getByRole("button", {
      name: "Edit session Synthetic outreach session",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Session status", { exact: true })
    .selectOption("cancelled");
  await dialog
    .getByLabel("Update reason", { exact: true })
    .fill("Synthetic training cancellation");
  await save(page);
  await expect(card).toContainText("Cancelled");
  await expect(
    page.getByText("Synthetic training cancellation", { exact: true }),
  ).toBeVisible();
});

test("language preference persists and administrative roles cannot search clinical records", async ({
  page,
}) => {
  await ready(page, "/settings");
  await page
    .getByLabel("Interface language", { exact: true })
    .selectOption("ne");
  await expect(page.locator("html")).toHaveAttribute("lang", "ne");
  await page.reload();
  await expect(
    page.getByLabel("Interface language", { exact: true }),
  ).toHaveValue("ne");
  await page
    .getByLabel("Interface language", { exact: true })
    .selectOption("bho");
  await expect(page.locator("html")).toHaveAttribute("lang", "bho");
  await page
    .getByLabel("Interface language", { exact: true })
    .selectOption("en");
  await page.locator("#demo-role").selectOption("system_admin");
  await page
    .getByRole("button", { name: "Search all records", exact: true })
    .click();
  await page.getByLabel("Global record search", { exact: true }).fill("Sunita");
  await expect(
    page.getByRole("dialog").getByText("Sunita Devi", { exact: true }),
  ).toHaveCount(0);
});

test("duplicate registration creates a review and preserves both identities", async ({
  page,
}) => {
  await ready(page, "/mothers");
  await page
    .getByRole("button", { name: "Register mother", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Name or local identifier", { exact: true })
    .fill("Sunita Devi");
  await expect(dialog.getByText(/Possible existing record/)).toBeVisible();
  await dialog
    .getByLabel("Settlement", { exact: true })
    .fill("Synthetic duplicate review");
  await dialog.getByRole("checkbox").check();
  await save(page);
  await page.getByLabel("Search mothers").fill("Sunita Devi");
  await expect(
    page.getByRole("button", { name: "Open Sunita Devi", exact: true }),
  ).toHaveCount(2);
  await ready(page, "/review");
  await expect(
    page.getByText(/Similar name found during registration/),
  ).toBeVisible();
});

test("consent withdrawal suppresses optional follow-ups and creates a handling review", async ({
  page,
}) => {
  await ready(page, "/mothers/10000000-0000-4000-8000-000000000101");
  await page
    .getByRole("button", { name: "Record a consent change", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Consent change reason", { exact: true })
    .fill("Synthetic withdrawal from optional digital participation");
  await save(page);
  await page.reload();
  await expect(page.getByText("withdrawn", { exact: true })).toBeVisible();
  await ready(page, "/follow-ups");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page
    .getByLabel("Search follow-ups", { exact: true })
    .fill("Rina Kumari");
  await expect(
    page.getByRole("button", {
      name: "Record outcome for Rina Kumari",
      exact: true,
    }),
  ).toHaveCount(0);
  await ready(page, "/review");
  await expect(
    page.getByText(/Digital participation withdrawn or declined/),
  ).toBeVisible();
});

test("core screens and the child form fit 360px and pass automated accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of [
    "/mothers",
    "/children/10000000-0000-4000-8000-000000000300",
    "/follow-ups",
    "/calendar",
    "/review",
    "/settings",
  ]) {
    await ready(page, path);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      path,
    ).toBeLessThanOrEqual(360);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      path,
    ).toEqual([]);
  }
  await ready(page, "/children");
  await page.getByRole("button", { name: "Add child", exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: "artifacts/child-form-mobile.png",
    fullPage: true,
  });
});
