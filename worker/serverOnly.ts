// The worker runs outside Next, where the real `server-only` package would throw on import. The
// worker's tsconfig maps `server-only` here so shared server code (lib/data, lib/server) loads.
export {}
