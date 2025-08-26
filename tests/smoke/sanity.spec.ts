import { test, expect } from '@playwright/test';

test('site is reachable', async ({ page }) => {
  await page.goto(process.env.BASE_URL!);
  // Basic check: page has some title text
  await expect(page).toHaveTitle(/.+/);
});
