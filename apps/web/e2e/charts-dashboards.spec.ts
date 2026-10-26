import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://localhost:3001";

async function resetDashboards(request: APIRequestContext) {
  const response = await request.get(`${API}/api/dashboards`);
  const body = (await response.json()) as {
    dashboards: Array<{ id: string }>;
  };

  for (const dashboard of body.dashboards) {
    await request.delete(`${API}/api/dashboards/${dashboard.id}`);
  }
}

test("builds a chart in explore and saves a filtered dashboard", async ({
  page,
  request,
}) => {
  // The UI needs current metadata and a saved model; the test owns both so it
  // does not depend on whichever spec ran before it.
  await request.post(`${API}/api/source/sync`);

  const exampleResponse = await request.get(`${API}/api/semantic/example`);
  const example = (await exampleResponse.json()) as { model: unknown };
  const saved = await request.put(`${API}/api/semantic/model`, {
    data: example.model,
  });
  expect(saved.ok()).toBeTruthy();

  await resetDashboards(request);

  // ---------- Explore: build a bar chart from the semantic model ----------
  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();

  // The default starts on the fact dataset's first metric; pick revenue by
  // product_category so the numbers are the familiar Acme ones.
  await page.getByRole("combobox", { name: "Metric" }).click();
  await page.getByRole("option", { name: /^revenue/ }).click();
  await expect(page.getByLabel("Title")).toHaveValue("revenue");

  await page.getByRole("combobox", { name: "Dimension", exact: true }).click();
  await page.getByRole("option", { name: /product_category/ }).click();

  await expect(page.getByText("7 row(s)")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("canvas").first()).toBeVisible();

  // ---------- Dashboards: create, add widgets, save, reload ----------
  await page.goto("/dashboards");
  await expect(page.getByRole("heading", { name: "Dashboards" })).toBeVisible();

  await page.getByRole("button", { name: "New dashboard" }).first().click();
  await page.getByLabel("Name").fill("Revenue overview e2e");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await page.waitForURL(/\/dashboards\/[0-9a-f-]{36}/);
  await expect(page.getByText("This canvas is empty")).toBeVisible();

  // A bar widget: revenue by category, with a title of its own.
  await page.getByRole("button", { name: "Add the first widget" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Metric" }).click();
  await page.getByRole("option", { name: /^revenue/ }).click();
  await page.getByLabel("Title").fill("Revenue by category");
  await dialog
    .getByRole("combobox", { name: "Dimension", exact: true })
    .click();
  await page.getByRole("option", { name: /product_category/ }).click();
  await dialog.getByRole("button", { name: "Add widget" }).click();

  // A KPI widget: a different dataset, so the batch has mixed facts.
  await page.getByRole("button", { name: "Add widget" }).click();
  await dialog.getByRole("combobox", { name: "Chart type" }).click();
  await page.getByRole("option", { name: "KPI" }).click();
  await page.getByLabel("Title").fill("Employees");
  await dialog.getByRole("combobox", { name: "Metric" }).click();
  await page.getByRole("option", { name: /headcount/ }).click();
  await dialog.getByRole("button", { name: "Add widget" }).click();

  await expect(page.locator(".widget-drag-handle")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Remove Revenue by category" }),
  ).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved version 2/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("All changes saved")).toBeVisible();

  // A reload proves the document (widgets + layout) came from the server.
  await page.reload();
  await expect(page.locator(".widget-drag-handle")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Remove Revenue by category" }),
  ).toBeVisible();

  // ---------- Dashboard filter: category = Audio, then persist it ----------
  const filtered = page.waitForResponse((response) => {
    if (!response.url().includes("/api/charts/execute")) return false;
    if (!response.ok()) return false;

    const body = response.request().postDataJSON() as {
      filters?: { categorical?: { value?: unknown } };
    };

    return body.filters?.categorical?.value === "Audio";
  });

  await page.getByRole("combobox", { name: "Category dimension" }).click();
  await page.getByRole("option", { name: /product_category/ }).click();
  await page.getByLabel("Category value").fill("Audio");

  const filteredResults = (await (await filtered).json()) as {
    results: Array<{ ok: boolean; result?: { rows: Array<{ product_category?: string }> } }>;
  };

  // The bar narrows to one category; the KPI on another dataset is untouched
  // because order_items can reach product_category but employees cannot.
  expect(filteredResults.results[0]?.result?.rows).toEqual([
    expect.objectContaining({ product_category: "Audio" }),
  ]);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved version 3/)).toBeVisible({
    timeout: 15_000,
  });

  const replaced = page.waitForResponse((response) => {
    if (!response.url().includes("/api/charts/execute")) return false;
    if (!response.ok()) return false;

    const body = response.request().postDataJSON() as {
      filters?: { categorical?: { value?: unknown } };
    };

    return body.filters?.categorical?.value === "Audio";
  });

  await page.reload();
  await expect(page.getByLabel("Category value")).toHaveValue("Audio");

  const reloadedResults = (await (await replaced).json()) as {
    results: Array<{ result?: { rows: unknown[] } }>;
  };
  expect(reloadedResults.results[0]?.result?.rows).toHaveLength(1);

  // The filter is part of the document, so the bar stays filtered after the
  // page is reloaded from the server. Clean up what this test created.
  await resetDashboards(request);
});
