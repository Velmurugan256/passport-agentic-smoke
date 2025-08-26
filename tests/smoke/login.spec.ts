import { test, expect } from '@playwright/test';

test('login with valid credentials should land on products page', async ({ page }) => {
  await page.goto(process.env.BASE_URL!);

  // Fill login form
  await page.getByPlaceholder('Username').fill(process.env.TEST_USER!);
  await page.getByPlaceholder('Password').fill(process.env.TEST_PASS!);
  await page.getByRole('button', { name: 'Login' }).click();

  // Verify successful login → products page
  await expect(page).toHaveURL(/inventory.html/);
  await expect(page.getByText('Products')).toBeVisible();
});

test('login with invalid credentials should show error', async ({ page }) => {
  await page.goto(process.env.BASE_URL!);

  await page.getByPlaceholder('Username').fill('wrong');
  await page.getByPlaceholder('Password').fill('wrong');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByText(/Epic sadface/i)).toBeVisible();
});
