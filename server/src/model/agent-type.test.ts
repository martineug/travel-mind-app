import { describe, it, expect } from 'vitest';
import { isAgentType } from './agent-type';

describe('isAgentType', () => {
  it('returns true for each known agent type', () => {
    expect(isAgentType('flights')).toBe(true);
    expect(isAgentType('stays')).toBe(true);
    expect(isAgentType('cars')).toBe(true);
  });

  it('returns false for an arbitrary string', () => {
    expect(isAgentType('trains')).toBe(false);
  });

  it('returns false for undefined and non-string values', () => {
    expect(isAgentType(undefined)).toBe(false);
    expect(isAgentType(42)).toBe(false);
    expect(isAgentType(null)).toBe(false);
  });
});
