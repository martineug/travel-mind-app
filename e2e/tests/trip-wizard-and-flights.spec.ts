import { test, expect } from '@playwright/test';
import { AuthPage, randomTraveller } from '../pages/auth-page';
import { TripWizardPage } from '../pages/trip-wizard-page';
import { ChatPanelPage } from '../pages/chat-panel-page';
import { ItineraryPanelPage } from '../pages/itinerary-panel-page';

// Requires Ollama running locally with the configured model (same as `npm run dev`).
// Duffel is mocked (USE_MOCK_FLIGHTS=true), so once the agent calls flight_search at all,
// the rendered cards always match server/src/mocks/flight-mock.ts's MOCK_FLIGHTS fixture —
// assertions target that fixed data, never the assistant's own wording.
test('trip wizard -> flights-only search -> book -> shows in itinerary', async ({ page }) => {
  // This test chains three real LLM turns (basics extraction, summary phrasing, search
  // kickoff) — well beyond the config default given thinking is enabled (OLLAMA_ENABLE_THINKING).
  test.setTimeout(360_000);

  const auth = new AuthPage(page);
  await auth.goto();
  await auth.signUp(randomTraveller('wizard-flights'));

  // A fresh account's only trip is still named "My First Trip", so the wizard auto-launches
  // for it on load (see maybeAutoLaunchWizard) — use that instance directly rather than
  // opening a second one via "+ New Trip".
  const wizard = new TripWizardPage(page);

  // "1 traveller" keeps the passenger picker to just the pre-ticked account holder below —
  // a multi-traveller trip would need extra picker interaction this golden path doesn't cover.
  await wizard.sendBasicsMessage('Just 1 traveller, heading to Paris');
  await wizard.completeTripDatesStep(['Flights']);
  await wizard.continuePastVerticalFields('Departing From');
  await wizard.startSearching();

  const chat = new ChatPanelPage(page);
  const cards = chat.flightCards();
  await chat.waitForResults(cards);

  // Fixture data from MOCK_FLIGHTS — deterministic regardless of the LLM's exact search params.
  await expect(cards.first()).toContainText('Aer Lingus');
  await expect(cards.first()).toContainText('89');

  await chat.selectFirstResult(cards);
  await chat.confirmPicker('Continue to payment');
  await chat.confirmMockPayment();

  const itinerary = new ItineraryPanelPage(page);
  await itinerary.expectBookingCard('flights', 'Aer Lingus');
});
