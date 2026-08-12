import { Page, Locator, expect } from '@playwright/test';

/** Drives the active chat panel: sending a message, waiting for mock search results to
 *  render, and completing the passenger-picker (+ mock payment, for flights) booking flow. */
export class ChatPanelPage {
  private readonly root: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('app-chat-panel');
  }

  async sendSuggestion(text: string): Promise<void> {
    await this.root.locator('.chip', { hasText: text }).click();
  }

  flightCards(): Locator {
    return this.root.locator('.fc');
  }

  stayCards(): Locator {
    return this.root.locator('.sc');
  }

  carCards(): Locator {
    return this.root.locator('.cc');
  }

  async waitForResults(cards: Locator): Promise<void> {
    // A cold first tool-calling turn with thinking enabled (OLLAMA_ENABLE_THINKING=true) can
    // comfortably exceed a minute — give this specific wait plenty of room.
    await expect(cards.first()).toBeVisible({ timeout: 180_000 });
  }

  async selectFirstResult(cards: Locator): Promise<void> {
    await cards.first().locator('.book-btn').click();
  }

  /** Self is pre-ticked by the passenger picker on open — for a single-traveller search
   *  (this suite's default) that alone already satisfies min/max, so just confirm. */
  async confirmPicker(confirmLabel: string): Promise<void> {
    const sheet = this.page.locator('.pp-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: confirmLabel, exact: true }).click();
  }

  async confirmMockPayment(): Promise<void> {
    const payOverlay = this.page.locator('.pay-overlay');
    await expect(payOverlay).not.toHaveClass(/pay-overlay--hidden/);
    await this.page.locator('.mock-pay-btn').click();
    await expect(payOverlay).toHaveClass(/pay-overlay--hidden/, { timeout: 30_000 });
  }
}
