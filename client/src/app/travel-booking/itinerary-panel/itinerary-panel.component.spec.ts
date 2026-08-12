import { ChangeDetectorRef } from '@angular/core';
import { ItineraryPanelComponent } from './itinerary-panel.component';
import { TravelBookingService } from '../travel-booking.service';
import { FlightBookingSummary } from '../models/flight';
import { StayBookingSummary } from '../models/stay';
import { CarBookingSummary } from '../models/car';

function flight(departure_date: string, total_amount: string, total_currency: string): FlightBookingSummary {
  return { departure_date, total_amount, total_currency } as FlightBookingSummary;
}

function stay(check_in_date: string, total_amount: string, total_currency: string): StayBookingSummary {
  return { check_in_date, total_amount, total_currency } as StayBookingSummary;
}

function car(pickup_date: string, total_amount: string, total_currency: string): CarBookingSummary {
  return { pickup_date, total_amount, total_currency } as CarBookingSummary;
}

function createComponent(): ItineraryPanelComponent {
  // No HTTP call is ever made in these tests — ngOnInit/ngOnChanges are never invoked, and
  // the arrays under test are set directly, so the injected service is never touched.
  return new ItineraryPanelComponent({} as TravelBookingService, {} as ChangeDetectorRef);
}

describe('ItineraryPanelComponent', () => {
  describe('items', () => {
    it('merges and sorts all three verticals by start date ascending', () => {
      const component = createComponent();
      component.bookings = [flight('2026-08-15', '100.00', 'EUR')];
      component.stayBookings = [stay('2026-08-10', '50.00', 'EUR')];
      component.carBookings = [car('2026-08-20', '30.00', 'EUR')];

      const items = component.items;
      expect(items.map(i => i.kind)).toEqual(['stays', 'flights', 'cars']);
      expect(items.map(i => i.startDate)).toEqual(['2026-08-10', '2026-08-15', '2026-08-20']);
    });

    it('keeps a stable flights-before-stays-before-cars order for tied dates', () => {
      const component = createComponent();
      component.bookings = [flight('2026-08-15', '100.00', 'EUR')];
      component.stayBookings = [stay('2026-08-15', '50.00', 'EUR')];
      component.carBookings = [car('2026-08-15', '30.00', 'EUR')];

      expect(component.items.map(i => i.kind)).toEqual(['flights', 'stays', 'cars']);
    });

    it('is empty when there are no bookings', () => {
      expect(createComponent().items).toEqual([]);
    });
  });

  describe('tripTotals', () => {
    it('sums amounts sharing the same currency', () => {
      const component = createComponent();
      component.bookings = [flight('2026-08-15', '100.00', 'EUR')];
      component.stayBookings = [stay('2026-08-10', '50.50', 'EUR')];

      expect(component.tripTotals).toEqual([{ currency: 'EUR', amount: 150.5 }]);
    });

    it('keeps different currencies as separate, alphabetically sorted entries', () => {
      const component = createComponent();
      component.bookings = [flight('2026-08-15', '100.00', 'USD')];
      component.stayBookings = [stay('2026-08-10', '50.00', 'EUR')];

      expect(component.tripTotals).toEqual([
        { currency: 'EUR', amount: 50 },
        { currency: 'USD', amount: 100 },
      ]);
    });

    it('is empty when there are no bookings', () => {
      expect(createComponent().tripTotals).toEqual([]);
    });
  });

  describe('isNewDate', () => {
    it('is true at index 0', () => {
      const component = createComponent();
      component.bookings = [flight('2026-08-15', '100.00', 'EUR')];
      expect(component.isNewDate(component.items[0]!, 0)).toBe(true);
    });

    it('is false for a consecutive item on the same date', () => {
      const component = createComponent();
      component.bookings = [flight('2026-08-15', '100.00', 'EUR')];
      component.stayBookings = [stay('2026-08-15', '50.00', 'EUR')];
      const items = component.items;
      expect(component.isNewDate(items[1]!, 1)).toBe(false);
    });

    it('is true when the date changes from the previous item', () => {
      const component = createComponent();
      component.bookings = [flight('2026-08-15', '100.00', 'EUR')];
      component.carBookings = [car('2026-08-20', '30.00', 'EUR')];
      const items = component.items;
      expect(component.isNewDate(items[1]!, 1)).toBe(true);
    });
  });

  describe('formatDateHeading', () => {
    it('renders a known ISO date as weekday, day, month, year', () => {
      const component = createComponent();
      expect(component.formatDateHeading('2026-08-14')).toBe('Friday, 14 August 2026');
    });
  });
});
