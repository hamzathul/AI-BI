import { expect, test } from "@playwright/test";

const API = "http://localhost:3001";

test("loads, validates, saves, and reloads the Acme semantic example", async ({
  page,
  request,
}) => {
  // The editor needs current metadata, and the test owns the saved model.
  await request.post(`${API}/api/source/sync`);
  await request.delete(`${API}/api/semantic/model`);

  await page.goto("/semantic");
  await expect(
    page.getByRole("heading", { name: "Semantic model" }),
  ).toBeVisible();

  const editor = page.getByTestId("semantic-json-editor");
  await expect(editor).toHaveValue(/"datasets": \[\]/);

  await page.getByRole("button", { name: "Load example" }).click();
  await expect(editor).toHaveValue(/"name": "Acme Inc\."/);
  await expect(page.getByTestId("semantic-status")).toHaveText(
    "No model saved",
  );

  await page.getByRole("button", { name: "Validate" }).click();
  await expect(
    page.getByText("Valid: 6 datasets, 11 dimensions, 11 metrics, 4 joins."),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Save model" }).click();
  await expect(page.getByTestId("semantic-status")).toHaveText(
    /Saved model/,
    { timeout: 15_000 },
  );

  await page.reload();
  await expect(page.getByTestId("semantic-status")).toHaveText(
    /Saved model/,
  );
  await expect(editor).toHaveValue(/"name": "Acme Inc\."/);

  await request.delete(`${API}/api/semantic/model`);
});
