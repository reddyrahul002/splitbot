// The data every panel shows, refetched together after any change.
import { useCallback, useEffect, useState } from 'react';
import type { Account, Expense, GroupSummary, Person, Settlement, SettlePlan, SpendingSummary } from '@splitbot/shared';
import { getAccount, getExpenses, getGroups, getPeople, getSettlements, getSettlePlan, getSummary } from './api';

/** Wraps loads so only the newest one reports back; a slow older response can't overwrite newer data. */
export function latestOnly<T>(deliver: (value: T) => void, onError: (err: unknown) => void) {
  let newest = 0;
  return async (load: () => Promise<T>): Promise<void> => {
    const id = ++newest;
    try {
      const value = await load();
      if (id === newest) deliver(value);
    } catch (err) {
      if (id === newest) onError(err);
    }
  };
}

interface AppData {
  people: Person[];
  account: Account | null;
  plan: SettlePlan | null;
  expenses: Expense[] | null;
  settlements: Settlement[] | null;
  summary: SpendingSummary | null;
  groups: GroupSummary[] | null;
}

export function useAppData() {
  const [data, setData] = useState<AppData>({ people: [], account: null, plan: null, expenses: null, settlements: null, summary: null, groups: null });
  const [error, setError] = useState<string | null>(null);

  const [load] = useState(() =>
    latestOnly<AppData>(
      (next) => {
        setData(next);
        setError(null);
      },
      // A failure keeps the last data on screen.
      (err) => setError(err instanceof Error ? err.message : String(err)),
    ),
  );

  const refresh = useCallback(() => {
    void load(async () => {
      const [people, account, plan, expenses, settlements, summary, groups] = await Promise.all([
        getPeople(),
        getAccount(),
        getSettlePlan(),
        getExpenses(),
        getSettlements(),
        getSummary(),
        getGroups(),
      ]);
      return { people, account, plan, expenses, settlements, summary, groups };
    });
  }, [load]);

  useEffect(refresh, [refresh]);

  return { ...data, error, refresh };
}
