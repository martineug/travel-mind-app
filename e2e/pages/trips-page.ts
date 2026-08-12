import { Page, expect } from '@playwright/test';

export class TripsPage {
  constructor(private readonly page: Page) {}

  tab(tripName: string) {
    return this.page.locator('.tab').filter({ hasText: tripName });
  }

  async openNewTripWizard(): Promise<void> {
    await this.page.getByTitle('New trip').click();
  }

  /** A brand-new account's only trip is still named "My First Trip", so the wizard
   *  auto-launches for it on first load (see maybeAutoLaunchWizard) — dismiss it before
   *  any test that needs the tab bar itself clickable. */
  async dismissAutoLaunchedWizardIfOpen(): Promise<void> {
    const wizard = this.page.locator('.wizard-card');
    if (await wizard.isVisible().catch(() => false)) {
      await this.page.getByRole('button', { name: 'Cancel' }).click();
      await expect(wizard).toBeHidden();
    }
  }

  async renameTrip(tripName: string, newName: string): Promise<void> {
    await this.tab(tripName).click({ button: 'right' });
    await this.page.getByRole('button', { name: 'Rename' }).click();
    await this.page.locator('.popup-input').fill(newName);
    await this.page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(this.tab(newName)).toBeVisible();
  }

  async deleteTrip(tripName: string): Promise<void> {
    await this.tab(tripName).locator('.tab-close').click();
    await this.page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(this.page.locator('.popup-title', { hasText: 'Delete Trip' })).toBeHidden();
  }

  async tripCount(): Promise<number> {
    return this.page.locator('.tab').count();
  }
}
