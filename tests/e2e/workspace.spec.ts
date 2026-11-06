import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function ready(page: Page, path = "/") {
  await page.goto(path);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel("Loading workspace")).toHaveCount(0);
}
test("dashboard renders, navigation works, and desktop layout is captured", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await expect(
    page.getByText("Mothers in care", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A little follow-up goes a long way", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Mothers", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mothers", exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search mothers" }).fill("Sunita");
  await expect(
    page.getByRole("button", { name: "Open Sunita Devi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Rina Kumari", exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expect(
    page.getByText("Mothers in care", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("consented registration persists and remains searchable after reload", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Register mother", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name or local identifier", exact: true })
    .fill("Mina Test Family");
  await dialog
    .getByRole("textbox", { name: "Settlement", exact: true })
    .fill("Synthetic village");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await ready(page, "/mothers");
  await page
    .getByRole("textbox", { name: "Search mothers" })
    .fill("Mina Test Family");
  await page.getByRole("button", { name: "Open Mina Test Family" }).click();
  await expect(
    page.getByRole("heading", { name: "Mina Test Family", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No phone recorded", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Mina Test Family", exact: true }),
  ).toBeVisible();
});
test("an independent child with unknown DOB gets review rather than invented dates", async ({
  page,
}) => {
  await ready(page, "/children");
  await page.getByRole("button", { name: "Add child", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Child name", exact: true })
    .fill("Child With Unknown Date");
  await dialog
    .getByRole("textbox", { name: "Settlement", exact: true })
    .fill("Synthetic settlement");
  await dialog
    .getByRole("textbox", {
      name: "Guardian / person giving consent",
      exact: true,
    })
    .fill("Synthetic guardian");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search children" })
    .fill("Child With Unknown Date");
  await page
    .getByRole("button", { name: "Open Child With Unknown Date" })
    .click();
  await expect(
    page.getByText("Health-worker review needed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No approved schedule assigned", { exact: true }),
  ).toBeVisible();
});
test("reported vaccination requires a separate verification and keeps the source", async ({
  page,
}) => {
  await ready(page, "/children/10000000-0000-4000-8000-000000000300");
  await page.getByRole("button", { name: "Record care", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Record source", exact: true })
    .selectOption("caregiver_reported");
  await dialog
    .getByRole("combobox", { name: "Vaccine / dose", exact: true })
    .selectOption("fipv-1");
  await dialog
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Reported · unverified", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Verify event / })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Evidence checked / reason", exact: true })
    .fill("Inspected synthetic vaccination card with health worker.");
  await dialog
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Verify event / }),
  ).toHaveCount(0);
  await expect(page.getByText(/caregiver reported/).first()).toBeVisible();
});
test("offline registration survives a full offline reload", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Register mother", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Register mother", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name or local identifier", exact: true })
    .fill("Offline Test Mother");
  await dialog
    .getByRole("textbox", { name: "Settlement", exact: true })
    .fill("Offline village");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Mothers", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("textbox", { name: "Search mothers" })
    .fill("Offline Test Mother");
  await expect(
    page.getByRole("button", { name: "Open Offline Test Mother" }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeEnabled();
});
test("mobile layout, dialog keyboard semantics, and core accessibility", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await ready(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Register mother", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});
