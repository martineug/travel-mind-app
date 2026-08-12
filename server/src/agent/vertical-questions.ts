import { AgentType, AGENT_TYPES } from '../model/agent-type';
import { WizardQuestion, WizardQuestionOption, WizardAnswer } from '../model/wizard-question';

// Single source of truth for each vertical's field list. Drives getEditSearchQuestions()
// (the in-chat "Edit search" set), buildTripIntakeVerticalQuestions() (the wizard's step-4
// batch, built deterministically instead of an unreliable 20-50s LLM regenerate), and getTripDatesQuestions() (step-3).

type FieldDefault =
  | { kind: 'literal'; value: string | number }
  | { kind: 'dateRole'; role: 'start' | 'end' } // tied to the trip's overall date range
  | { kind: 'destinationPlaceholder' } // substituted with step 1's captured trip destination
  | { kind: 'travellerRoomsPlaceholder' } // substituted with ceil(travellerCount / 2)
  | { kind: 'travellerCountPlaceholder' }; // substituted with the trip's traveller count

interface BaseField {
  id: string;
  label: string;
  type: WizardQuestion['type'];
  options?: WizardQuestionOption[];
  def: FieldDefault;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Consecutive fields sharing this tag render side by side instead of stacked (see WizardQuestion.row). */
  row?: string;
}

const VERTICAL_GROUP: Record<AgentType, string> = { flights: 'flight', stays: 'stay', cars: 'car' };

const INCLUDE_TOGGLE_ID: Record<AgentType, string> = {
  flights: 'flight_include',
  stays: 'stay_include',
  cars: 'car_include',
};

const INCLUDE_TOGGLE_LABEL: Record<AgentType, string> = {
  flights: 'Include Flights in this trip?',
  stays: 'Include Stays in this trip?',
  cars: 'Include Cars in this trip?',
};

// The include/exclude toggle is wizard-only orchestration (lets the user back out of a
// vertical before seeing its fields) — deliberately not in BASE_FIELDS, so it's correctly
// absent from getEditSearchQuestions().
const BASE_FIELDS: Record<AgentType, BaseField[]> = {
  flights: [
    // Drives flight_search's `adults` and the booking picker's required count. Without it,
    // an "Edit search" (which rebuilds the kickoff from these fields alone) silently reset to 1.
    { id: 'flight_adults', label: 'Passengers', type: 'number', def: { kind: 'travellerCountPlaceholder' } },
    { id: 'flight_origin', label: 'Departing From', type: 'airport', def: { kind: 'literal', value: 'Dublin Airport (DUB)' }, row: 'flight_locations' },
    { id: 'flight_destination', label: 'Flying To', type: 'airport', def: { kind: 'destinationPlaceholder' }, row: 'flight_locations' },
    { id: 'flight_departure_date', label: 'Departure', type: 'date', def: { kind: 'dateRole', role: 'start' } },
    { id: 'flight_return_date', label: 'Return', type: 'date', def: { kind: 'dateRole', role: 'end' } },
    {
      id: 'flight_trip_type', label: 'Trip Type', type: 'single-select',
      def: { kind: 'literal', value: 'round trip' },
      options: [
        { value: 'round trip', label: 'Round trip' },
        { value: 'one-way', label: 'One-way', disables: ['flight_return_date'] },
      ],
    },
    {
      id: 'flight_class', label: 'Flight Class', type: 'single-select',
      def: { kind: 'literal', value: 'economy' },
      options: [
        { value: 'economy', label: 'Economy' },
        { value: 'premium_economy', label: 'Premium Economy' },
        { value: 'business', label: 'Business' },
        { value: 'first', label: 'First' },
      ],
    },
  ],
  stays: [
    // Same as flight_adults — drives stay_search's `adults`, which caps the guest picker.
    { id: 'stay_adults', label: 'Guests', type: 'number', def: { kind: 'travellerCountPlaceholder' } },
    { id: 'stay_destination', label: 'Staying In', type: 'text', def: { kind: 'destinationPlaceholder' } },
    { id: 'stay_check_in', label: 'Check-in', type: 'date', def: { kind: 'dateRole', role: 'start' } },
    { id: 'stay_check_out', label: 'Check-out', type: 'date', def: { kind: 'dateRole', role: 'end' } },
    {
      id: 'hotel_budget', label: 'Hotel Budget', type: 'slider',
      def: { kind: 'literal', value: 150 }, min: 50, max: 500, step: 10, unit: '€/night', row: 'stay_budget_rating',
    },
    {
      id: 'hotel_rating', label: 'Hotel Rating', type: 'slider',
      def: { kind: 'literal', value: 3 }, min: 1, max: 5, step: 1, unit: '★+', row: 'stay_budget_rating',
    },
    { id: 'stay_rooms', label: 'Rooms', type: 'number', def: { kind: 'travellerRoomsPlaceholder' } },
  ],
  cars: [
    { id: 'car_pickup_location', label: 'Pick-up Location', type: 'airport', def: { kind: 'destinationPlaceholder' }, row: 'car_location' },
    { id: 'car_dropoff_location', label: 'Drop-off Location', type: 'airport', def: { kind: 'destinationPlaceholder' }, row: 'car_location' },
    { id: 'car_pickup_date', label: 'Pick-up', type: 'date', def: { kind: 'dateRole', role: 'start' } },
    { id: 'car_dropoff_date', label: 'Drop-off', type: 'date', def: { kind: 'dateRole', role: 'end' } },
    { id: 'car_pickup_time', label: 'Pick-up Time', type: 'time', def: { kind: 'literal', value: '10:00' }, row: 'car_time' },
    { id: 'car_dropoff_time', label: 'Drop-off Time', type: 'time', def: { kind: 'literal', value: '10:00' }, row: 'car_time' },
    {
      id: 'car_size', label: 'Car Size', type: 'single-select',
      def: { kind: 'literal', value: 'economy' },
      options: [
        { value: 'economy', label: 'Economy' },
        { value: 'compact', label: 'Compact' },
        { value: 'standard', label: 'Standard' },
        { value: 'SUV', label: 'SUV' },
      ],
    },
    { id: 'car_driver_age', label: 'Driver Age', type: 'number', def: { kind: 'literal', value: 30 } },
  ],
};

/** Shared shape-mapping step used by every WizardQuestion[] builder here — just needs the
 *  field's already-resolved default, since how that's computed differs per caller. */
function fieldToWizardQuestion(field: BaseField, group: string, defaultValue: string | number): WizardQuestion {
  const question: WizardQuestion = { id: field.id, label: field.label, type: field.type, default: defaultValue, group };
  if (field.options) question.options = field.options;
  if (field.min !== undefined) question.min = field.min;
  if (field.max !== undefined) question.max = field.max;
  if (field.step !== undefined) question.step = field.step;
  if (field.unit !== undefined) question.unit = field.unit;
  if (field.row !== undefined) question.row = field.row;
  return question;
}

function includeToggleQuestion(agentType: AgentType): WizardQuestion {
  return {
    id: INCLUDE_TOGGLE_ID[agentType],
    label: INCLUDE_TOGGLE_LABEL[agentType],
    type: 'single-select',
    options: [
      { value: 'include', label: 'Include' },
      { value: 'exclude', label: 'Exclude', disables: BASE_FIELDS[agentType].map(f => f.id) },
    ],
    default: 'include',
    group: VERTICAL_GROUP[agentType],
  };
}

/** Whether a vertical's include/exclude toggle keeps it in the trip — defaults to included if the answer is missing. */
export function isVerticalIncluded(agentType: AgentType, answers: Record<string, WizardAnswer>): boolean {
  return answers[INCLUDE_TOGGLE_ID[agentType]] !== 'exclude';
}

function computeDateDefault(role: 'start' | 'end'): string {
  const daysAhead = role === 'start' ? 14 : 21; // two weeks out, one-week trip — a generic, always-valid fallback
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function resolveEditSearchDefault(
  field: BaseField,
  priorAnswers: Record<string, WizardAnswer> | null,
  destinationHint: string | null,
  travellerCountHint: number | null,
): string | number {
  const prior = priorAnswers?.[field.id];
  if (typeof prior === 'string' || typeof prior === 'number') return prior;
  switch (field.def.kind) {
    case 'literal': return field.def.value;
    case 'dateRole': return computeDateDefault(field.def.role);
    case 'destinationPlaceholder': return destinationHint ?? '';
    case 'travellerRoomsPlaceholder': return travellerCountHint ? Math.max(1, Math.ceil(travellerCountHint / 2)) : 1;
    case 'travellerCountPlaceholder': return travellerCountHint ?? 1;
  }
}

/** Powers GET .../edit-search — one vertical's question set, no include/exclude toggle.
 *  priorAnswers is null on first open (the wizard only hands off free text, never these
 *  fields), falling back to a two-week-out date range plus each field's own default. */
export function getEditSearchQuestions(
  agentType: AgentType,
  priorAnswers: Record<string, WizardAnswer> | null,
  destinationHint: string | null = null,
  travellerCountHint: number | null = null,
): WizardQuestion[] {
  const group = VERTICAL_GROUP[agentType];
  return BASE_FIELDS[agentType].map(field =>
    fieldToWizardQuestion(field, group, resolveEditSearchDefault(field, priorAnswers, destinationHint, travellerCountHint)),
  );
}

/** The wizard's step-3 batch: trip-wide dates + which verticals to search. Completely
 *  static, built in code rather than asked of the LLM, so it can never be skipped or
 *  malformed by a model failing to follow the "switch to choices now" instruction. */
export function getTripDatesQuestions(): WizardQuestion[] {
  return [
    { id: 'departure_date', label: 'Departure Date', type: 'date', required: true, group: 'trip_dates' },
    { id: 'return_date', label: 'Return Date', type: 'date', required: true, group: 'trip_dates' },
    {
      id: 'verticals', label: 'What do you need for this trip?', type: 'multi-select',
      options: [
        { value: 'flights', label: 'Flights' },
        { value: 'stays', label: 'Stays' },
        { value: 'cars', label: 'Cars' },
      ],
      default: ['flights', 'stays', 'cars'],
      // Required: with zero verticals there's nothing to search and no valid next step. The
      // client's canProceed treats an empty array as unanswered, keeping Continue disabled.
      required: true,
      group: 'trip_dates',
    },
  ];
}

/** Resolves one step-4 field's default from the trip-wide facts already captured in
 *  steps 1-3 */
function resolveTripIntakeDefault(
  field: BaseField,
  destination: string,
  travellerCount: number,
  departureDate: string,
  returnDate: string,
): string | number {
  switch (field.def.kind) {
    case 'literal': return field.def.value;
    case 'dateRole': return field.def.role === 'start' ? departureDate : returnDate;
    case 'destinationPlaceholder': return destination;
    case 'travellerRoomsPlaceholder': return Math.max(1, Math.ceil(travellerCount / 2));
    case 'travellerCountPlaceholder': return travellerCount;
  }
}

/** The wizard's step-4 batch — each selected vertical's include/exclude toggle plus its
 *  own fields, built deterministically (no LLM) from the same BASE_FIELDS template the
 *  intake prompt used to ask the model to regenerate. Emitted in AGENT_TYPES order so each renders as its own screen. */
export function buildTripIntakeVerticalQuestions(
  verticals: AgentType[],
  destination: string,
  travellerCount: number,
  departureDate: string,
  returnDate: string,
): WizardQuestion[] {
  const selected = new Set(verticals);
  return AGENT_TYPES.filter(agentType => selected.has(agentType)).flatMap((agentType): WizardQuestion[] => {
    const group = VERTICAL_GROUP[agentType];
    return [
      includeToggleQuestion(agentType),
      ...BASE_FIELDS[agentType].map(field =>
        fieldToWizardQuestion(field, group, resolveTripIntakeDefault(field, destination, travellerCount, departureDate, returnDate)),
      ),
    ];
  });
}
