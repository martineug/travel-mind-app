import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getTripDatesQuestions,
  isVerticalIncluded,
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

  it('pre-fills departure/return dates from optional hints, leaving them unset otherwise', () => {
    const [departure, ret] = getTripDatesQuestions('2026-09-01', '2026-09-15');
    expect(departure!.default).toBe('2026-09-01');
    expect(ret!.default).toBe('2026-09-15');

    const [bareDeparture, bareRet] = getTripDatesQuestions();
    expect(bareDeparture!.default).toBeUndefined();
    expect(bareRet!.default).toBeUndefined();
  });

  it('pre-fills the verticals selection from a hint, falling back to all three otherwise', () => {
    const [, , hinted] = getTripDatesQuestions(null, null, ['flights', 'stays']);
    expect(hinted!.default).toEqual(['flights', 'stays']);

    const [, , bare] = getTripDatesQuestions();
    expect(bare!.default).toEqual(['flights', 'stays', 'cars']);

    const [, , empty] = getTripDatesQuestions(null, null, []);
    expect(empty!.default).toEqual(['flights', 'stays', 'cars']);
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
