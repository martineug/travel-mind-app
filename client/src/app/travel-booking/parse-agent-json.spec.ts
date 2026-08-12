import { parseAgentJson } from './parse-agent-json';

describe('parseAgentJson', () => {
  it('parses a balanced JSON object', () => {
    expect(parseAgentJson('{"action":"chat","message":"hi"}')).toEqual({ action: 'chat', message: 'hi' });
  });

  it('parses JSON wrapped in code fences', () => {
    expect(parseAgentJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('ignores trailing garbage after the first balanced object', () => {
    expect(parseAgentJson('{"a":1}{"a":2} some extra text')).toEqual({ a: 1 });
  });

  it('returns null when braces never balance', () => {
    expect(parseAgentJson('{"a":1')).toBeNull();
  });

  it('returns null when there is no opening brace at all', () => {
    expect(parseAgentJson('no json here')).toBeNull();
  });

  it('does not let braces inside a quoted string affect depth counting', () => {
    expect(parseAgentJson('{"message":"a { b } c"}')).toEqual({ message: 'a { b } c' });
  });

  it('does not let an escaped quote end a string early', () => {
    expect(parseAgentJson('{"message":"say \\"hi\\""}')).toEqual({ message: 'say "hi"' });
  });
});
