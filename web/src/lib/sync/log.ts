export const logSync = {
  info: (message: string) => console.info(`[sync] ${message}`),
  error: (message: string, error?: unknown) =>
    error === undefined ? console.error(`[sync] ${message}`) : console.error(`[sync] ${message}`, error),
};
