// Closes the server and the store on a signal, and forces an exit if either hangs.
export const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ShutdownDeps {
  closeServer: () => Promise<void>;
  closeStore: () => Promise<void>;
  exit: (code: number) => void;
  log: (message: string) => void;
}

export function gracefulShutdown({ closeServer, closeStore, exit, log }: ShutdownDeps): void {
  const timer = setTimeout(() => {
    log(`Shutdown: still closing after ${SHUTDOWN_TIMEOUT_MS / 1000} seconds, forcing exit.`);
    exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  closeServer()
    .then(closeStore)
    .then(
      () => {
        clearTimeout(timer);
        exit(0);
      },
      // Only a fixed message: a driver error can hold hosts or the URI.
      () => {
        clearTimeout(timer);
        log('Shutdown: closing failed.');
        exit(1);
      },
    );
}
