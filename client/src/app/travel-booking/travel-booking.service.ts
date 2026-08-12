import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AgentType } from './models/agent-type';
import { Traveller, TravellersResponse } from './models/traveller';
import { InitiateBookingResponse, PaymentIntentData, ConfirmBookingResponse, FlightBookingSummary } from './models/flight';
import { StayBookingResult, StayBookingSummary } from './models/stay';
import { CarBookingResult, CarBookingSummary } from './models/car';
import { WizardAnswer } from './models/wizard-question';
import {
  ChatbotMessageResponse, ChatbotStateResponse, ChatPreview, SwitchChatResponse, NewChatResponse,
  DeleteChatResponse, VerticalSearchJob, EditSearchQuestionsResponse, EditSearchSubmitResponse,
} from './models/chat';
import { UserTrip, SwitchTripResponse } from './models/trip';
import { TripIntakeMessage, TripIntakeBasicsResponse, TripIntakeQuestionsResponse, TripIntakeSummaryResponse } from './models/trip-intake';
import { AirportSuggestResponse } from './models/airport';

@Injectable({ providedIn: 'root' })
export class TravelBookingService {
  private readonly baseUrl = environment.apiUrl;

  private readonly currentChatIdSubject = new BehaviorSubject<string | null>(null);
  readonly currentChatId$ = this.currentChatIdSubject.asObservable();

  private readonly currentTripIdSubject = new BehaviorSubject<string | null>(null);
  readonly currentTripId$ = this.currentTripIdSubject.asObservable();

  private readonly chatUpdatedSubject = new Subject<void>();
  readonly chatUpdated$ = this.chatUpdatedSubject.asObservable();

  /** Chat ids with a message in flight — fired via sendMessageForChat, used by every
   *  fire-and-forget send site (chat-panel, wizard kickoffs, "Edit search" restart).
   *  Tracked here, not per-component, so pending state survives switching away and back. */
  private readonly pendingChatIdsSubject = new BehaviorSubject<ReadonlySet<string>>(new Set());
  readonly pendingChatIds$ = this.pendingChatIdsSubject.asObservable();

  /** Chat ids whose last sendMessageForChat errored (e.g. a Docker-only nginx timeout under
   *  concurrent vertical kickoffs) — surfaced so a stuck pill shows a retry affordance instead
   *  of silently clearing, see retryChat(). */
  private readonly failedChatIdsSubject = new BehaviorSubject<ReadonlySet<string>>(new Set());
  readonly failedChatIds$ = this.failedChatIdsSubject.asObservable();

  /** Optimistic user-message text for each pending chat, so switching to it mid-flight still
   *  shows what was asked — the server hasn't persisted it yet, so this is the only copy. */
  private readonly pendingMessageText = new Map<string, string>();

  private readonly bookingCreatedSubject = new Subject<void>();
  readonly bookingCreated$ = this.bookingCreatedSubject.asObservable();

  constructor(private http: HttpClient) {}

  setCurrentChatId(chatId: string): void {
    this.currentChatIdSubject.next(chatId);
  }

  setCurrentTripId(tripId: string): void {
    this.currentTripIdSubject.next(tripId);
  }

  getCurrentTripId(): string | null {
    return this.currentTripIdSubject.getValue();
  }

  notifyChatUpdated(): void {
    this.chatUpdatedSubject.next();
  }

  sendMessage(prompt: string, chatId?: string): Observable<ChatbotMessageResponse> {
    return this.http.post<ChatbotMessageResponse>(
      `${this.baseUrl}/chatbot/message`,
      chatId ? { prompt, chatId } : { prompt },
      { withCredentials: true },
    );
  }

  getChatbotState(): Observable<ChatbotStateResponse> {
    return this.http.get<ChatbotStateResponse>(`${this.baseUrl}/chatbot`, { withCredentials: true });
  }

  switchChat(chatId: string): Observable<SwitchChatResponse> {
    return this.http.get<SwitchChatResponse>(`${this.baseUrl}/chatbot/chats/${chatId}`, { withCredentials: true });
  }

  newChat(agentType: AgentType, description?: string, answers?: Record<string, WizardAnswer>): Observable<NewChatResponse> {
    return this.http.post<NewChatResponse>(
      `${this.baseUrl}/chatbot/chats`,
      { agentType, ...(description ? { description } : {}), ...(answers ? { answers } : {}) },
      { withCredentials: true },
    );
  }

  reorderChats(chatIds: string[]): Observable<{ chats: ChatPreview[] }> {
    return this.http.patch<{ chats: ChatPreview[] }>(
      `${this.baseUrl}/chatbot/chats`,
      { chatIds },
      { withCredentials: true },
    );
  }

  deleteChat(chatId: string): Observable<DeleteChatResponse> {
    return this.http.delete<DeleteChatResponse>(`${this.baseUrl}/chatbot/chats/${chatId}`, { withCredentials: true });
  }

  getTrips(): Observable<UserTrip[]> {
    return this.http.get<UserTrip[]>(`${this.baseUrl}/trips`, { withCredentials: true });
  }

  createTrip(tripName: string): Observable<UserTrip> {
    return this.http.post<UserTrip>(`${this.baseUrl}/trips`, { tripName }, { withCredentials: true });
  }

  renameTrip(tripId: string, tripName: string): Observable<UserTrip> {
    return this.http.patch<UserTrip>(`${this.baseUrl}/trips/${tripId}`, { tripName }, { withCredentials: true });
  }

  deleteTrip(tripId: string): Observable<{ recreatedTrip: UserTrip | null }> {
    return this.http.delete<{ recreatedTrip: UserTrip | null }>(`${this.baseUrl}/trips/${tripId}`, { withCredentials: true });
  }

  switchTrip(tripId: string): Observable<SwitchTripResponse> {
    return this.http.put<SwitchTripResponse>(`${this.baseUrl}/chatbot/current-trip`, { tripId }, { withCredentials: true }).pipe(
      tap(response => {
        this.currentTripIdSubject.next(response.currentTripId);
        this.currentChatIdSubject.next(response.currentChatId);
      }),
    );
  }

  confirmBooking(data: PaymentIntentData): Observable<ConfirmBookingResponse> {
    return this.http.post<ConfirmBookingResponse>(`${this.baseUrl}/flights/bookings/confirm`, {
      offer_id:           data.offer_id,
      passengers:         data.passengers,
      payment_intent_id:  data.payment_intent_id,
      trip_id:            data.trip_id,
      chat_id:            data.chat_id,
    }, { withCredentials: true }).pipe(tap(() => this.bookingCreatedSubject.next()));
  }

  /** The account holder plus every traveller they've booked for before, for the picker. */
  getTravellers(): Observable<TravellersResponse> {
    return this.http.get<TravellersResponse>(`${this.baseUrl}/travellers`, { withCredentials: true });
  }

  /** Creates the payment intent for a chosen offer + explicitly selected passengers, straight
   *  to the API (never through the LLM). Unsaved travellers are remembered server-side. */
  initiateFlightBooking(
    offerId: string, passengers: Traveller[], chatId: string, flightLabel: string,
  ): Observable<InitiateBookingResponse> {
    return this.http.post<InitiateBookingResponse>(
      `${this.baseUrl}/flights/bookings/initiate`,
      { offer_id: offerId, passengers, chat_id: chatId, flight_label: flightLabel },
      { withCredentials: true },
    );
  }

  /** Books a car outright for an explicitly chosen driver — same client-driven pattern as
   *  initiateFlightBooking, but no card payment, so this completes the booking directly. */
  bookCar(
    rateId: string, pickupDate: string, dropoffDate: string, driver: Traveller,
    chatId: string, tripId: string, carLabel: string,
  ): Observable<CarBookingResult> {
    return this.http.post<CarBookingResult>(
      `${this.baseUrl}/cars/bookings`,
      {
        rate_id: rateId, pickup_date: pickupDate, dropoff_date: dropoffDate,
        driver, chat_id: chatId, trip_id: tripId, car_label: carLabel,
      },
      { withCredentials: true },
    ).pipe(tap(() => this.bookingCreatedSubject.next()));
  }

  /** Books a stay outright for explicitly chosen guests (lead guest first, who becomes the
   *  booking's contact) — same client-driven pattern as bookCar. */
  bookStay(
    rateId: string, checkInDate: string, checkOutDate: string, guests: Traveller[],
    chatId: string, tripId: string, stayLabel: string,
  ): Observable<StayBookingResult> {
    return this.http.post<StayBookingResult>(
      `${this.baseUrl}/stays/bookings`,
      {
        rate_id: rateId, check_in_date: checkInDate, check_out_date: checkOutDate,
        guests, chat_id: chatId, trip_id: tripId, stay_label: stayLabel,
      },
      { withCredentials: true },
    ).pipe(tap(() => this.bookingCreatedSubject.next()));
  }

  /** Records the payment sheet was closed without paying, so it won't re-open on the next load. */
  cancelPayment(chatId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.baseUrl}/chatbot/chats/${chatId}/cancel-payment`,
      {},
      { withCredentials: true },
    );
  }

  getFlightBookings(tripId: string): Observable<FlightBookingSummary[]> {
    return this.http.get<FlightBookingSummary[]>(`${this.baseUrl}/trips/${tripId}/bookings/flights`, { withCredentials: true });
  }

  getStayBookings(tripId: string): Observable<StayBookingSummary[]> {
    return this.http.get<StayBookingSummary[]>(`${this.baseUrl}/trips/${tripId}/bookings/stays`, { withCredentials: true });
  }

  getCarBookings(tripId: string): Observable<CarBookingSummary[]> {
    return this.http.get<CarBookingSummary[]>(`${this.baseUrl}/trips/${tripId}/bookings/cars`, { withCredentials: true });
  }

  sendTripIntakeBasicsMessage(history: TripIntakeMessage[], message: string): Observable<TripIntakeBasicsResponse> {
    return this.http.post<TripIntakeBasicsResponse>(
      `${this.baseUrl}/trip-intake/message`,
      { history, message },
      { withCredentials: true },
    );
  }

  getTripIntakeVerticalQuestions(
    destination: string, travellerCount: number, departureDate: string, returnDate: string, verticals: AgentType[],
  ): Observable<TripIntakeQuestionsResponse> {
    return this.http.post<TripIntakeQuestionsResponse>(
      `${this.baseUrl}/trip-intake/vertical-questions`,
      { destination, travellerCount, departureDate, returnDate, verticals },
      { withCredentials: true },
    );
  }

  getTripIntakeSummary(
    destination: string, travellerCount: number, verticals: AgentType[], answers: Record<string, WizardAnswer>,
  ): Observable<TripIntakeSummaryResponse> {
    return this.http.post<TripIntakeSummaryResponse>(
      `${this.baseUrl}/trip-intake/summary`,
      { destination, travellerCount, verticals, answers },
      { withCredentials: true },
    );
  }

  /** Fires a message for chatId independently of the caller's lifecycle — don't await/subscribe.
   *  Marks chatId pending (with optimistic text) so any component showing that chat reflects
   *  "still waiting"; settlement is reflected via pendingChatIds$/chatUpdated$ on success, or
   *  failedChatIds$ on error (see retryChat() for how a failure gets resolved). */
  sendMessageForChat(chatId: string, text: string): void {
    this.addPendingChat(chatId);
    this.removeFailedChat(chatId);
    this.pendingMessageText.set(chatId, text);

    this.sendMessage(text, chatId).subscribe({
      next: () => this.resolvePendingChat(chatId),
      error: () => this.failPendingChat(chatId),
    });
  }

  /** In-flight (or failed, awaiting retry) optimistic text for a chat — used to redisplay what
   *  was asked before the server persists it, and to resend on retryChat(). */
  getPendingMessageText(chatId: string): string | null {
    return this.pendingMessageText.get(chatId) ?? null;
  }

  /** Fires each job's kickoff message in parallel — a thin wrapper over sendMessageForChat. */
  startVerticalKickoffs(jobs: VerticalSearchJob[]): void {
    for (const job of jobs) {
      this.sendMessageForChat(job.chatId, job.kickoffMessage);
    }
  }

  /** Retries a chat left in failedChatIds$. The original request's server-side agent run isn't
   *  cancelled just because the HTTP connection was lost (e.g. an nginx timeout) — it can still
   *  complete and persist its reply after the client gave up. So this checks the chat's current
   *  messages first: if a reply has already landed, just clear the failed flag and refresh
   *  instead of resending, to avoid firing a duplicate kickoff on top of one that actually worked. */
  retryChat(chatId: string): void {
    const text = this.pendingMessageText.get(chatId);
    if (!text) return;

    this.switchChat(chatId).subscribe({
      next: (res) => {
        const alreadyAnswered = res.messages.some(m => m.role === 'assistant');
        if (alreadyAnswered) {
          this.pendingMessageText.delete(chatId);
          this.removeFailedChat(chatId);
          this.notifyChatUpdated();
        } else {
          this.sendMessageForChat(chatId, text);
        }
      },
      error: () => this.sendMessageForChat(chatId, text),
    });
  }

  private resolvePendingChat(chatId: string): void {
    this.removePendingChat(chatId);
    this.pendingMessageText.delete(chatId);
    this.notifyChatUpdated();
  }

  private failPendingChat(chatId: string): void {
    this.removePendingChat(chatId);
    this.addFailedChat(chatId);
    this.notifyChatUpdated();
  }

  private addPendingChat(chatId: string): void {
    const next = new Set(this.pendingChatIdsSubject.getValue());
    next.add(chatId);
    this.pendingChatIdsSubject.next(next);
  }

  private removePendingChat(chatId: string): void {
    const next = new Set(this.pendingChatIdsSubject.getValue());
    next.delete(chatId);
    this.pendingChatIdsSubject.next(next);
  }

  private addFailedChat(chatId: string): void {
    const next = new Set(this.failedChatIdsSubject.getValue());
    next.add(chatId);
    this.failedChatIdsSubject.next(next);
  }

  private removeFailedChat(chatId: string): void {
    const next = new Set(this.failedChatIdsSubject.getValue());
    next.delete(chatId);
    this.failedChatIdsSubject.next(next);
  }

  getEditSearchQuestions(chatId: string): Observable<EditSearchQuestionsResponse> {
    return this.http.get<EditSearchQuestionsResponse>(
      `${this.baseUrl}/chatbot/chats/${chatId}/edit-search`,
      { withCredentials: true },
    );
  }

  submitEditSearch(chatId: string, answers: Record<string, WizardAnswer>, description: string): Observable<EditSearchSubmitResponse> {
    return this.http.post<EditSearchSubmitResponse>(
      `${this.baseUrl}/chatbot/chats/${chatId}/edit-search`,
      { answers, description },
      { withCredentials: true },
    );
  }

  suggestAirports(query: string): Observable<AirportSuggestResponse> {
    return this.http.get<AirportSuggestResponse>(
      `${this.baseUrl}/airports/suggest`,
      { params: { query }, withCredentials: true },
    );
  }
}
