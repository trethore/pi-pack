import { describe, expect, it } from 'vitest';
import { isPlainObject } from '@trethore/shared/object.js';

class TestClass {
  value = true;
}

describe('isPlainObject', () => {
  it.each([
    ['null', null],
    ['array', []],
    ['date', new Date()],
    ['map', new Map()],
    ['set', new Set()],
    ['regular expression', /regex/],
    ['class instance', new TestClass()],
  ])('rejects %s values', (_label, value) => {
    expect(isPlainObject(value)).toBe(false);
  });

  it.each([
    ['object literal', {}],
    ['object with properties', { enabled: true }],
    ['object without a prototype', Object.create(null)],
  ])('accepts %s values', (_label, value) => {
    expect(isPlainObject(value)).toBe(true);
  });
});
