import { test, expect } from '@playwright/test';
import { AuthPage, randomTraveller } from '../pages/auth-page';
import { TripsPage } from '../pages/trips-page';
import { ChatHistoryPage } from '../pages/chat-history-page';
import { ChatPanelPage } from '../pages/chat-panel-page';
import { ItineraryPanelPage } from '../pages/itinerary-panel-page';

// Requires Ollama running locally. Duffel stays/cars are mocked (USE_MOCK_STAYS/CARS=true),
// so once the agent calls the search tool at all, results always match the fixed fixtures in
// server/src/mocks/stay-mock.ts / car-mock.ts — assertions target that data, not LLM wording.
// Bypasses the trip wizard (already covered by trip-wizard-and-flights.spec.ts) via the
// chat-history "+ New" picker, to prove the search/book pattern generalizes per vertical.
test.describe('stays and cars', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.signUp(randomTraveller('stays-cars'));
    // A fresh account's single trip is still named "My First Trip", so the wizard
    // auto-launches for it on load — dismiss it so the chat-history panel is clickable.
    await new TripsPage(page).dismissAutoLaunchedWizardIfOpen();
  });

  test('stays: search -> book -> shows in itinerary', async ({ page }) => {
    const history = new ChatHistoryPage(page);
    const chat = new ChatPanelPage(page);

    await history.startNewChat('Stays');
    await chat.sendSuggestion('Stays near the Eiffel Tower');

    const cards = chat.stayCards();
    await chat.waitForResults(cards);
    await expect(cards.first()).toContainText('The Riverside Grand');

    await chat.selectFirstResult(cards);
    await chat.confirmPicker('Confirm booking');

    const itinerary = new ItineraryPanelPage(page);
    await itinerary.expectBookingCard('stays', 'The Riverside Grand');
  });

  test('cars: search -> book -> shows in itinerary', async ({ page }) => {
    const history = new ChatHistoryPage(page);
    const chat = new ChatPanelPage(page);

    await history.startNewChat('Cars');
    await chat.sendSuggestion('SUV rental in Dublin for a week');

    const cards = chat.carCards();
    await chat.waitForResults(cards);
    await expect(cards.first()).toContainText('Hertz');

    await chat.selectFirstResult(cards);
    await chat.confirmPicker('Confirm booking');

    // The itinerary card shows the car name, not the supplier (see itinerary-panel.component.html).
    const itinerary = new ItineraryPanelPage(page);
    await itinerary.expectBookingCard('cars', 'Volkswagen Golf');
  });
});
