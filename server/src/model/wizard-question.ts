// Server-side mirror of the client's WizardQuestion/WizardQuestionOption/WizardAnswer
export interface WizardQuestionOption {
  value: string;
  label: string;
  disables?: string[];
}

export interface WizardQuestion {
  id: string;
  label: string;
  type: 'single-select' | 'multi-select' | 'slider' | 'number' | 'date' | 'text' | 'airport' | 'time';
  options?: WizardQuestionOption[];
  default?: string | string[] | number;
  required?: boolean;
  group?: string;
  /** render side by side */
  row?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export type WizardAnswer = string | string[] | number;
