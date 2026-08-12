// Client-side mirror of the server's WizardQuestion/WizardQuestionOption/WizardAnswer
// (see server/src/model/wizard-question.ts).
export interface WizardQuestionOption {
  value: string;
  label: string;
  disables?: string[];   // ids of other questions in the same step to grey out/disable while this option is selected
}

export interface WizardQuestion {
  id: string;
  label: string;
  type: 'single-select' | 'multi-select' | 'slider' | 'number' | 'date' | 'text' | 'airport' | 'time';
  options?: WizardQuestionOption[];   // single-select / multi-select
  default?: string | string[] | number;
  required?: boolean;   // if true, the user must provide a non-empty answer before continuing
  group?: string;   // consecutive questions sharing the same group render together as one step
  row?: string;     // consecutive questions in the same group sharing this render side by side in one row
  min?: number;
  max?: number;
  step?: number;
  unit?: string;   // e.g. "€/night"
}

export type WizardAnswer = string | string[] | number;
