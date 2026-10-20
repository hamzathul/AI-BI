import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("tests the source, syncs metadata, and browses employees", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/source$/);
  await expect(
    page.getByRole("heading", { name: "Source database" }),
  ).toBeVisible();
  await expect(page.getByText("acme", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByTestId("connection-result")).toContainText(
    "Read-only role",
    { timeout: 15_000 },
  );

  await page.getByRole("button", { name: "Sync metadata" }).click();
  await expect(page.getByTestId("sync-result")).toContainText("objects", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("last-sync-status")).toHaveText(/SUCCEEDED/);

  await page.getByRole("link", { name: "Browse metadata" }).click();
  await expect(page).toHaveURL(/\/metadata$/);
  await expect(page.getByTestId("metadata-browser")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "hr.employees" }).click();
  await expect(page.getByText("hr.employees", { exact: true })).toBeVisible();
  await expect(page.getByText("salary", { exact: true })).toBeVisible();
  await expect(page.getByText("numeric(10,2)", { exact: true })).toBeVisible();

  const departmentColumn = page.getByRole("row", { name: /department_id/ });
  await expect(departmentColumn.getByText("FK")).toBeVisible();
});
