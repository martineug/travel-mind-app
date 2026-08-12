import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { TravelBookingService } from '../travel-booking.service';
import { AirportSuggestion } from '../models/airport';
import { WizardAnswer, WizardQuestion } from '../models/wizard-question';

interface CalendarDay {
  iso: string;
  day: number;
  inMonth: boolean;
}

type StepItem =
  | { kind: 'dateRange' }
  | { kind: 'question'; question: WizardQuestion }
  | { kind: 'row'; questions: WizardQuestion[] };

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// The calendar renders in a CDK overlay
const OVERLAY_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
];

// A date-range pair's "group" tag doubles as a vertical hint, so its heading can read
// "Flight Departure – Return" instead of just "Departure – Return". No entry = no prefix.
const DATE_RANGE_VERTICAL_LABELS: Record<string, string> = {
  flight: 'Flight',
  stay: 'Stay',
  car: 'Car',
};

@Component({
  selector: 'app-wizard-questions',
  standalone: true,
  imports: [OverlayModule, NgTemplateOutlet],
  templateUrl: './wizard-questions.component.html',
  styleUrls: ['./wizard-questions.component.scss'],
})
export class WizardQuestionsComponent implements OnInit {
  @Input({ required: true }) questions!: WizardQuestion[];
  @Output() submit = new EventEmitter<Record<string, WizardAnswer>>();

  readonly currentIndex = signal(0);
  readonly answers = signal<Record<string, WizardAnswer>>({});
  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly calendarOpen = signal(false);
  readonly overlayPositions = OVERLAY_POSITIONS;

  /** Airport picker state, keyed by question id (origin/destination can both be visible in
   *  one step) */
  readonly airportQuery = signal<Record<string, string | undefined>>({});
  readonly airportResults = signal<Record<string, AirportSuggestion[] | undefined>>({});
  readonly airportLoading = signal<Record<string, boolean | undefined>>({});
  readonly airportOpen = signal<Record<string, boolean | undefined>>({});
  private readonly airportDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly calendarMonth = signal<Date | null>(null);
  private readonly todayIso = this.toIso(new Date());

  constructor(private readonly travelBookingService: TravelBookingService) {}

  ngOnInit(): void {
    const seeded: Record<string, WizardAnswer> = {};
    const seededQuery: Record<string, string> = {};
    for (const q of this.questions) {
      seeded[q.id] = q.default ?? (q.type === 'multi-select' ? [] : '');
      if (q.type === 'airport') {
        seededQuery[q.id] = typeof seeded[q.id] === 'string' ? seeded[q.id] as string : '';
      }
    }
    this.answers.set(seeded);
    this.airportQuery.set(seededQuery);
  }

  /** Questions sharing the same non-empty "group" render together */
  get steps(): WizardQuestion[][] {
    const result: WizardQuestion[][] = [];
    const groupIndex = new Map<string, number>();

    for (const q of this.questions) {
      if (q.group) {
        const idx = groupIndex.get(q.group);
        if (idx !== undefined) {
          result[idx]!.push(q);
          continue;
        }
        groupIndex.set(q.group, result.length);
      }
      result.push([q]);
    }

    return result;
  }

  get currentStep(): WizardQuestion[] {
    return this.steps[this.currentIndex()] ?? [];
  }

  get isLast(): boolean {
    return this.currentIndex() === this.steps.length - 1;
  }

  /** Ids of questions in the current step disabled by a selected option elsewhere (e.g.
   *  "one-way" greying out the return date) — driven by each option's own "disables" list. */
  get disabledQuestionIds(): Set<string> {
    const disabled = new Set<string>();
    for (const q of this.currentStep) {
      if ((q.type !== 'single-select' && q.type !== 'multi-select') || !q.options) continue;
      const answer = this.answers()[q.id];
      const selected = Array.isArray(answer) ? answer : [answer];
      for (const opt of q.options) {
        if (opt.disables && selected.includes(opt.value)) {
          for (const id of opt.disables) disabled.add(id);
        }
      }
    }
    return disabled;
  }

  isQuestionDisabled(id: string): boolean {
    return this.disabledQuestionIds.has(id);
  }

  get canProceed(): boolean {
    const disabled = this.disabledQuestionIds;
    return this.currentStep.every(q => disabled.has(q.id) || !q.required || !this.isEmpty(this.answers()[q.id]));
  }

  isSelected(question: WizardQuestion, value: string): boolean {
    const answer = this.answers()[question.id];
    return Array.isArray(answer) ? answer.includes(value) : answer === value;
  }

  toggleOption(question: WizardQuestion, value: string): void {
    if (question.type === 'multi-select') {
      const existing = this.answers()[question.id];
      const arr = Array.isArray(existing) ? existing : [];
      const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      this.setAnswer(question, next);
    } else {
      this.setAnswer(question, value);
    }

    this.resetDisabledFields();
  }

  /** Blanks every currently-disabled question's answer  */
  private resetDisabledFields(): void {
    const disabled = this.disabledQuestionIds;
    if (disabled.size === 0) return;

    this.answers.update(a => {
      const next = { ...a };
      for (const id of disabled) {
        const q = this.questions.find(qq => qq.id === id);
        if (!q) continue;
        next[id] = q.type === 'multi-select' ? [] : '';
      }
      return next;
    });
  }

  onSliderInput(question: WizardQuestion, event: Event): void {
    this.setAnswer(question, Number((event.target as HTMLInputElement).value));
  }

  onNumberInput(question: WizardQuestion, event: Event): void {
    this.setAnswer(question, Number((event.target as HTMLInputElement).value));
  }

  onTextInput(question: WizardQuestion, event: Event): void {
    this.setAnswer(question, (event.target as HTMLInputElement).value);
  }

  onTimeInput(question: WizardQuestion, event: Event): void {
    this.setAnswer(question, (event.target as HTMLInputElement).value);
  }

  /** Search-as-you-type for an 'airport' question, debounced 300ms */
  onAirportInput(question: WizardQuestion, event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.airportQuery.update(q => ({ ...q, [question.id]: text }));
    this.setAnswer(question, text);
    this.airportOpen.update(o => ({ ...o, [question.id]: true }));

    const existing = this.airportDebounceTimers.get(question.id);
    if (existing) clearTimeout(existing);

    if (text.trim().length < 2) {
      this.airportResults.update(r => ({ ...r, [question.id]: [] }));
      return;
    }

    this.airportDebounceTimers.set(question.id, setTimeout(() => this.runAirportSearch(question, text), 300));
  }

  openAirportDropdown(question: WizardQuestion): void {
    this.airportOpen.update(o => ({ ...o, [question.id]: true }));
  }

  closeAirportDropdown(question: WizardQuestion): void {
    this.airportOpen.update(o => ({ ...o, [question.id]: false }));
  }

  selectAirport(question: WizardQuestion, suggestion: AirportSuggestion): void {
    const label = `${suggestion.name} (${suggestion.iataCode})`;
    this.setAnswer(question, label);
    this.airportQuery.update(q => ({ ...q, [question.id]: label }));
    this.airportOpen.update(o => ({ ...o, [question.id]: false }));
    this.airportResults.update(r => ({ ...r, [question.id]: [] }));
  }

  private runAirportSearch(question: WizardQuestion, text: string): void {
    this.airportLoading.update(l => ({ ...l, [question.id]: true }));
    this.travelBookingService.suggestAirports(text).subscribe({
      next: res => {
        this.airportResults.update(r => ({ ...r, [question.id]: res.suggestions }));
        this.airportLoading.update(l => ({ ...l, [question.id]: false }));
      },
      error: () => this.airportLoading.update(l => ({ ...l, [question.id]: false })),
    });
  }

  onDateInput(question: WizardQuestion, event: Event): void {
    this.setAnswer(question, (event.target as HTMLInputElement).value);
  }

  /* ─── Date-range picker: two "date" questions in a step share one calendar, alongside any other questions the step contains. ─── */

  /** The step's two date questions, if it has exactly two, regardless of position among the step's other questions. */
  get currentDateRangePair(): [WizardQuestion, WizardQuestion] | null {
    const dateQuestions = this.currentStep.filter(q => q.type === 'date');
    return dateQuestions.length === 2 ? [dateQuestions[0]!, dateQuestions[1]!] : null;
  }

  /** Current step's questions in original order, with the date-range pair and same-`row`
   *  questions each collapsed into one item positioned at its first member — so array order
   *  still governs placement. Date-pair membership is checked first, ahead of any `row` tag. */
  get stepItems(): StepItem[] {
    const pair = this.currentDateRangePair;
    const step = this.currentStep;
    const items: StepItem[] = [];
    let pairInserted = false;
    let i = 0;

    while (i < step.length) {
      const q = step[i]!;

      if (pair && (q.id === pair[0].id || q.id === pair[1].id)) {
        if (!pairInserted) {
          items.push({ kind: 'dateRange' });
          pairInserted = true;
        }
        i++;
        continue;
      }

      if (q.row) {
        const rowQuestions = [q];
        let j = i + 1;
        while (
          j < step.length && step[j]!.row === q.row
          && !(pair && (step[j]!.id === pair[0].id || step[j]!.id === pair[1].id))
        ) {
          rowQuestions.push(step[j]!);
          j++;
        }
        items.push({ kind: 'row', questions: rowQuestions });
        i = j;
        continue;
      }

      items.push({ kind: 'question', question: q });
      i++;
    }

    return items;
  }

  toggleCalendar(): void {
    this.calendarOpen.update(open => !open);
  }

  get rangeStart(): WizardQuestion {
    return this.currentDateRangePair![0];
  }

  get rangeEnd(): WizardQuestion {
    return this.currentDateRangePair![1];
  }

  /** e.g. "Flight Departure – Return", or plain "Departure Date – Return Date" for unknown vertical groups. */
  get dateRangeHeading(): string {
    const group = this.rangeStart.group;
    const prefix = group ? DATE_RANGE_VERTICAL_LABELS[group] : undefined;
    const start = prefix ? `${prefix} ${this.rangeStart.label}` : this.rangeStart.label;
    return `${start} – ${this.rangeEnd.label}`;
  }

  get displayedMonth(): Date {
    const explicit = this.calendarMonth();
    if (explicit) return explicit;

    if (this.currentDateRangePair) {
      const startVal = this.answers()[this.rangeStart.id];
      if (typeof startVal === 'string' && startVal) return this.startOfMonth(this.fromIso(startVal));
    }
    return this.startOfMonth(new Date());
  }

  get monthLabel(): string {
    const m = this.displayedMonth;
    return `${MONTH_LABELS[m.getMonth()]} ${m.getFullYear()}`;
  }

  get calendarDays(): CalendarDay[] {
    const month = this.displayedMonth;
    const year = month.getFullYear();
    const mo = month.getMonth();
    const firstWeekday = new Date(year, mo, 1).getDay();
    const daysInMonth = new Date(year, mo + 1, 0).getDate();
    const prevMonthDays = new Date(year, mo, 0).getDate();

    const cells: CalendarDay[] = [];

    for (let i = firstWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      cells.push({ iso: this.toIso(new Date(year, mo - 1, d)), day: d, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ iso: this.toIso(new Date(year, mo, d)), day: d, inMonth: true });
    }
    let trailing = 1;
    while (cells.length % 7 !== 0) {
      cells.push({ iso: this.toIso(new Date(year, mo + 1, trailing)), day: trailing, inMonth: false });
      trailing++;
    }

    return cells;
  }

  shiftMonth(delta: number): void {
    const cur = this.displayedMonth;
    this.calendarMonth.set(new Date(cur.getFullYear(), cur.getMonth() + delta, 1));
  }

  /** Past days are unpickable entirely. The "return after departure" rule is enforced in
   *  selectRangeDate instead — an earlier-than-start click restarts the pick, not this. */
  isDateDisabled(iso: string): boolean {
    return iso < this.todayIso;
  }

  selectRangeDate(startQ: WizardQuestion, endQ: WizardQuestion, iso: string): void {
    if (this.isDateDisabled(iso)) return;

    const start = this.answers()[startQ.id];
    const end = this.answers()[endQ.id];

    if (!start || (start && end)) {
      this.setAnswer(startQ, iso);
      this.setAnswer(endQ, '');
      return;
    }

    if (iso <= (start as string)) {
      // Not strictly after the start — restart the range from here instead.
      this.setAnswer(startQ, iso);
      this.setAnswer(endQ, '');
    } else {
      this.setAnswer(endQ, iso);
      // Range is now complete — close the picker rather than leaving it open.
      this.calendarOpen.set(false);
    }
  }

  isRangeStart(iso: string): boolean {
    return this.answers()[this.rangeStart.id] === iso;
  }

  isRangeEnd(iso: string): boolean {
    return this.answers()[this.rangeEnd.id] === iso;
  }

  isInRange(iso: string): boolean {
    const start = this.answers()[this.rangeStart.id] as string | undefined;
    const end = this.answers()[this.rangeEnd.id] as string | undefined;
    if (!start || !end) return false;
    return iso > start && iso < end;
  }

  private startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private toIso(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private fromIso(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y!, m! - 1, d!);
  }

  back(): void {
    if (this.currentIndex() > 0) this.currentIndex.update(i => i - 1);
    this.calendarOpen.set(false);
  }

  next(): void {
    if (this.isLast) {
      this.submit.emit(this.answers());
    } else {
      this.currentIndex.update(i => i + 1);
    }
    this.calendarOpen.set(false);
  }

  private setAnswer(question: WizardQuestion, value: WizardAnswer): void {
    this.answers.update(a => ({ ...a, [question.id]: value }));
  }

  private isEmpty(value: WizardAnswer | undefined): boolean {
    if (value === undefined || value === null) return true;
    return Array.isArray(value) ? value.length === 0 : value === '';
  }
}
