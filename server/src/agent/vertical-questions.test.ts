import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getTripDatesQuestions,
  isVerticalIncluded,
  getEditSearchQuestions,
  buildTripIntakeVerticalQuestions,
} from './vertical-questions';

afterEach(() => {
  vi.useRealTimers();
});

describe('getTripDatesQuestions', () => {
  it('returns the static step-3 shape', () => {
    const questions = getTripDatesQuestions();
    expect(questions).toHaveLength(3);

    const [departure, ret, verticals] = questions;
    expect(departure).toMatchObject({ id: 'departure_date', type: 'date', required: true, group: 'trip_dates' });
    expect(ret).toMatchObject({ id: 'return_date', type: 'date', required: true, group: 'trip_dates' });
    expect(verticals).toMatchObject({
      id: 'verticals',
      type: 'multi-select',
      required: true,
      default: ['flights', 'stays', 'cars'],
    });
    expect(verticals!.options?.map(o => o.value)).toEqual(['flights', 'stays', 'cars']);
  });
});

describe('isVerticalIncluded', () => {
  it('defaults to included when no toggle answer is present', () => {
    expect(isVerticalIncluded('flights', {})).toBe(true);
  });

  it('is excluded only when the toggle answer is exactly "exclude"', () => {
    expect(isVerticalIncluded('flights', { flight_include: 'exclude' })).toBe(false);
  });

  it('is included when the toggle answer is "include"', () => {
    expect(isVerticalIncluded('flights', { flight_include: 'include' })).toBe(true);
  });
});

describe('getEditSearchQuestions', () => {
  it('prefers a prior answer over the field\'s own default', () => {
    const questions = getEditSearchQuestions('flights', { flight_adults: 3 });
    const adults = questions.find(q => q.id === 'flight_adults');
    expect(adults?.default).toBe(3);
  });

  it('never includes an include/exclude toggle question', () => {
    const questions = getEditSearchQuestions('flights', null);
    expect(questions.find(q => q.id === 'flight_include')).toBeUndefined();
  });

  it('falls back to a literal default when there are no prior answers', () => {
    const questions = getEditSearchQuestions('flights', null);
    const origin = questions.find(q => q.id === 'flight_origin');
    expect(origin?.default).toBe('Dublin Airport (DUB)');
  });

  it('falls back to an empty string for a destination placeholder with no hint', () => {
    const questions = getEditSearchQuestions('flights', null);
    const destination = questions.find(q => q.id === 'flight_destination');
    expect(destination?.default).toBe('');
  });

  it('uses the destination hint when one is supplied', () => {
    const questions = getEditSearchQuestions('flights', null, 'Rome, Italy');
    const destination = questions.find(q => q.id === 'flight_destination');
    expect(destination?.default).toBe('Rome, Italy');
  });

  it('falls back to 1 traveller when there are no prior answers or hints', () => {
    const questions = getEditSearchQuestions('flights', null);
    const adults = questions.find(q => q.id === 'flight_adults');
    expect(adults?.default).toBe(1);
  });

  it('uses the traveller count hint when one is supplied', () => {
    const questions = getEditSearchQuestions('flights', null, null, 4);
    const adults = questions.find(q => q.id === 'flight_adults');
    expect(adults?.default).toBe(4);
  });

  it('computes a two-week-out date range for dateRole fields with no prior answer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const questions = getEditSearchQuestions('flights', null);
    const departure = questions.find(q => q.id === 'flight_departure_date');
    const returnDate = questions.find(q => q.id === 'flight_return_date');

    expect(departure?.default).toBe('2026-01-15');
    expect(returnDate?.default).toBe('2026-01-22');
  });
});

describe('buildTripIntakeVerticalQuestions', () => {
  it('emits only the selected verticals, in canonical AGENT_TYPES order', () => {
    // Selected out of order — 'stays' before 'flights' — to prove output order isn't caller-order.
    const questions = buildTripIntakeVerticalQuestions(
      ['stays', 'flights'], 'Rome, Italy', 2, '2026-08-01', '2026-08-08',
    );

    const ids = questions.map(q => q.id);
    expect(ids[0]).toBe('flight_include');
    expect(ids).not.toContain('car_include');
    expect(ids).toContain('stay_include');
    // Every flight field appears before every stay field.
    expect(ids.indexOf('flight_class')).toBeLessThan(ids.indexOf('stay_include'));
  });

  it('includes an include/exclude toggle per selected vertical, whose "exclude" option disables all of that vertical\'s fields', () => {
    const questions = buildTripIntakeVerticalQuestions(['flights'], 'Rome, Italy', 2, '2026-08-01', '2026-08-08');
    const toggle = questions.find(q => q.id === 'flight_include');
    const excludeOption = toggle?.options?.find(o => o.value === 'exclude');

    // 7 flight fields: adults, origin, destination, departure, return, trip_type, class.
    expect(excludeOption?.disables).toHaveLength(7);
  });

  it('resolves dateRole/destination/travellerCount defaults directly from the given trip-wide facts', () => {
    const questions = buildTripIntakeVerticalQuestions(['flights'], 'Rome, Italy', 2, '2026-08-01', '2026-08-08');

    expect(questions.find(q => q.id === 'flight_departure_date')?.default).toBe('2026-08-01');
    expect(questions.find(q => q.id === 'flight_return_date')?.default).toBe('2026-08-08');
    expect(questions.find(q => q.id === 'flight_destination')?.default).toBe('Rome, Italy');
    expect(questions.find(q => q.id === 'flight_adults')?.default).toBe(2);
  });

  it('rounds a traveller-rooms placeholder up to a minimum of 1', () => {
    const questions = buildTripIntakeVerticalQuestions(['stays'], 'Rome, Italy', 1, '2026-08-01', '2026-08-08');
    expect(questions.find(q => q.id === 'stay_rooms')?.default).toBe(1);
  });
});
