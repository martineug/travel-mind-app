import { test, expect } from '@playwright/test';
import { AuthPage, randomTraveller } from '../pages/auth-page';
import { TripsPage } from '../pages/trips-page';

test.describe('trip management', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.signUp(randomTraveller('trips'));
    // A fresh account's single trip is still named "My First Trip", so the wizard
    // auto-launches for it on load — dismiss it so the tab bar itself is clickable.
    await new TripsPage(page).dismissAutoLaunchedWizardIfOpen();
  });

  test('create, rename, and delete a trip', async ({ page }) => {
    const trips = new TripsPage(page);

    await trips.openNewTripWizard();
    await expect(trips.tab('New Trip')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await trips.renameTrip('New Trip', 'Rome Getaway');

    const before = await trips.tripCount();
    await trips.deleteTrip('Rome Getaway');
    await expect(trips.tab('Rome Getaway')).toBeHidden();
    expect(await trips.tripCount()).toBe(before - 1);
  });

  test('deleting the last remaining trip auto-recreates a default one, with no connection error', async ({ page }) => {
    const trips = new TripsPage(page);

    // A fresh account starts with exactly one trip ("My First Trip") — delete it.
    expect(await trips.tripCount()).toBe(1);
    await page.locator('.tab').first().locator('.tab-close').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    // The wizard auto-launches for the recreated trip — not a "Connection error" bubble.
    await expect(page.locator('.wizard-card')).toBeVisible();
    await expect(page.getByText(/connection error/i)).toHaveCount(0);
    expect(await trips.tripCount()).toBe(1);

    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
