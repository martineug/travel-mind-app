import { WizardAnswer, WizardQuestion } from './models/wizard-question';

/** Turns a wizard submission into one free-text summary line, e.g. "Departure 2026-09-10
 *  Return 2026-09-17 Trip Type Round trip" — sent back as a chat message by both callers.
 *  Fields blanked because they were disabled at submit are skipped entirely, not shown empty. */
export function formatWizardAnswers(questions: WizardQuestion[], answers: Record<string, WizardAnswer>): string {
  return questions
    .filter(q => !isBlankAnswer(answers[q.id]))
    .map(q => `${q.label} ${formatWizardAnswerValue(q, answers[q.id])}`)
    .join(' ');
}

function isBlankAnswer(raw: WizardAnswer | undefined): boolean {
  return raw === '' || (Array.isArray(raw) && raw.length === 0);
}

export function formatWizardAnswerValue(question: WizardQuestion, raw: WizardAnswer | undefined): string {
  if (raw === undefined) return '(not specified)';

  if ((question.type === 'single-select' || question.type === 'multi-select') && question.options) {
    const values = Array.isArray(raw) ? raw : [raw];
    const labels = values.map(v => question.options!.find(o => o.value === v)?.label ?? String(v));
    return labels.length ? labels.join(', ') : 'None';
  }

  if (question.type === 'slider') {
    return `${raw}${question.unit ? ' ' + question.unit : ''}`;
  }

  return String(raw);
}
