import { Tool } from '../tool';

export const calculatorTool = new Tool(
  'calculator',
  'Evaluate a mathematical expression. Supports +, -, *, /, **, %, //.',
  {
    expression: { type: 'string', description: "A math expression, e.g. '(45 * 12) + 98'" },
  },
  (args: Record<string, any>) => {
    const expression = args['expression'] as string;

    // Safe evaluation — only numbers and arithmetic operators
    if (!/^[\d\s+\-*/().%**]+$/.test(expression)) {
      return 'Error: invalid expression';
    }
    const result = Function(`"use strict"; return (${expression})`)();
    return `${expression} = ${result}`;
  },
);
