import { expect, test } from "@playwright/test";

test("product images are served as immutable, versioned webp files", async ({
  page,
  request,
}) => {
  await page.goto("/de/collection/rolex-explorer-224270");
  const html = await page.content();
  const key = html.match(
    /\/media\/product\/rolex-explorer-224270\/\d{8}-\d{6}_v\d+_[a-f0-9]{8}\.webp/,
  )?.[0];
  expect(key, "versioned media URL on the product page").toBeDefined();

  const response = await request.get(key!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/webp");
  expect(response.headers()["cache-control"]).toContain("immutable");
});

for (const path of [
  "/media/..%2f..%2f.env.local",
  "/media/product/x/%2e%2e/%2e%2e/%2e%2e/.env.local",
  "/media/product/rolex/20261013-220805_v1_2a3acf12.webp%00.png",
  "/media/home/hero/20990101-000000_v1_deadbeef.webp",
  "/media/secret/hero/20990101-000000_v1_deadbeef.webp",
]) {
  test(`rejects unsafe or unknown media key ${path}`, async ({ request }) => {
    const response = await request.get(path);
    expect([400, 404]).toContain(response.status());
    expect(await response.text()).not.toContain("POSTGRES_PASSWORD");
  });
}
