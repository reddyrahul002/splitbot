import { describe, expect, it } from 'vitest';
import { loadErrorToast } from '../src/toastLogic';

describe('loadErrorToast', () => {
  it('#C44 no error, no toast', () => {
    expect(loadErrorToast(null, true)).toBeNull();
    expect(loadErrorToast(null, false)).toBeNull();
  });

  it('#C45 before any data, the panels already show the error, so there is no toast', () => {
    expect(loadErrorToast('Server down', false)).toBeNull();
  });

  it('#C46 a failed refresh keeps the old numbers on screen, so the toast says why they may be stale', () => {
    expect(loadErrorToast('Server down', true)).toBe('Server down');
  });
});
