import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', async () => {
  const { createTestDb } = await import('../test-utils/create-test-db');
  const testDb = createTestDb();
  return { getDb: () => testDb };
});

import { Tool } from './tool';

describe('Tool', () => {
  describe('run', () => {
    it('returns the wrapped function\'s string result', async () => {
      const tool = new Tool('echo', 'echoes input', {}, (args) => `got:${args.value}`);
      expect(await tool.run({ value: 'x' })).toBe('got:x');
    });

    it('stringifies a non-string result', async () => {
      const tool = new Tool('num', 'returns a number', {}, () => 42 as unknown as string);
      expect(await tool.run({})).toBe('42');
    });

    it('catches a synchronous throw into an error string', async () => {
      const tool = new Tool('boom', 'throws', {}, () => { throw new Error('boom'); });
      const result = await tool.run({});
      expect(result).toContain('Error running boom');
      expect(result).toContain('boom');
    });

    it('catches an async rejection into an error string', async () => {
      const tool = new Tool('boom-async', 'rejects', {}, async () => { throw new Error('async boom'); });
      const result = await tool.run({});
      expect(result).toContain('Error running boom-async');
      expect(result).toContain('async boom');
    });
  });

  describe('toOllamaSchema', () => {
    it('builds the expected function-calling schema shape', () => {
      const tool = new Tool(
        'search',
        'searches for things',
        { query: { type: 'string', description: 'the search query' } },
        () => '',
      );

      expect(tool.toOllamaSchema()).toEqual({
        type: 'function',
        function: {
          name: 'search',
          description: 'searches for things',
          parameters: {
            type: 'object',
            required: ['query'],
            properties: { query: { type: 'string', description: 'the search query' } },
          },
        },
      });
    });
  });
});
