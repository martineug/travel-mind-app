import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  ChangeDetectorRef,
  NgZone,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  renderDuffelPaymentsCustomElement,
  onDuffelPaymentsSuccessfulPayment,
  onDuffelPaymentsFailedPayment,
} from '@duffel/components/custom-elements';
import { TravelBookingService } from '../travel-booking.service';
import { AgentType } from '../models/agent-type';
import { AgentResponse, ChatMessage } from '../models/chat';
import { Flight, PaymentIntentData } from '../models/flight';
import { Stay } from '../models/stay';
import { Car } from '../models/car';
import { Traveller, TravellersResponse } from '../models/traveller';
import { CHAT_PANEL_CONFIG } from './chat-panel-config';
import { AgentIconComponent } from '../agent-icon/agent-icon.component';
import { TravellerPickerComponent } from '../traveller-picker/traveller-picker.component';
import { parseAgentJson } from '../parse-agent-json';

export interface UiMessage {
  role: 'user' | 'bot';
  text: string;
  flights?: Flight[];
  stays?: Stay[];
  cars?: Car[];
  file?: { name: string; url: string };
  files?: { name: string; url: string }[];
  sources?: { title: string; url: string }[];
  /** Clickable follow-up suggestions shown under this message (e.g. after a booking
   *  confirms) — sends the exact text via useSuggestion, same as the greeting chips. */
  hints?: string[];
}

/** Shown under a booking confirmation bubble, so the user can act on what they just booked
 *  without having to type it. `destination` is optional since it isn't always known */
function buildPostBookingHints(destination?: string): string[] {
  const hints = ['Generate a PDF of my itinerary', 'Show me my files'];
  if (destination) hints.push(`What are the top things to do in ${destination}?`);
  return hints;
}

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, AgentIconComponent, TravellerPickerComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './chat-panel.component.html',
  styleUrls: ['./chat-panel.component.scss'],
})
export class ChatPanelComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('msgContainer') msgContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('textarea') textarea!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('paymentEl') paymentEl!: ElementRef<HTMLElement>;

  messages: UiMessage[] = [];
  inputText = '';
  busy = false;
  showChips = true;
  currentAgentType: AgentType = 'flights';
  pendingPayment: PaymentIntentData | null = null;

  // Person picker — opened by "Select this flight"/"Select this car" (see pickFlight/pickCar).
  pickerOpen = false;
  pickerMode: 'flight' | 'car' | 'stay' = 'flight';
  pickerFlight: Flight | null = null;
  pickerCar: Car | null = null;
  pickerStay: Stay | null = null;
  pickerTravellers: TravellersResponse | null = null;
  pickerBusy = false;
  pickerError: string | null = null;
  
  private paymentMounted = false;
  private currentChatId: string | null = null;
  private chatSub?: Subscription;
  private pendingSub?: Subscription;
  private lastMessageCount = 0;
  private pendingChatIds: ReadonlySet<string> = new Set();

  constructor(
    private svc: TravelBookingService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  get config() {
    return CHAT_PANEL_CONFIG[this.currentAgentType];
  }

  get isMockPayment(): boolean {
    return this.pendingPayment?.client_token.startsWith('mock_') ?? false;
  }

  ngOnInit(): void {
    
    onDuffelPaymentsSuccessfulPayment(() => this.ngZone.run(() => this.onCardPaid()));
    onDuffelPaymentsFailedPayment(() => this.ngZone.run(() => this.onCardFailed()));

    // Subscribe before the initial fetch (BehaviorSubject emits synchronously) so
    // loadMessages() knows a chat's pending state — avoids briefly showing the greeting.
    this.pendingSub = this.svc.pendingChatIds$.subscribe((ids) => {
      const chatId = this.currentChatId;
      const justResolved = chatId != null && this.pendingChatIds.has(chatId) && !ids.has(chatId);
      this.pendingChatIds = ids;

      // Only reload on this chat's own pending→resolved transition — a blanket reload could clobber an in-progress payment form.
      if (justResolved) {
        this.reloadCurrentChat();
      }
    });

    this.svc.getChatbotState().subscribe({
      next: (state) => {
        // Don't clobber a chat the user's already navigated away from before this initial fetch resolved.
        if (this.currentChatId !== null && this.currentChatId !== state.currentChatId) return;

        this.currentChatId = state.currentChatId;
        this.currentAgentType = state.currentAgentType;
        this.loadMessages(state.currentChatId, state.messages);
      },
      error: () => this.seedGreeting(),
    });

    this.chatSub = this.svc.currentChatId$.subscribe((chatId) => {
      if (!chatId || chatId === this.currentChatId) return;
      this.currentChatId = chatId;
      this.svc.switchChat(chatId).subscribe({
        next: (res) => {
          if (!this.isViewingChat(chatId)) return; // switched again before this resolved
          this.currentAgentType = res.currentAgentType;
          this.loadMessages(chatId, res.messages);
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.chatSub?.unsubscribe();
    this.pendingSub?.unsubscribe();
  }

  /** Every async chat-scoped handler checks this first — this is a single persistent
   *  instance, so a stale response must never land on whatever chat is on screen. */
  private isViewingChat(chatId: string): boolean {
    return chatId === this.currentChatId;
  }

  private reloadCurrentChat(): void {
    const chatId = this.currentChatId;
    if (!chatId) return;
    this.svc.switchChat(chatId).subscribe({
      next: (res) => {
        if (!this.isViewingChat(chatId)) return;
        this.currentAgentType = res.currentAgentType;
        this.loadMessages(chatId, res.messages);
      },
    });
  }

  /** Renders chatId's state from persisted messages plus (if pending) the optimistic text
   *  and typing indicator — one path covers every case, so switching away and back reconstructs correctly. */
  private loadMessages(chatId: string, serverMessages: ChatMessage[]): void {
    this.pendingPayment = null;
    this.paymentMounted = false;

    const isPending = this.pendingChatIds.has(chatId);

    if (serverMessages.length === 0 && !isPending) {
      this.busy = false;
      this.seedGreeting();
      this.showChips = true;
      this.cdr.detectChanges();
      return;
    }

    this.messages = serverMessages.map((m): UiMessage =>
      m.role === 'user'
        ? { role: 'user', text: this.displayUserText(m.content) }
        : this.parseBotMessage(m.content),
    );
    this.showChips = false;

    // If the chat's latest message is a still-unpaid "payment" action, restore the sheet
    // from persisted history — covers "just arrived" and "switched away and back" alike.
    const lastServerMessage = serverMessages[serverMessages.length - 1];
    if (lastServerMessage?.role === 'assistant') {
      const reply = parseAgentJson<AgentResponse>(lastServerMessage.content);
      if (reply?.action === 'payment' && reply.client_token && reply.payment_intent_id
        && reply.offer_id && reply.total && reply.currency && reply.passengers?.length) {
        const tripId = this.svc.getCurrentTripId();
        if (tripId) {
          this.pendingPayment = {
            client_token: reply.client_token,
            payment_intent_id: reply.payment_intent_id,
            offer_id: reply.offer_id,
            total: reply.total,
            currency: reply.currency,
            passengers: reply.passengers,
            trip_id: tripId,
            chat_id: chatId,
          };
        }
      }
    }

    if (isPending) {
      const pendingText = this.svc.getPendingMessageText(chatId);
      if (pendingText) {
        this.messages.push({ role: 'user', text: this.displayUserText(pendingText) });
      }
      this.busy = true;
    } else {
      this.busy = false;
    }

    this.cdr.detectChanges();
  }

  private seedGreeting(): void {
    this.messages = [{ role: 'bot', text: this.config.greeting }];
  }

  /** Kickoff messages start with one of these labels, then model-only instructions — only
   *  the lead line is shown here; persisted content is untouched, purely a display-time transform. */
  private static readonly KICKOFF_PREFIX_RE = /^(Flight Search|Stays Search|Car Search): /;

  private displayUserText(content: string): string {
    return ChatPanelComponent.KICKOFF_PREFIX_RE.test(content) ? content.split('\n\n')[0]! : content;
  }

  private parseBotMessage(content: string): UiMessage {
    const reply = parseAgentJson<AgentResponse>(content);
    return reply
      ? { role: 'bot', text: reply.message, flights: reply.flights, stays: reply.stays, cars: reply.cars, file: reply.file, files: reply.files, sources: reply.sources }
      : { role: 'bot', text: content };
  }

  ngAfterViewChecked(): void {
    if (this.messages.length !== this.lastMessageCount) {
      this.lastMessageCount = this.messages.length;
      this.scrollToBottom();
    }
    this.mountPaymentForm();
  }

  private mountPaymentForm(): void {
    if (!this.pendingPayment || this.paymentMounted || !this.paymentEl?.nativeElement) return;

    this.paymentMounted = true;

    if (this.isMockPayment) return;

    renderDuffelPaymentsCustomElement({
      paymentIntentClientToken: this.pendingPayment.client_token,
    });
  }

  private scrollToBottom(): void {
    try {
      const el = this.msgContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    } catch {}
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  autoResize(): void {
    const el = this.textarea.nativeElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 90) + 'px';
  }

  useSuggestion(chip: string): void {
    this.inputText = chip;
    this.send();
  }

  /** Opens the traveller picker rather than asking the agent to book — the booking then goes
   *  straight to the API (see onPassengersChosen), so traveller/payment data never touch the LLM. */
  pickFlight(flight: Flight): void {
    if (this.busy || this.pendingPayment) return;

    this.pickerMode = 'flight';
    this.pickerFlight = flight;
    this.pickerCar = null;
    this.pickerStay = null;
    this.pickerError = null;
    this.pickerBusy = false;
    this.pickerTravellers = null;
    this.pickerOpen = true;
    this.cdr.detectChanges();

    this.svc.getTravellers().subscribe({
      next: (res) => {
        this.pickerTravellers = res;
        this.cdr.detectChanges();
      },
      error: () => {
        this.pickerError = 'Could not load your saved passengers — please try again.';
        this.cdr.detectChanges();
      },
    });
  }

  closePicker(): void {
    this.pickerOpen = false;
    this.pickerFlight = null;
    this.pickerCar = null;
    this.pickerStay = null;
    this.pickerTravellers = null;
    this.cdr.detectChanges();
  }

  onPassengersChosen(passengers: Traveller[]): void {
    const flight = this.pickerFlight;
    const chatId = this.currentChatId;
    const tripId = this.svc.getCurrentTripId();
    if (!flight || !chatId || !tripId) return;

    this.pickerBusy = true;
    this.pickerError = null;
    this.cdr.detectChanges();

    const label = `${flight.airline}${flight.flight_number ? ' ' + flight.flight_number : ''}`;

    this.svc.initiateFlightBooking(flight._offer_id, passengers, chatId, label).subscribe({
      next: (res) => {
        this.pickerBusy = false;
        this.pickerOpen = false;
        this.pickerFlight = null;
        this.pendingPayment = {
          client_token: res.client_token,
          payment_intent_id: res.payment_intent_id,
          offer_id: res.offer_id,
          total: res.total,
          currency: res.currency,
          passengers: res.passengers,
          destination: flight.destination_city ?? flight.destination,
          trip_id: tripId,
          chat_id: chatId,
        };
        // The server persisted the same exchange; this just keeps the on-screen transcript in step.
        this.messages.push({ role: 'user', text: `Book the ${label} flight for ${this.formatTravellerNames(passengers)}` });
        this.messages.push({ role: 'bot', text: 'Ready to pay!' });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.pickerBusy = false;
        this.pickerError = err?.error?.error || 'Could not start the booking — please try again.';
        this.cdr.detectChanges();
      },
    });
  }

  /** Same client-driven pattern as pickFlight/pickCar — stays only require the lead guest. */
  pickStay(stay: Stay): void {
    if (this.busy || this.pendingPayment) return;

    this.pickerMode = 'stay';
    this.pickerStay = stay;
    this.pickerFlight = null;
    this.pickerCar = null;
    this.pickerError = null;
    this.pickerBusy = false;
    this.pickerTravellers = null;
    this.pickerOpen = true;
    this.cdr.detectChanges();

    this.svc.getTravellers().subscribe({
      next: (res) => {
        this.pickerTravellers = res;
        this.cdr.detectChanges();
      },
      error: () => {
        this.pickerError = 'Could not load your saved guests — please try again.';
        this.cdr.detectChanges();
      },
    });
  }

  private onGuestsChosen(guests: Traveller[]): void {
    const stay = this.pickerStay;
    const chatId = this.currentChatId;
    const tripId = this.svc.getCurrentTripId();
    if (!stay || !chatId || !tripId) return;

    this.pickerBusy = true;
    this.pickerError = null;
    this.cdr.detectChanges();

    this.svc.bookStay(stay._rate_id, stay.check_in, stay.check_out, guests, chatId, tripId, stay.name).subscribe({
      next: (res) => {
        this.pickerBusy = false;
        this.pickerOpen = false;
        this.pickerStay = null;
        const names = this.formatTravellerNames(guests);
        // The server persisted the same exchange; this keeps the transcript in step.
        this.messages.push({ role: 'user', text: `Book ${stay.name} for ${names}` });
        this.messages.push({
          role: 'bot',
          text: `Your stay at ${res.accommodation_name} is booked for ${names}! Booking reference: ${res.booking_reference}. Check-in ${res.check_in}, check-out ${res.check_out}. Total: ${res.total} ${res.currency}.`,
          hints: buildPostBookingHints(stay.city),
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.pickerBusy = false;
        this.pickerError = err?.error?.error || 'Could not book that stay — please try again.';
        this.cdr.detectChanges();
      },
    });
  }

  /** Same client-driven pattern as pickFlight, but for a car's single driver — no payment step, so submitting books outright. */
  pickCar(car: Car): void {
    if (this.busy || this.pendingPayment) return;

    this.pickerMode = 'car';
    this.pickerCar = car;
    this.pickerFlight = null;
    this.pickerStay = null;
    this.pickerError = null;
    this.pickerBusy = false;
    this.pickerTravellers = null;
    this.pickerOpen = true;
    this.cdr.detectChanges();

    this.svc.getTravellers().subscribe({
      next: (res) => {
        this.pickerTravellers = res;
        this.cdr.detectChanges();
      },
      error: () => {
        this.pickerError = 'Could not load your saved drivers — please try again.';
        this.cdr.detectChanges();
      },
    });
  }

  private onDriverChosen(driver: Traveller): void {
    const car = this.pickerCar;
    const chatId = this.currentChatId;
    const tripId = this.svc.getCurrentTripId();
    if (!car || !chatId || !tripId) return;

    this.pickerBusy = true;
    this.pickerError = null;
    this.cdr.detectChanges();

    const label = `${car.car_name} from ${car.supplier}`;

    this.svc.bookCar(car._rate_id, car.pickup_date, car.dropoff_date, driver, chatId, tripId, label).subscribe({
      next: (res) => {
        this.pickerBusy = false;
        this.pickerOpen = false;
        this.pickerCar = null;
        // The server persisted the same exchange; this keeps the on-screen transcript in step.
        this.messages.push({ role: 'user', text: `Book the ${label} car with ${driver.given_name} ${driver.family_name} driving` });
        this.messages.push({
          role: 'bot',
          text: `Your ${res.car_name} from ${res.supplier_name} is booked for ${driver.given_name} ${driver.family_name}! Booking reference: ${res.booking_reference}. Pick-up ${res.pickup_date}, drop-off ${res.dropoff_date}. Total: ${res.total} ${res.currency}.`,
          hints: buildPostBookingHints(car.pickup_location),
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.pickerBusy = false;
        this.pickerError = err?.error?.error || 'Could not book that car — please try again.';
        this.cdr.detectChanges();
      },
    });
  }

  /** The picker always emits a list; each vertical takes what it needs (flights: all as passengers, stays: all as guests, cars: the single driver). */
  onPickerSubmit(people: Traveller[]): void {
    if (this.pickerMode === 'car') {
      if (people[0]) this.onDriverChosen(people[0]);
    } else if (this.pickerMode === 'stay') {
      this.onGuestsChosen(people);
    } else {
      this.onPassengersChosen(people);
    }
  }

  /** Pushes an optimistic bubble, then hands off to sendMessageForChat, which tracks the
   *  request's lifecycle in the service — the reply is picked up later, never a direct subscribe. */
  send(): void {
    const text = this.inputText.trim();
    const chatId = this.currentChatId;
    if (!text || this.busy || !chatId) return;

    this.inputText = '';
    this.showChips = false;
    if (this.textarea) {
      this.textarea.nativeElement.style.height = 'auto';
    }

    this.messages.push({ role: 'user', text });
    this.busy = true;
    this.cdr.detectChanges();

    this.svc.sendMessageForChat(chatId, text);
  }

  onCardPaid(): void {
    if (!this.pendingPayment) return;
    this.busy = true;
    this.cdr.detectChanges();

    const travellerNames = this.formatTravellerNames(this.pendingPayment.passengers);
    const destination = this.pendingPayment.destination;
    this.svc.confirmBooking(this.pendingPayment).subscribe({
      next: (result) => {
        setTimeout(() => {
          this.pendingPayment = null;
          this.paymentMounted = false;
          this.messages.push({
            role: 'bot',
            text: `Your flight is booked for ${travellerNames}! Booking reference: ${result.booking_reference}. Total paid: ${result.total}. You'll receive your e-ticket(s) at the email(s) provided.`,
            hints: buildPostBookingHints(destination),
          });
          this.busy = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        setTimeout(() => {
          this.pendingPayment = null;
          this.paymentMounted = false;
          this.messages.push({ role: 'bot', text: 'Payment was taken but the booking failed. Please contact support with your payment reference.' });
          this.busy = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  onCardFailed(): void {
    this.pendingPayment = null;
    this.paymentMounted = false;
    this.messages.push({ role: 'bot', text: 'The payment was not completed. Would you like to try again?' });
    this.cdr.detectChanges();
  }

  dismissPayment(): void {
    const chatId = this.pendingPayment?.chat_id;

    this.pendingPayment = null;
    this.paymentMounted = false;
    this.messages.push({ role: 'bot', text: 'Payment cancelled. Let me know if you\'d like to try a different flight.' });
    this.cdr.detectChanges();

    // Persist the note server-side, else the chat's last message stays unpaid "payment" and
    // reopens on reload. Fire-and-forget — the sheet's already closed locally either way.
    if (chatId) this.svc.cancelPayment(chatId).subscribe({ error: () => {} });
  }

  currencySymbol(cur: string): string {
    return cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$';
  }

  formatTravellerNames(passengers: Traveller[]): string {
    const names = passengers.map(p => `${p.given_name} ${p.family_name}`);
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  stopClass(stops: number): string {
    return `s${Math.min(stops, 2)}`;
  }

  stopLabel(f: Flight): string {
    if (f.stops === 0) return 'Direct';
    if (f.stops === 1) return `1 stop${f.via ? ' via ' + f.via : ''}`;
    return `${f.stops} stops`;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
