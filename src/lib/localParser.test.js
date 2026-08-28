import { describe, it, expect } from 'vitest';
import { parseLocalMulti, knownFoodNames } from './localParser.js';

const byName = (items, name) => items.find((i) => i.name.toLowerCase().includes(name));

describe('parseLocalMulti', () => {
  it('returns nothing for empty or unrecognised input', () => {
    expect(parseLocalMulti('')).toEqual([]);
    expect(parseLocalMulti(null)).toEqual([]);
    expect(parseLocalMulti('a plate of xyzzy')).toEqual([]);
  });

  it('understands household units instead of treating every number as grams', () => {
    const [rice] = parseLocalMulti('2 cups rice');
    expect(rice.weight).toBe(400); // not 2 grams, as the original produced
  });

  it('reads explicit gram weights', () => {
    const [rice] = parseLocalMulti('200g rice');
    expect(rice.weight).toBe(200);
  });

  it('treats a small bare number as a count of portions', () => {
    const [roti] = parseLocalMulti('2 roti');
    expect(roti.weight).toBeGreaterThan(2);
  });

  it('splits multiple foods and gives each its own quantity', () => {
    const items = parseLocalMulti('200g rice and 2 cups milk');
    expect(items.length).toBe(2);
    expect(byName(items, 'rice').weight).toBe(200);
    expect(byName(items, 'milk').weight).toBe(400);
  });

  it('does not borrow a later food quantity for an earlier one', () => {
    const items = parseLocalMulti('rice and 2 roti');
    expect(byName(items, 'rice').weight).toBe(100); // the default portion
  });

  it('handles fractions and word numbers', () => {
    expect(parseLocalMulti('1/2 cup rice')[0].weight).toBe(100);
    expect(parseLocalMulti('one cup rice')[0].weight).toBe(200);
  });

  it('resolves aliases', () => {
    expect(parseLocalMulti('a bowl of dal').length).toBe(1);
    expect(parseLocalMulti('palak sabzi').length).toBe(1);
  });

  it('scales nutrition with the weight', () => {
    const small = parseLocalMulti('100g rice')[0];
    const large = parseLocalMulti('300g rice')[0];
    expect(large.calories).toBeCloseTo(small.calories * 3, 4);
  });

  it('never emits NaN or negative values', () => {
    for (const text of ['0g rice', '-5 cups rice', 'rice rice rice', '999999 kg rice']) {
      for (const item of parseLocalMulti(text)) {
        expect(Number.isFinite(item.calories)).toBe(true);
        expect(item.calories).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(item.weight)).toBe(true);
      }
    }
  });

  it('distinguishes raw from cooked', () => {
    const raw = parseLocalMulti('100g raw spinach')[0];
    const cooked = parseLocalMulti('100g spinach')[0];
    expect(raw.state).toBe('raw');
    expect(cooked.state).toBe('cooked');
  });

  it('does not log the same food twice from one sentence', () => {
    expect(parseLocalMulti('rice and rice').length).toBe(1);
  });
});

describe('knownFoodNames', () => {
  it('lists the offline database', () => {
    const names = knownFoodNames();
    expect(names.length).toBeGreaterThan(5);
    expect(names).toEqual([...names].sort());
  });
});
