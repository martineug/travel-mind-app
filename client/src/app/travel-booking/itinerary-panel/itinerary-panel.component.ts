import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { TravelBookingService } from '../travel-booking.service';
import { FlightBookingSummary } from '../models/flight';
import { StayBookingSummary } from '../models/stay';
import { CarBookingSummary } from '../models/car';
import { AgentIconComponent } from '../agent-icon/agent-icon.component';

/** Local to this component — lets the three DB-shaped summaries (which don't share a payload) merge into one chronological feed without changing them. */
type ItineraryItem =
  | { kind: 'flights'; startDate: string; booking: FlightBookingSummary }
  | { kind: 'stays';   startDate: string; booking: StayBookingSummary }
  | { kind: 'cars';    startDate: string; booking: CarBookingSummary };

@Component({
  selector: 'app-itinerary-panel',
  standalone: true,
  imports: [AgentIconComponent],
  templateUrl: './itinerary-panel.component.html',
  styleUrls: ['./itinerary-panel.component.scss'],
})
export class ItineraryPanelComponent implements OnChanges, OnInit, OnDestroy {
  @Input() tripId: string | null = null;

  bookings: FlightBookingSummary[] = [];
  stayBookings: StayBookingSummary[] = [];
  carBookings: CarBookingSummary[] = [];

  private bookingSub?: Subscription;
  private chatUpdatedSub?: Subscription;

  constructor(private svc: TravelBookingService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Fired by any UI booking (flight confirm-payment, car driver picker) — reloads all three since the event doesn't say which kind.
    this.bookingSub = this.svc.bookingCreated$.subscribe(() => {
      if (this.tripId) {
        this.loadBookings(this.tripId);
        this.loadStayBookings(this.tripId);
        this.loadCarBookings(this.tripId);
      }
    });

    // Stays still complete inline during chat (no separate confirm step), so they need refreshing on every chat update.
    this.chatUpdatedSub = this.svc.chatUpdated$.subscribe(() => {
      if (this.tripId) {
        this.loadStayBookings(this.tripId);
        this.loadCarBookings(this.tripId);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tripId'] && this.tripId) {
      this.loadBookings(this.tripId);
      this.loadStayBookings(this.tripId);
      this.loadCarBookings(this.tripId);
    }
  }

  ngOnDestroy(): void {
    this.bookingSub?.unsubscribe();
    this.chatUpdatedSub?.unsubscribe();
  }

  /** Each request is tagged with the tripId it was made for — switching trips can fire a new
   *  request before an older one resolves, so a stale response must be discarded, not applied. */
  private loadBookings(tripId: string): void {
    this.svc.getFlightBookings(tripId).subscribe({
      next: (b) => {
        if (this.tripId !== tripId) return;
        this.bookings = b;
        this.cdr.detectChanges();
      },
    });
  }

  private loadStayBookings(tripId: string): void {
    this.svc.getStayBookings(tripId).subscribe({
      next: (b) => {
        if (this.tripId !== tripId) return;
        this.stayBookings = b;
        this.cdr.detectChanges();
      },
    });
  }

  private loadCarBookings(tripId: string): void {
    this.svc.getCarBookings(tripId).subscribe({
      next: (b) => {
        if (this.tripId !== tripId) return;
        this.carBookings = b;
        this.cdr.detectChanges();
      },
    });
  }

  currencySymbol(cur: string): string {
    return cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$';
  }

  /** All three verticals merged into one chronological feed, sorted ascending by start date.
   *  Ties keep original relative order (stable sort, flights/stays/cars concatenation order). */
  get items(): ItineraryItem[] {
    const flights: ItineraryItem[] = this.bookings.map(booking => ({ kind: 'flights', startDate: booking.departure_date, booking }));
    const stays: ItineraryItem[] = this.stayBookings.map(booking => ({ kind: 'stays', startDate: booking.check_in_date, booking }));
    const cars: ItineraryItem[] = this.carBookings.map(booking => ({ kind: 'cars', startDate: booking.pickup_date, booking }));
    return [...flights, ...stays, ...cars].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  isNewDate(item: ItineraryItem, index: number): boolean {
    return index === 0 || item.startDate !== this.items[index - 1]!.startDate;
  }

  /** Grouped rather than summed: stays/cars are mocked in EUR but real flights come back in
   *  whatever currency Duffel priced them, so a cross-currency sum would be meaningless. */
  get tripTotals(): { currency: string; amount: number }[] {
    const totals = new Map<string, number>();
    const add = (currency: string, amount: string) => totals.set(currency, (totals.get(currency) ?? 0) + parseFloat(amount));

    for (const b of this.bookings) add(b.total_currency, b.total_amount);
    for (const b of this.stayBookings) add(b.total_currency, b.total_amount);
    for (const b of this.carBookings) add(b.total_currency, b.total_amount);

    return [...totals.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }

  /** e.g. "Friday, 14 August 2026" — parses via local-time components, not `new Date(iso)`, which parses as UTC and can render a day off. */
  formatDateHeading(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y!, m! - 1, d!);
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
}
