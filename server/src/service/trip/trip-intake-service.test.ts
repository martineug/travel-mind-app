import { describe, it, expect } from 'vitest';
import { buildVerticalQuestionsResponse, templatedDescription, formatAnswerValue, formatVerticalFacts } from './trip-intake-service';
import { WizardQuestion } from '../../model/wizard-question';

describe('buildVerticalQuestionsResponse', () => {
  it('produces the deterministic question set for a given vertical list', () => {
    const response = buildVerticalQuestionsResponse(['flights', 'cars'], 'Rome, Italy', 2, '2026-08-01', '2026-08-08');

    expect(response.message).toBe('Let me know your preferences for each part of the trip.');
    const ids = response.questions.map(q => q.id);
    expect(ids).toContain('flight_include');
    expect(ids).toContain('car_include');
    expect(ids).not.toContain('stay_include');
  });
});

describe('templatedDescription', () => {
  it('joins labelled facts with "; "', () => {
    expect(templatedDescription({ Origin: 'Dublin', Destination: 'Rome' })).toBe('Origin: Dublin; Destination: Rome');
  });

  it('renders an empty string for no facts', () => {
    expect(templatedDescription({})).toBe('');
  });
});

describe('formatAnswerValue', () => {
  it('resolves a single-select value to its option label', () => {
    const q: WizardQuestion = {
      id: 'trip_type', label: 'Trip Type', type: 'single-select',
      options: [{ value: 'round trip', label: 'Round trip' }, { value: 'one-way', label: 'One-way' }],
    };
    expect(formatAnswerValue(q, 'one-way')).toBe('One-way');
  });

  it('appends the unit for a slider question', () => {
    const q: WizardQuestion = { id: 'budget', label: 'Budget', type: 'slider', unit: '€/night' };
    expect(formatAnswerValue(q, 150)).toBe('150 €/night');
  });

  it('stringifies a plain text/date/number answer', () => {
    const q: WizardQuestion = { id: 'departure', label: 'Departure', type: 'date' };
    expect(formatAnswerValue(q, '2026-09-10')).toBe('2026-09-10');
  });
});

describe('formatVerticalFacts', () => {
  it('labels only the answers that were actually given, skipping the include/exclude toggle', () => {
    const facts = formatVerticalFacts('flights', 'Rome, Italy', 2, {
      flight_include: 'include',
      flight_origin: 'Dublin Airport (DUB)',
      flight_class: 'economy',
    });

    expect(facts['Departing From']).toBe('Dublin Airport (DUB)');
    // Three answers were given, but the include/exclude toggle itself is never a describable fact.
    expect(Object.keys(facts)).toHaveLength(2);
  });

  it('omits fields with no answer at all', () => {
    const facts = formatVerticalFacts('flights', 'Rome, Italy', 2, {});
    expect(facts).toEqual({});
  });
});
