import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Login first
  await page.goto(process.env.BASE_URL!);
  await page.getByPlaceholder('Username').fill(process.env.TEST_USER!);
  await page.getByPlaceholder('Password').fill(process.env.TEST_PASS!);
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page).toHaveURL(/inventory\.html/);
});

test('dashboard renders products and has no console errors', async ({ page }) => {
  // Capture console errors (ignore warnings/info)
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Basic UI checks
  await expect(page.getByText('Products')).toBeVisible();

  const items = page.locator('.inventory_item');
  const count = await items.count();
  expect(count).toBeGreaterThan(0); // ✅ numeric assertion works in all PW versions

  // Sorting dropdown present
  await expect(page.locator('.product_sort_container')).toBeVisible();

  // Save a full-page screenshot as an artifact
  const snapPath = test.info().outputPath('after-login.png');
  await page.screenshot({ path: snapPath, fullPage: true });

  // Assert no console errors
  expect(
    consoleErrors,
    `Console errors found:\n${consoleErrors.join('\n')}`
  ).toHaveLength(0);
});

test('add to cart updates badge then remove clears it', async ({ page }) => {
  // Add first item to cart
  const addButtons = page.getByRole('button', { name: /add to cart/i });
  await addButtons.first().click();

  // Badge should show "1"
  const badge = page.locator('.shopping_cart_badge');
  await expect(badge).toHaveText('1');

  // Remove the same item (button toggles to "Remove")
  const removeButtons = page.getByRole('button', { name: /remove/i });
  await removeButtons.first().click();

  // Badge should disappear
  await expect(badge).toHaveCount(0);
});
