import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Login before each test
  await page.goto(process.env.BASE_URL!);
  await page.getByPlaceholder('Username').fill(process.env.TEST_USER!);
  await page.getByPlaceholder('Password').fill(process.env.TEST_PASS!);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/inventory.html/);
});

test('can open menu and navigate to About', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Menu' }).click();
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL(/saucelabs.com/);
});

test('logout brings user back to login page', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Menu' }).click();
  await page.getByRole('link', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/saucedemo.com/);
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
});
