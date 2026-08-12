import { Page, Locator, expect } from '@playwright/test';

/** Drives the new-trip wizard's phase machine (see trip-wizard.component.ts):
 *  basics (free-text, LLM) -> tripDates (dateRange + verticals, deterministic defaults) ->
 *  verticalQuestions (one step per included vertical, deterministic defaults) -> ready. */
export class TripWizardPage {
  private readonly root: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('.wizard-card');
  }

  async sendBasicsMessage(text: string): Promise<void> {
    await this.root.locator('.wizard-inp-row textarea').fill(text);
    await this.root.locator('.wizard-inp-row .sbtn').click();
    // The static trip-dates step only appears once the Basics LLM call has resolved.
    await expect(this.root.locator('.wq-range-field').first()).toBeVisible({ timeout: 60_000 });
  }

  /** Trip-dates is ONE step containing both the date-range calendar and the verticals
   *  multi-select (both questions share group: 'trip_dates' — see getTripDatesQuestions()).
   *  Unlike step 4's fields, departure_date/return_date have no default — the calendar must
   *  actually be clicked, or canProceed stays false and Continue stays disabled. Verticals
   *  defaults to all three checked, so only the unwanted ones need deselecting. Submitting
   *  this step is deterministic (no LLM call). */
  async completeTripDatesStep(verticalsToKeep: string[]): Promise<void> {
    // Open the calendar and pick two enabled day cells — first click sets the start,
    // second (later) click sets the end and auto-closes the picker (see selectRangeDate()).
    // The calendar itself renders through a CDK overlay portaled onto <body>, outside
    // .wizard-card's DOM subtree, so it's located via the page, not this.root.
    await this.root.locator('.wq-range-field').first().click();
    const days = this.page.locator('.wq-cal-day:not(.out):not([disabled])');
    await expect(days.first()).toBeVisible();
    const count = await days.count();
    await days.nth(Math.min(1, count - 1)).click();
    await days.nth(Math.min(6, count - 1)).click();

    for (const label of ['Flights', 'Stays', 'Cars']) {
      if (!verticalsToKeep.includes(label)) {
        await this.root.getByRole('button', { name: label, exact: true }).click();
      }
    }

    await this.root.locator('.wq-next').click();
  }

  /** Per-vertical fields step — all fields default (origin/destination/dates/etc from the
   *  known trip facts), so just wait for it to render then advance (this triggers the
   *  LLM-phrased summary call). */
  async continuePastVerticalFields(waitForLabel: string): Promise<void> {
    await expect(this.root.getByText(waitForLabel, { exact: true })).toBeVisible();
    await this.root.locator('.wq-next').click();
  }

  async startSearching(): Promise<void> {
    const button = this.root.getByRole('button', { name: 'Start searching' });
    await expect(button).toBeEnabled({ timeout: 60_000 });
    await button.click();
    await expect(this.root).toBeHidden({ timeout: 30_000 });
  }
}
