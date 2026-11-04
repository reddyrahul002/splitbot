// .env.example is committed, so it must never hold a real key. Assertions compare booleans, so a failure can't print one.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../src/config';

/** Any GEMINI_API_KEY line with a value, including a commented-out or quoted one. An inline comment isn't a value. */
function hasKeyValue(text: string): boolean {
  return text.split('\n').some((line) => {
    const match = line.match(/^\s*(?:#\s*)?(?:export\s+)?GEMINI_API_KEY\s*=(.*)$/);
    if (!match) return false;
    const value = match[1]!.replace(/(^|\s)#.*$/, '').trim();
    return value.replace(/^(['"])(.*)\1$/, '$2').trim() !== '';
  });
}

const hasGoogleKeyPrefix = (text: string) => text.includes('AIza');

/** Any MONGODB_URI line with a value, including a commented-out or quoted one. An inline comment isn't a value. */
function hasUriValue(text: string): boolean {
  return text.split('\n').some((line) => {
    const match = line.match(/^\s*(?:#\s*)?(?:export\s+)?MONGODB_URI\s*=(.*)$/);
    if (!match) return false;
    const value = match[1]!.replace(/(^|\s)#.*$/, '').trim();
    return value.replace(/^(['"])(.*)\1$/, '$2').trim() !== '';
  });
}

/** A connection string anywhere in the file, even in a comment. */
const hasMongoScheme = (text: string) => /mongodb(\+srv)?:\/\//i.test(text);

describe('.env.example', () => {
  it('has an empty GEMINI_API_KEY', async () => {
    const text = await readFile(resolve(REPO_ROOT, '.env.example'), 'utf8');
    expect(text.includes('GEMINI_API_KEY'), '.env.example should still document GEMINI_API_KEY').toBe(true);
    expect(hasKeyValue(text), '.env.example has a value for GEMINI_API_KEY; it must stay empty').toBe(false);
  });

  it('has no string starting with "AIza"', async () => {
    const text = await readFile(resolve(REPO_ROOT, '.env.example'), 'utf8');
    expect(hasGoogleKeyPrefix(text), '.env.example contains a string starting with "AIza"; remove it and rotate the key').toBe(false);
  });

  it('has an empty MONGODB_URI', async () => {
    const text = await readFile(resolve(REPO_ROOT, '.env.example'), 'utf8');
    expect(/^MONGODB_URI=/m.test(text), '.env.example should still document MONGODB_URI').toBe(true);
    expect(hasUriValue(text), '.env.example has a value for MONGODB_URI; it must stay empty').toBe(false);
  });

  it('has no MongoDB connection string', async () => {
    const text = await readFile(resolve(REPO_ROOT, '.env.example'), 'utf8');
    expect(hasMongoScheme(text), '.env.example contains a MongoDB connection string; remove it and change the password').toBe(false);
  });
});

describe('the checks catch a leak (fake values)', () => {
  it.each(['GEMINI_API_KEY=abc', 'GEMINI_API_KEY = abc', ' export GEMINI_API_KEY=abc', 'GEMINI_API_KEY="abc"', "GEMINI_API_KEY='abc'", '# GEMINI_API_KEY=abc', 'A=1\nGEMINI_API_KEY=abc\nB=2'])(
    'a value is caught: %s',
    (text) => {
      expect(hasKeyValue(text)).toBe(true);
    },
  );

  it.each(['GEMINI_API_KEY=', 'GEMINI_API_KEY= ', 'GEMINI_API_KEY=""', "GEMINI_API_KEY=''", 'GEMINI_API_KEY= # paste yours in .env', '# Copy GEMINI_API_KEY to .env', 'GEMINI_MODEL=abc', ''])(
    'no value is fine: %j',
    (text) => {
      expect(hasKeyValue(text)).toBe(false);
    },
  );

  it('the "AIza" prefix is caught anywhere in the file', () => {
    for (const text of ['AIza', 'GEMINI_API_KEY=AIzafake', '# old key: AIzafake', 'OTHER=AIzafake']) {
      expect(hasGoogleKeyPrefix(text), text).toBe(true);
    }
    expect(hasGoogleKeyPrefix('GEMINI_MODEL=gemini-3.5-flash-lite')).toBe(false);
  });

  it.each(['MONGODB_URI=abc', 'MONGODB_URI = abc', ' export MONGODB_URI=abc', 'MONGODB_URI="abc"', "MONGODB_URI='abc'", '# MONGODB_URI=abc', 'A=1\nMONGODB_URI=abc\nB=2'])(
    'a URI value is caught: %s',
    (text) => {
      expect(hasUriValue(text)).toBe(true);
    },
  );

  it.each(['MONGODB_URI=', 'MONGODB_URI= ', 'MONGODB_URI=""', "MONGODB_URI=''", 'MONGODB_URI= # paste yours in .env', '# Copy MONGODB_URI to .env', 'STORE=mongo', ''])(
    'no URI value is fine: %j',
    (text) => {
      expect(hasUriValue(text)).toBe(false);
    },
  );

  it('a connection string is caught anywhere in the file', () => {
    // Joined at runtime so these can't look like real connection strings in the repo.
    for (const scheme of ['mongodb', 'mongodb+srv', 'MONGODB']) {
      for (const text of [`${scheme}://x`, `OTHER=${scheme}://x`, `# old: ${scheme}://x`]) {
        expect(hasMongoScheme(text), text).toBe(true);
      }
    }
    expect(hasMongoScheme('# MongoDB Atlas connection string; only used when STORE=mongo')).toBe(false);
  });
});
