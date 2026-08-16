import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { from } from 'rxjs';
import { concatMap, map, toArray } from 'rxjs/operators';
import { WizardQuestionsComponent } from '../wizard-questions/wizard-questions.component';
import { TravelBookingService } from '../travel-booking.service';
import { AgentType } from '../models/agent-type';
import { TripIntakeMessage, TripIntakeSummary } from '../models/trip-intake';
import { VerticalSearchJob } from '../models/chat';
import { WizardAnswer, WizardQuestion } from '../models/wizard-question';
import { formatWizardAnswers } from '../format-wizard-answers';

interface WizardMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Client-driven phase machine: which phase comes next is decided from plain data here,
 *  never an LLM-authored action string (see sendMessage/onQuestionsSubmit). No path back
 *  from 'ready' — amending answers means reopening the wizard, not continuing to chat. */
type WizardPhase = 'basics' | 'tripDates' | 'verticalQuestions' | 'ready';

// Canonical vertical order (matches chat-history's picker). New chats land at the top
// (MIN(sort_order)-1), so verticals are created in reverse — the last one displays first.
const VERTICAL_DISPLAY_ORDER: AgentType[] = ['flights', 'stays', 'cars'];

// Reverse of server's VERTICAL_GROUP — every WizardQuestion is stamped with this group tag,
// used to split the flat step-4 answers back into per-vertical slices (see answersFor()).
const GROUP_TO_VERTICAL: Record<string, AgentType> = { flight: 'flights', stay: 'stays', car: 'cars' };

const GREETING = "Hi! Tell me about your trip — where are you headed and when, how many of you are travelling, and would you like me to search flights, stays, and/or cars?";

@Component({
  selector: 'app-trip-wizard',
  standalone: true,
  imports: [FormsModule, WizardQuestionsComponent],
  templateUrl: './trip-wizard.component.html',
  styleUrls: ['./trip-wizard.component.scss'],
})
export class TripWizardComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input({ required: true }) tripId!: string;
  @Input({ required: true }) currentTripName!: string;
  @Output() cancel = new EventEmitter<void>();
  @Output() renamed = new EventEmitter<void>();

  @ViewChild('tripNameInput') private tripNameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('msgContainer') private msgContainer?: ElementRef<HTMLDivElement>;

  readonly tripName = signal('');
  readonly history = signal<WizardMessage[]>([]);
  readonly summary = signal<TripIntakeSummary | null>(null);
  readonly activeQuestions = signal<WizardQuestion[] | null>(null);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly currentPhase = signal<WizardPhase>('basics');

  inputText = '';

  /** Captured once phase 1 confirms both are known; reused by submitTripDates/submitVerticalQuestions. */
  private readonly knownDestination = signal<string | null>(null);
  private readonly knownTravellerCount = signal<number | null>(null);

  /** Step 3's vertical picks, needed again at step 4 submit (buildTripIntakeSummary needs them). */
  private readonly selectedVerticals = signal<AgentType[] | null>(null);

  /** Caches step 4's batch so structured answers survive to createChatsAndKickoff — the wizard
   *  can't reach "Start searching" without submitting step 4 first (see answersFor()). */
  private readonly lastVerticalBatch = signal<{ questions: WizardQuestion[]; answers: Record<string, WizardAnswer> } | null>(null);

  private msgContainerResizeObserver?: ResizeObserver;

  constructor(private svc: TravelBookingService) {}

  ngOnInit(): void {
    this.tripName.set(this.currentTripName);
    this.history.set([{ role: 'assistant', content: GREETING }]);
    setTimeout(() => this.tripNameInput?.nativeElement.focus());
  }

  ngAfterViewInit(): void {
    // The message list is flex:1, so its available space shifts whenever its sibling below
    // (the wizard step or input row) changes height. Re-pin to the bottom whenever that
    // happens, same as after every new message.
    const el = this.msgContainer?.nativeElement;
    if (!el) return;

    this.msgContainerResizeObserver = new ResizeObserver(() => this.scrollToBottomSoon());
    this.msgContainerResizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.msgContainerResizeObserver?.disconnect();
  }

  canStartSearching(): boolean {
    return !!this.tripName().trim() && !!this.summary()?.verticals.length && !this.saving();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text) return;

    this.inputText = '';
    this.sendMessage(text);
  }

  onQuestionsSubmit(answers: Record<string, WizardAnswer>): void {
    const questions = this.activeQuestions();
    if (!questions || this.busy()) return;

    // formatWizardAnswers is a UI transcript echo only — real answers go as structured JSON.
    this.history.update(h => [...h, { role: 'user', content: formatWizardAnswers(questions, answers) }]);
    this.activeQuestions.set(null);
    this.busy.set(true);
    this.scrollToBottomSoon();

    if (this.currentPhase() === 'tripDates') {
      this.submitTripDates(answers);
    } else if (this.currentPhase() === 'verticalQuestions') {
      this.submitVerticalQuestions(questions, answers);
    }
  }

  private submitTripDates(answers: Record<string, WizardAnswer>): void {
    const destination = this.knownDestination();
    const travellerCount = this.knownTravellerCount();
    const departureDate = typeof answers['departure_date'] === 'string' ? answers['departure_date'] : '';
    const returnDate = typeof answers['return_date'] === 'string' ? answers['return_date'] : '';
    const verticals = Array.isArray(answers['verticals']) ? (answers['verticals'] as AgentType[]) : [];

    // Extra check - canProceed already blocks Continue until all fields are answered.
    if (!destination || !travellerCount || !departureDate || !returnDate || verticals.length === 0) {
      this.showError('Please choose your dates and at least one of flights, stays, or cars.');
      return;
    }

    this.selectedVerticals.set(verticals);

    this.svc.getTripIntakeVerticalQuestions(destination, travellerCount, departureDate, returnDate, verticals).subscribe({
      next: (res) => {
        this.history.update(h => [...h, { role: 'assistant', content: res.message }]);
        this.activeQuestions.set(this.applyCarLocationDefaults(res.questions));
        this.currentPhase.set('verticalQuestions');
        this.busy.set(false);
        this.scrollToBottomSoon();
      },
      error: () => this.handleConnectionError(),
    });
  }

  private submitVerticalQuestions(questions: WizardQuestion[], answers: Record<string, WizardAnswer>): void {
    this.lastVerticalBatch.set({ questions, answers });

    const destination = this.knownDestination();
    const travellerCount = this.knownTravellerCount();
    const verticals = this.selectedVerticals();
    if (!destination || !travellerCount || !verticals) {
      this.handleConnectionError();
      return;
    }

    this.svc.getTripIntakeSummary(destination, travellerCount, verticals, answers).subscribe({
      next: (res) => {
        this.history.update(h => [...h, { role: 'assistant', content: res.message }]);
        this.summary.set(res.summary);
        this.currentPhase.set('ready');
        this.busy.set(false);
        this.scrollToBottomSoon();
      },
      error: () => this.handleConnectionError(),
    });
  }

  onStartSearching(): void {
    if (!this.canStartSearching()) return;

    const summary = this.summary();

    if (!summary) return; // canStartSearching() already guards this

    this.saving.set(true);
    this.saveError.set(null);

    this.svc.renameTrip(this.tripId, this.tripName().trim()).subscribe({
      next: () => this.runSearches(summary),
      error: () => {
        this.saving.set(false);
        this.saveError.set('Could not save the trip name — please try again.');
      },
    });
  }

  private runSearches(summary: TripIntakeSummary): void {
    // Defensive: guarantees new chats land on this wizard's trip, not whatever is "current" server-side.
    this.svc.switchTrip(this.tripId).subscribe({
      next: (res) => {
        // A brand-new trip auto-creates one placeholder flights chat on switch (see
        // ChatBotService.switchTrip). Captured here so it can be cleaned up once real chats
        // exist — only deleted if still genuinely empty (see createChatsAndKickoff).
        const placeholder = res.chats.find(c => c.id === res.currentChatId);
        const placeholderChatId = placeholder?.preview === '(empty)' ? placeholder.id : null;
        this.createChatsAndKickoff(summary, placeholderChatId);
      },
      error: () => {
        this.saving.set(false);
        this.saveError.set('Could not start your searches — please try again.');
      },
    });
  }

  private createChatsAndKickoff(summary: TripIntakeSummary, placeholderChatId: string | null): void {
    // Reverse of VERTICAL_DISPLAY_ORDER — ignores summary.verticals' own (non-canonical) order.
    const creationOrder = [...VERTICAL_DISPLAY_ORDER].reverse().filter(v => summary.verticals.includes(v));

    // Created sequentially (fast DB inserts, no LLM yet) so every chatId is known before concurrency starts.
    from(creationOrder).pipe(
      concatMap(agentType => this.svc.newChat(agentType, this.descriptionFor(summary, agentType), this.answersFor(agentType)).pipe(
        map((res): VerticalSearchJob => ({ agentType, chatId: res.currentChatId, kickoffMessage: res.kickoffMessage! })),
      )),
      toArray(),
    ).subscribe({
      next: (jobs) => {
        // Fires all kickoffs in parallel; outlives the wizard, reflected via pendingChatIds$/chatUpdated$.
        this.svc.startVerticalKickoffs(jobs);

        // Don't wait for kickoffs — drop straight into the last-created chat, others show pill spinners.
        const last = jobs[jobs.length - 1]!;
        this.svc.setCurrentChatId(last.chatId);

        // Clean up the auto-created placeholder now real chats exist — guarded against matching one of them.
        if (placeholderChatId && !jobs.some(j => j.chatId === placeholderChatId)) {
          this.svc.deleteChat(placeholderChatId).subscribe({ complete: () => this.svc.notifyChatUpdated() });
        } else {
          this.svc.notifyChatUpdated();
        }
        this.saving.set(false);
        this.renamed.emit();
      },
      error: () => {
        this.saving.set(false);
        this.saveError.set('Could not start your searches — please try again.');
      },
    });
  }

  /** Composes shared destination/traveller count with just this vertical's own description. */
  private descriptionFor(summary: TripIntakeSummary, agentType: AgentType): string {
    const verticalDetail = {
      flights: summary.flightsDescription,
      stays: summary.staysDescription,
      cars: summary.carsDescription,
    }[agentType] ?? '';

    return `Destination: ${summary.destination}. Travellers: ${summary.travellerCount}. ${verticalDetail}`.trim();
  }

  /** Slices the cached step-4 batch down to just this vertical's fields (via GROUP_TO_VERTICAL),
   *  so it's persisted at chat creation. Returns undefined if nothing was cached or matched —
   *  treated the same as "no answers". */
  private answersFor(agentType: AgentType): Record<string, WizardAnswer> | undefined {
    const batch = this.lastVerticalBatch();
    if (!batch) return undefined;

    const entries = batch.questions
      .filter(q => GROUP_TO_VERTICAL[q.group ?? ''] === agentType)
      .map(q => [q.id, batch.answers[q.id]] as const)
      .filter((entry): entry is [string, WizardAnswer] => entry[1] !== undefined);

    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  /** Cars' pickup/dropoff default to the flight destination (renting where you land is common) —
   *  only as a pre-render DEFAULT, never overriding a user pick. Deterministic client-side
   *  substitution, not an LLM placeholder; no-ops if flights wasn't also selected. */
  private applyCarLocationDefaults(questions: WizardQuestion[]): WizardQuestion[] {
    const flightDestination = questions.find(q => q.id === 'flight_destination')?.default;
    if (typeof flightDestination !== 'string' || !flightDestination) return questions;

    return questions.map(q =>
      (q.id === 'car_pickup_location' || q.id === 'car_dropoff_location')
        ? { ...q, default: flightDestination }
        : q,
    );
  }

  /** Only reachable during 'basics' phase — the template hides the input row once questions/summary are set. */
  private sendMessage(text: string): void {
    if (this.busy()) return;

    const historyForRequest: TripIntakeMessage[] = this.history().map(m => ({ role: m.role, content: m.content }));
    this.history.update(h => [...h, { role: 'user', content: text }]);
    this.busy.set(true);
    this.scrollToBottomSoon();

    this.svc.sendTripIntakeBasicsMessage(historyForRequest, text).subscribe({
      next: (res) => {
        this.history.update(h => [...h, { role: 'assistant', content: res.message }]);

        // `questions`' presence is what advances the phase — see runTripIntakeBasics.
        if (res.destination && res.travellerCount && res.questions) {
          this.knownDestination.set(res.destination);
          this.knownTravellerCount.set(res.travellerCount);
          this.activeQuestions.set(res.questions);
          this.currentPhase.set('tripDates');
        }

        this.busy.set(false);
        this.scrollToBottomSoon();
      },
      error: () => this.handleConnectionError(),
    });
  }

  private handleConnectionError(): void {
    this.showError('Connection error — please try again.');
  }

  /** Puts a recoverable problem into the transcript. Leaves activeQuestions() 
   * null, so recovery is via the free-text input */
  private showError(message: string): void {
    this.history.update(h => [...h, { role: 'assistant', content: message }]);
    this.busy.set(false);
    this.scrollToBottomSoon();
  }

  private scrollToBottomSoon(): void {
    setTimeout(() => {
      const el = this.msgContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
