// The passcode for this tab. sessionStorage survives a reload and clears when the tab closes, so no Lock button is needed.
export const PASSCODE_KEY = 'splitbot-passcode';

/** Storage can be missing or blocked. Then the passcode just isn't remembered, and the unlock screen asks again on reload. */
export function getStoredPasscode(): string | null {
  try {
    return sessionStorage.getItem(PASSCODE_KEY);
  } catch {
    return null;
  }
}

export function storePasscode(passcode: string): void {
  try {
    sessionStorage.setItem(PASSCODE_KEY, passcode);
  } catch {
    // Not remembered; see above.
  }
}

export function clearPasscode(): void {
  try {
    sessionStorage.removeItem(PASSCODE_KEY);
  } catch {
    // Nothing was remembered.
  }
}
