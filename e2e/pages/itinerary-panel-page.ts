import { Page, Locator, expect } from '@playwright/test';

export class ItineraryPanelPage {
  private readonly root: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('app-itinerary-panel');
  }

  async expectBookingCard(kind: 'flights' | 'stays' | 'cars', text: string): Promise<void> {
    const card = this.root.locator(`.booking-card.agent-${kind}`, { hasText: text });
    await expect(card).toBeVisible({ timeout: 30_000 });
  }
}
