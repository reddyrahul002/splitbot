import { describe, expect, it } from 'vitest';
import type { Person } from '@splitbot/shared';
import {
  capitalizeName,
  checkAmounts,
  checkNames,
  currentExpenseMessages,
  extractNumbers,
  findCloseName,
  hasDatePhrase,
  levenshtein,
  respelledNames,
  splitWays,
  unnamedPeople,
} from '../src/domain/guardrails';

const ME: Person = { id: 'me', name: 'Me' };
const ARUN: Person = { id: 'arun', name: 'Arun' };
const MEI: Person = { id: 'mei', name: 'Mei' };
const PEOPLE = [ME, ARUN, MEI];

const DINNER_MSG = 'Dinner $90, I paid, split with Arun and Mei, Arun had $12 of drinks';

function codes(ws: { code: string }[]): string[] {
  return ws.map((w) => w.code);
}

describe('extractNumbers', () => {
  it('#40 dollar signs, plain numbers, "bucks" and trailing .00', () => {
    for (const msg of ['$90', '90', '90 bucks', '$90.00']) expect(extractNumbers(msg)).toEqual([90]);
  });

  it('#41 thousands commas', () => {
    expect(extractNumbers('rent $1,800')).toEqual([1800]);
    expect(extractNumbers('1,800.50 total')).toEqual([1800.5]);
    expect(extractNumbers('$1,234,567')).toEqual([1234567]);
  });

  it('#42 decimals', () => {
    expect(extractNumbers('12.5')).toEqual([12.5]);
    expect(extractNumbers('$12.50')).toEqual([12.5]);
    expect(extractNumbers('$.50 tip')).toEqual([0.5]);
  });

  it('#43 several numbers in one message', () => {
    expect(extractNumbers(DINNER_MSG)).toEqual([90, 12]);
  });

  it('#44 percent and share ratios', () => {
    expect(extractNumbers('rent 1800 split 60/40 with Arun')).toEqual([1800, 60, 40]);
    expect(extractNumbers('split 2:1:1')).toEqual([2, 1, 1]);
    expect(extractNumbers('1.5:1')).toEqual([1.5, 1]);
  });

  it('#45 a comma is only a thousands separator when exactly 3 digits follow', () => {
    expect(extractNumbers('10,20')).toEqual([10, 20]);
    expect(extractNumbers('1,8000')).toEqual([1, 8000]);
  });

  it('#46 no numbers', () => {
    expect(extractNumbers('lunch with Arun')).toEqual([]);
    expect(extractNumbers('')).toEqual([]);
  });
});

describe('checkAmounts', () => {
  it('#47 a total that is not in the message gets a warning', () => {
    expect(checkAmounts('Dinner $90 with Arun', { totalCents: 9500, splitType: 'equal' }, PEOPLE)).toEqual([
      { code: 'AMOUNT_NOT_IN_MESSAGE', message: "Total $95.00 wasn't in your message, please check." },
    ]);
  });

  it('#48 total and adjustment both in the message: no warnings', () => {
    const split = { totalCents: 9000, splitType: 'equal' as const, adjustments: [{ person: 'arun', cents: 1200 }] };
    expect(checkAmounts(DINNER_MSG, split, PEOPLE)).toEqual([]);
  });

  it('#49 a missing adjustment gets a warning naming the person', () => {
    const split = { totalCents: 9000, splitType: 'equal' as const, adjustments: [{ person: 'arun', cents: 1500 }] };
    expect(checkAmounts(DINNER_MSG, split, PEOPLE)).toEqual([
      { code: 'AMOUNT_NOT_IN_MESSAGE', message: "Arun's extra $15.00 wasn't in your message, please check." },
    ]);
  });

  it('#50 percentages are checked', () => {
    const msg = 'rent 1800 split 60/40 with Arun';
    expect(checkAmounts(msg, { totalCents: 180000, splitType: 'percent', percent: { me: 60, arun: 40 } }, PEOPLE)).toEqual(
      [],
    );
    expect(checkAmounts(msg, { totalCents: 180000, splitType: 'percent', percent: { me: 30, arun: 70 } }, PEOPLE)).toEqual([
      { code: 'AMOUNT_NOT_IN_MESSAGE', message: "Me's 30% wasn't in your message, please check." },
      { code: 'AMOUNT_NOT_IN_MESSAGE', message: "Arun's 70% wasn't in your message, please check." },
    ]);
  });

  it('#51 share counts are checked', () => {
    const msg = 'groceries $100 split 2:1:1 with Arun and Mei';
    const ok = { totalCents: 10000, splitType: 'shares' as const, shares: { me: 2, arun: 1, mei: 1 } };
    expect(checkAmounts(msg, ok, PEOPLE)).toEqual([]);
    const bad = { ...ok, shares: { me: 3, arun: 1, mei: 1 } };
    expect(checkAmounts(msg, bad, PEOPLE)).toEqual([
      { code: 'AMOUNT_NOT_IN_MESSAGE', message: "Me's share count 3 wasn't in your message, please check." },
    ]);
  });

  it('#52 equal split: only the total and adjustments are checked', () => {
    expect(checkAmounts('Uber $24 Mei paid split 3 ways', { totalCents: 2400, splitType: 'equal' }, PEOPLE)).toEqual([]);
  });

  it('#53 a total the model added up from parts gets a warning', () => {
    const msg = 'Dinner: I had $50 and Arun had $40';
    const split = { totalCents: 9000, splitType: 'exact' as const, exact: { me: 5000, arun: 4000 } };
    expect(codes(checkAmounts(msg, split, PEOPLE))).toEqual(['AMOUNT_NOT_IN_MESSAGE']);
    expect(checkAmounts(msg, split, PEOPLE)[0]!.message).toMatch(/^Total \$90\.00/);
  });

  it('#65 exact amounts are checked', () => {
    const msg = 'Dinner $90: I had $50 and Arun had $40';
    const ok = { totalCents: 9000, splitType: 'exact' as const, exact: { me: 5000, arun: 4000 } };
    expect(checkAmounts(msg, ok, PEOPLE)).toEqual([]);
    const bad = { ...ok, exact: { me: 4500, arun: 4500 } };
    expect(checkAmounts(msg, bad, PEOPLE)).toEqual([
      { code: 'AMOUNT_NOT_IN_MESSAGE', message: "Me's amount $45.00 wasn't in your message, please check." },
      { code: 'AMOUNT_NOT_IN_MESSAGE', message: "Arun's amount $45.00 wasn't in your message, please check." },
    ]);
  });

  it('#66 zero values are not checked', () => {
    const exact = { totalCents: 9000, splitType: 'exact' as const, exact: { me: 9000, mei: 0 } };
    expect(checkAmounts('Dinner $90, all mine, Mei owes nothing', exact, PEOPLE)).toEqual([]);
    const percent = { totalCents: 9000, splitType: 'percent' as const, percent: { me: 100, mei: 0 } };
    expect(checkAmounts('Dinner $90, 100% on me, Mei with me', percent, PEOPLE)).toEqual([]);
  });

  it('#72 a time like 7:30pm adds numbers but no false warnings', () => {
    expect(extractNumbers('$90 dinner, 7:30pm')).toEqual([90, 7, 30]);
    expect(checkAmounts('$90 dinner, 7:30pm', { totalCents: 9000, splitType: 'equal' }, PEOPLE)).toEqual([]);
    expect(codes(checkAmounts('$90 dinner, 7:30pm', { totalCents: 9500, splitType: 'equal' }, PEOPLE))).toEqual([
      'AMOUNT_NOT_IN_MESSAGE',
    ]);
  });

  it('falls back to the person id when the name is unknown', () => {
    const split = { totalCents: 9000, splitType: 'equal' as const, adjustments: [{ person: 'kai', cents: 700 }] };
    expect(checkAmounts(DINNER_MSG, split, PEOPLE)[0]!.message).toBe("kai's extra $7.00 wasn't in your message, please check.");
  });
});

describe('levenshtein', () => {
  it('#54 standard distances, case-insensitive', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('Arun', 'Arun')).toBe(0);
    expect(levenshtein('', 'Mei')).toBe(3);
    expect(levenshtein('Mei', '')).toBe(3);
    expect(levenshtein('ARUN', 'arun')).toBe(0);
    expect(levenshtein('Aroon', 'Arun')).toBe(2);
  });
});

describe('close-name check', () => {
  it('#55 "Aroon" looks like "Arun"', () => {
    expect(findCloseName('Aroon', PEOPLE)).toEqual(ARUN);
    expect(checkNames({ paidBy: 'me', participants: ['me', 'Aroon'] }, PEOPLE)).toEqual([
      {
        code: 'CLOSE_NAME',
        message: "'Aroon' looks like existing person 'Arun'. Use Arun?",
        suggestion: { name: 'Aroon', person: ARUN },
      },
    ]);
  });

  it('#56 "Ana" is not close to "Arun"', () => {
    expect(findCloseName('Ana', PEOPLE)).toBeNull();
    expect(checkNames({ paidBy: 'me', participants: ['me', 'Ana'] }, PEOPLE)).toEqual([]);
  });

  it('#57 an exact match ignoring case and spaces gives no warning', () => {
    expect(findCloseName(' arun ', PEOPLE)).toBeNull();
    expect(checkNames({ paidBy: 'ARUN', participants: [' arun ', 'mei'] }, PEOPLE)).toEqual([]);
  });

  it('#58 short names allow a distance of 1 only; the longer name sets the threshold', () => {
    expect(findCloseName('Meg', PEOPLE)).toEqual(MEI);
    expect(findCloseName('Al', [ME, { id: 'ed', name: 'Ed' }])).toBeNull();
    // Longer name has 5 letters → ≤2: "Lia"/"Lilia" (distance 2) is close.
    const lilia = { id: 'lilia', name: 'Lilia' };
    expect(findCloseName('Lia', [ME, lilia])).toEqual(lilia);
    // Longer name has 4 letters → ≤1: "Lia"/"Lino" (distance 2) is not.
    expect(findCloseName('Lia', [ME, { id: 'lino', name: 'Lino' }])).toBeNull();
  });

  it('#59 the shared-prefix rule needs at least 3 letters', () => {
    const robert = { id: 'robert', name: 'Robert' };
    expect(findCloseName('Rob', [ME, robert])).toEqual(robert);
    expect(findCloseName('Meiling', PEOPLE)).toEqual(MEI);
    expect(findCloseName('Ar', PEOPLE)).toBeNull();
  });

  it('#60 an exact match on one person beats a close match on another', () => {
    const aran = { id: 'aran', name: 'Aran' };
    expect(findCloseName('Aran', [ME, ARUN, aran])).toBeNull();
  });

  it('#61 the closest match wins; ties go in people order', () => {
    const aron = { id: 'aron', name: 'Aron' };
    expect(findCloseName('Aroon', [ME, ARUN, aron])).toEqual(aron);
    const meg = { id: 'meg', name: 'Meg' };
    expect(findCloseName('Mea', [ME, MEI, meg])).toEqual(MEI);
    expect(findCloseName('Mea', [ME, meg, MEI])).toEqual(meg);
  });

  it('#62 the payer name is checked too, once per name', () => {
    expect(codes(checkNames({ paidBy: 'Aroon', participants: ['me', 'Mei'] }, PEOPLE))).toEqual(['CLOSE_NAME']);
    expect(codes(checkNames({ paidBy: 'Aroon', participants: ['Aroon', 'me'] }, PEOPLE))).toEqual(['CLOSE_NAME']);
  });

  it('#63 "me" is never compared', () => {
    expect(findCloseName('Mo', PEOPLE)).toBeNull();
    expect(checkNames({ paidBy: 'me', participants: ['me', 'Mo'] }, PEOPLE)).toEqual([]);
  });

  it('#64 accents: "Jose" looks like "José", and NFD vs NFC is an exact match', () => {
    const jose = { id: 'jose', name: 'José' };
    expect(findCloseName('Jose', [ME, jose])).toEqual(jose);
    expect(findCloseName('José', [ME, jose])).toBeNull();
  });

  it('#70 empty or whitespace names are ignored', () => {
    const j = { id: 'j', name: 'J' };
    expect(findCloseName('', [ME, j])).toBeNull();
    expect(findCloseName('   ', [ME, j])).toBeNull();
    expect(checkNames({ paidBy: 'me', participants: ['me', '  ', ''] }, [ME, j])).toEqual([]);
  });

  it("#71 an exact match on me's display name counts as exact", () => {
    const meRahul = { id: 'me', name: 'Rahul' };
    const rahim = { id: 'rahim', name: 'Rahim' };
    expect(findCloseName('Rahul', [meRahul, rahim])).toBeNull();
    expect(checkNames({ paidBy: ' rahul ', participants: ['Rahul', 'Rahim'] }, [meRahul, rahim])).toEqual([]);
    // me is still never suggested: "Rahol" is 1 edit from me's name, but only Rahim (2 edits) can be offered.
    expect(findCloseName('Rahol', [meRahul, rahim])).toEqual(rahim);
  });

  it('a brand-new name with nothing close gives no warning', () => {
    expect(checkNames({ paidBy: 'me', participants: ['me', 'Priya'] }, PEOPLE)).toEqual([]);
  });
});

describe('unnamedPeople (Step 4)', () => {
  it('#74 names in the text count, whatever the case, punctuation or possessive', () => {
    expect(unnamedPeople(['Arun', 'Mei'], DINNER_MSG)).toEqual([]);
    expect(unnamedPeople(['Arun', 'Mei'], "dinner with arun, it was mei's treat!")).toEqual([]);
  });

  it('#75 a name the user never wrote is returned', () => {
    expect(unnamedPeople(['Mei', 'Arun'], 'Uber $24 Mei paid split 3 ways')).toEqual(['Arun']);
  });

  it('#76 a close spelling of a word in the text counts as named', () => {
    expect(unnamedPeople(['Arun'], 'Lunch $40 split with Aroon')).toEqual([]);
    expect(unnamedPeople(['José'], 'taxi with jose')).toEqual([]);
  });

  it('#77 pronouns are not names: "me" in the text does not name Mei', () => {
    expect(unnamedPeople(['Mei'], 'Taxi $30, split it with me')).toEqual(['Mei']);
    expect(unnamedPeople(['Kai'], 'just me and him')).toEqual(['Kai']);
  });

  it("#78 the user is never checked: 'me', and me's display name", () => {
    expect(unnamedPeople(['me', ' ME '], 'Dinner $50')).toEqual([]);
    expect(unnamedPeople(['Rahul'], 'Dinner $50', 'Rahul')).toEqual([]);
    expect(unnamedPeople(['Rahul'], 'Dinner $50')).toEqual(['Rahul']);
  });

  it('#79 multi-word names match as a phrase', () => {
    expect(unnamedPeople(['Mary Ann'], 'Dinner with Mary Ann and Kai')).toEqual([]);
    expect(unnamedPeople(['Mary Ann'], 'Dinner with Kai')).toEqual(['Mary Ann']);
  });

  it('#80 each missing name once, as first written; empty names ignored', () => {
    expect(unnamedPeople(['Arun', ' arun ', '', 'Mei'], 'Dinner $50')).toEqual(['Arun', 'Mei']);
  });
});

describe('splitWays (Step 4)', () => {
  it('#81 digits: "split 3 ways", "4 way split"', () => {
    expect(splitWays('Uber $24 Mei paid split 3 ways')).toBe(3);
    expect(splitWays('pizza $40, 4 way split')).toBe(4);
  });

  it('#82 number words, any case: "three ways", "Two Ways"', () => {
    expect(splitWays('split it three ways')).toBe(3);
    expect(splitWays('Two Ways please')).toBe(2);
    expect(splitWays('ten ways')).toBe(10);
  });

  it('#83 hyphenated: "3-way", "three-way split"', () => {
    expect(splitWays('a 3-way split')).toBe(3);
    expect(splitWays('three-way split of $90')).toBe(3);
  });

  it('#84 no "N ways" phrase → null; "always", "anyway" and a bare number don\'t count', () => {
    expect(splitWays('Dinner $90 split with Arun and Mei')).toBeNull();
    expect(splitWays('I always pay, anyway: $30 with Mei')).toBeNull();
    expect(splitWays('3 people, $30 bus ways')).toBeNull();
    expect(splitWays('')).toBeNull();
  });

  it('#85 several mentions: the last one wins (the user corrected it)', () => {
    expect(splitWays('split 3 ways\nactually 4 ways')).toBe(4);
  });

  it('#86 only "N ways" or "N-way split": a "3-way adapter" or "two-way radio" is not a split', () => {
    expect(splitWays('3-way adapter $15 with Mei')).toBeNull();
    expect(splitWays('two-way radio $40, split with Arun')).toBeNull();
    expect(splitWays('3 way adapter, split it 2 ways')).toBe(2);
    expect(splitWays('split 3-ways')).toBe(3);
  });
});

describe('hasDatePhrase (Step 5)', () => {
  it.each([
    'Dinner $90 yesterday',
    'Lunch today',
    'Uber tomorrow',
    "today's lunch",
    'Dinner last night',
    'Coffee this morning',
    'Rent last month',
    'Hotel last week',
    'Pizza on Friday',
    'pizza FRIDAY',
    'Dinner last fri',
    'Lunch on tue',
    'Taxi 3 days ago',
    'Taxi a week ago',
    'Dinner on 27/10',
    'Dinner 27/10/2026',
    'Dinner 10-27-2026',
    'Dinner 2026-10-27',
    'Dinner Oct 27',
    'Dinner 27 October',
    'Dinner 27th of oct',
    'Dinner on the 3rd',
    'Flights in March',
    'Dinner 27-10 $40',
    'Dinner 27.10 $40',
    'Dinner on 3rd',
    'Dinner on 27/10, $40',
  ])('#89 "%s" has a date phrase', (text) => {
    expect(hasDatePhrase(text)).toBe(true);
  });

  it.each([
    '',
    'Dinner $90, I paid, split with Arun and Mei, Arun had $12 of drinks',
    'rent 1800 split 60/40 with Arun',
    'dinner 50/50 with Mei',
    'tickets $150 split 2:1 with Mei',
    '$90 dinner, 7:30pm',
    'Uber $24 Mei paid split 3 ways',
    'Birthday dinner $50 with Mei',
    'Sat with Mei, coffee $20',
    'Lunch with Jan and April, $30',
    'we may split it, $30',
    'Lunch $40, nowadays with Arun',
    'rent 60-40 with Arun',
    'split 60.40',
    'Coffee $27.10',
    'Lunch $12.25 with Mei',
    'Coffee 12.5',
    'Lunch 12.25 with Mei',
    'Parking 9.99',
    'tickets 1.5:1 with Mei',
    'Rent 1,800.10 with Arun',
  ])('#90 "%s" has none', (text) => {
    expect(hasDatePhrase(text)).toBe(false);
  });
});

describe('respelledNames (Step 5)', () => {
  it('#91 a name that is only a close spelling of what the user wrote is reported', () => {
    expect(respelledNames(['me', 'mowlya'], 'Lunch $20 with molya')).toEqual([{ typed: 'molya', used: 'mowlya' }]);
  });

  it("#92 keeps the user's own casing for what they typed", () => {
    expect(respelledNames(['Mowlya'], 'Lunch $20 with Molya')).toEqual([{ typed: 'Molya', used: 'Mowlya' }]);
  });

  it('#93 a name the user wrote is not reported, whatever the case or possessive', () => {
    expect(respelledNames(['Arun', 'MEI'], "Arun's lunch with mei")).toEqual([]);
    expect(respelledNames(['Mary Jane'], 'Lunch with mary jane')).toEqual([]);
  });

  it('#94 the user is never reported, and each name is reported once', () => {
    expect(respelledNames(['me', 'Rahul'], 'Lunch with Rahil', 'Rahul')).toEqual([]);
    expect(respelledNames(['Mowlya', 'mowlya'], 'with molya')).toEqual([{ typed: 'molya', used: 'Mowlya' }]);
  });

  it('#95 no close word means nothing to report (UNNAMED_PERSON covers that)', () => {
    expect(respelledNames(['Kai'], 'Lunch $20 with Arun')).toEqual([]);
    expect(respelledNames(['Mei'], 'split with me')).toEqual([]);
  });

  it('#96 a nickname expanded by the prefix rule is reported', () => {
    expect(respelledNames(['Robert'], 'Lunch with Rob')).toEqual([{ typed: 'Rob', used: 'Robert' }]);
  });

  it('#99 a hyphenated name written by the user is not reported', () => {
    expect(respelledNames(['Anne-Marie'], 'Lunch with Anne-Marie')).toEqual([]);
    expect(respelledNames(['Jean-Luc'], 'Lunch with jean-luc')).toEqual([]);
    expect(respelledNames(['Anne-Marie'], "Anne-Marie's lunch")).toEqual([]);
  });

  it('#100 straight and curly apostrophes are the same', () => {
    expect(respelledNames(["O'Brien"], 'Lunch with O’Brien')).toEqual([]);
    expect(respelledNames(['O’Brien'], "Lunch with O'Brien")).toEqual([]);
    expect(respelledNames(["O'Brien"], 'O’Brien’s lunch')).toEqual([]);
  });

  it('#101 a real respelling of a hyphenated name is reported as one word', () => {
    expect(respelledNames(['Anne-Marie'], 'Lunch with Anne-Mari')).toEqual([{ typed: 'Anne-Mari', used: 'Anne-Marie' }]);
  });

  it('#102 each part of a hyphenated word still names someone', () => {
    expect(unnamedPeople(['Anne-Marie'], 'Lunch with Anne-Marie')).toEqual([]);
    expect(unnamedPeople(['Marie'], 'Lunch with Anne-Marie')).toEqual([]);
    expect(respelledNames(['Mei'], 'Arun-Mei split')).toEqual([]);
  });
});

describe('capitalizeName (Step 5)', () => {
  it('#97 capitalizes the first letter of each word and trims', () => {
    expect(capitalizeName('mowlya')).toBe('Mowlya');
    expect(capitalizeName(' kai ')).toBe('Kai');
    expect(capitalizeName('mary jane')).toBe('Mary Jane');
    expect(capitalizeName('anne-marie')).toBe('Anne-Marie');
    expect(capitalizeName('élodie')).toBe('Élodie');
  });

  it('#98 leaves the other letters as typed', () => {
    expect(capitalizeName('McDonald')).toBe('McDonald');
    expect(capitalizeName('MEI')).toBe('MEI');
    expect(capitalizeName('')).toBe('');
  });
});

describe('currentExpenseMessages (Step 4 review)', () => {
  it('#87 the latest user message with a number, plus any after it', () => {
    expect(currentExpenseMessages(['Uber $24 Mei paid split 3 ways', 'Arun'])).toEqual(['Uber $24 Mei paid split 3 ways', 'Arun']);
    expect(currentExpenseMessages(['Uber $24 Mei paid split 3 ways', 'Arun', 'Lunch $20 with Mei'])).toEqual(['Lunch $20 with Mei']);
    expect(currentExpenseMessages(['Dinner with Arun', 'it was $40', 'I paid'])).toEqual(['it was $40', 'I paid']);
  });

  it('#88 no number in any message → all of them; no messages → none', () => {
    expect(currentExpenseMessages(['Dinner with Arun', 'I paid'])).toEqual(['Dinner with Arun', 'I paid']);
    expect(currentExpenseMessages([])).toEqual([]);
  });
});
