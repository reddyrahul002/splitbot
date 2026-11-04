import { useCallback, useEffect, useState } from 'react';
import type { Person } from '@splitbot/shared';
import { getPeople } from './api';
import { Chat } from './components/Chat';

export function App() {
  const [people, setPeople] = useState<Person[]>([]);

  const refreshPeople = useCallback(() => {
    // A failure keeps the last list; if the server is down, the chat says so when it's used.
    getPeople().then(setPeople, () => {});
  }, []);

  useEffect(refreshPeople, [refreshPeople]);

  return (
    <main className="app">
      <h1>SplitBot</h1>
      <Chat people={people} onChange={refreshPeople} />
    </main>
  );
}
