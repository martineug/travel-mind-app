import { formatWizardAnswers, formatWizardAnswerValue } from './format-wizard-answers';
import { WizardQuestion } from './models/wizard-question';

describe('formatWizardAnswerValue', () => {
  it('renders "(not specified)" for an undefined answer', () => {
    const q: WizardQuestion = { id: 'x', label: 'X', type: 'text' };
    expect(formatWizardAnswerValue(q, undefined)).toBe('(not specified)');
  });

  it('resolves a single-select value to its option label', () => {
    const q: WizardQuestion = {
      id: 'trip_type', label: 'Trip Type', type: 'single-select',
      options: [{ value: 'round trip', label: 'Round trip' }, { value: 'one-way', label: 'One-way' }],
    };
    expect(formatWizardAnswerValue(q, 'one-way')).toBe('One-way');
  });

  it('joins multi-select labels with a comma', () => {
    const q: WizardQuestion = {
      id: 'verticals', label: 'Verticals', type: 'multi-select',
      options: [
        { value: 'flights', label: 'Flights' },
        { value: 'stays', label: 'Stays' },
        { value: 'cars', label: 'Cars' },
      ],
    };
    expect(formatWizardAnswerValue(q, ['flights', 'cars'])).toBe('Flights, Cars');
  });

  it('falls back to the raw value when a select option label lookup misses', () => {
    const q: WizardQuestion = {
      id: 'trip_type', label: 'Trip Type', type: 'single-select',
      options: [{ value: 'round trip', label: 'Round trip' }],
    };
    expect(formatWizardAnswerValue(q, 'mystery-value')).toBe('mystery-value');
  });

  it('appends the unit for a slider question when one is set', () => {
    const q: WizardQuestion = { id: 'budget', label: 'Budget', type: 'slider', unit: '€/night' };
    expect(formatWizardAnswerValue(q, 150)).toBe('150 €/night');
  });

  it('renders a slider with no unit as the bare number', () => {
    const q: WizardQuestion = { id: 'rating', label: 'Rating', type: 'slider' };
    expect(formatWizardAnswerValue(q, 3)).toBe('3');
  });

  it('stringifies a plain text/date/number answer', () => {
    const q: WizardQuestion = { id: 'departure', label: 'Departure', type: 'date' };
    expect(formatWizardAnswerValue(q, '2026-09-10')).toBe('2026-09-10');
  });
});

describe('formatWizardAnswers', () => {
  const departure: WizardQuestion = { id: 'departure_date', label: 'Departure', type: 'date' };
  const returnDate: WizardQuestion = { id: 'return_date', label: 'Return', type: 'date' };
  const tripType: WizardQuestion = {
    id: 'trip_type', label: 'Trip Type', type: 'single-select',
    options: [{ value: 'round trip', label: 'Round trip' }, { value: 'one-way', label: 'One-way' }],
  };

  it('joins answered questions into one summary line', () => {
    const line = formatWizardAnswers(
      [departure, returnDate, tripType],
      { departure_date: '2026-09-10', return_date: '2026-09-17', trip_type: 'round trip' },
    );
    expect(line).toBe('Departure 2026-09-10 Return 2026-09-17 Trip Type Round trip');
  });

  it('skips a question whose answer is an empty string entirely', () => {
    const line = formatWizardAnswers(
      [departure, returnDate],
      { departure_date: '2026-09-10', return_date: '' },
    );
    expect(line).toBe('Departure 2026-09-10');
  });

  it('skips a question whose answer is an empty array entirely', () => {
    const verticals: WizardQuestion = { id: 'verticals', label: 'Verticals', type: 'multi-select', options: [] };
    const line = formatWizardAnswers([departure, verticals], { departure_date: '2026-09-10', verticals: [] });
    expect(line).toBe('Departure 2026-09-10');
  });

  it('includes a question with no entry at all as "(not specified)", not skipped', () => {
    const line = formatWizardAnswers([departure, returnDate], { departure_date: '2026-09-10' });
    expect(line).toBe('Departure 2026-09-10 Return (not specified)');
  });
});
