import { test, expect } from '@playwright/test';
import { AuthPage, randomTraveller } from '../pages/auth-page';

test.describe('auth', () => {
  test('signing up with a new account lands on the home screen', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.signUp(randomTraveller('signup'));

    await expect(page.locator('.tabs')).toBeVisible();
  });

  test('signing in with a wrong password shows an error and stays on /auth', async ({ page }) => {
    const auth = new AuthPage(page);
    const traveller = randomTraveller('wrongpw');
    await auth.goto();
    await auth.signUp(traveller);

    await page.context().clearCookies();
    await auth.goto();
    await auth.signIn(traveller.email, 'not-the-right-password');

    await auth.expectError(/invalid/i);
    await expect(page).toHaveURL('/auth');
  });

  test('an unauthenticated visit to / redirects to /auth', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');

    await expect(page).toHaveURL('/auth');
  });
});
