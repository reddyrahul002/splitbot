import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../src');
const TOKENS = join(SRC, 'styles/tokens.css');

function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

describe('colours live only in tokens.css', () => {
  it('#D35 no other source file has a hex colour', () => {
    const offenders = filesIn(SRC)
      .filter((path) => path !== TOKENS)
      .filter((path) => /#[0-9a-f]{3,8}\b/i.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('#D36 this really is looking at the source', () => {
    expect(filesIn(SRC).length).toBeGreaterThan(20);
    expect(readFileSync(TOKENS, 'utf8')).toMatch(/#[0-9a-f]{6}/);
  });
});
