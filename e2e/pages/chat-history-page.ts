import { Page } from '@playwright/test';

export class ChatHistoryPage {
  constructor(private readonly page: Page) {}

  /** Opens a brand-new chat of the given vertical directly (no wizard) — the fastest way to
   *  reach a search-ready chat when the wizard's own flow isn't what's under test. */
  async startNewChat(agentLabel: 'Flights' | 'Stays' | 'Cars'): Promise<void> {
    await this.page.locator('.new-chat-btn').click();
    await this.page.locator('.agent-choice', { hasText: agentLabel }).click();
  }
}
