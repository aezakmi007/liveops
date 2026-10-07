export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">LiveOps</h1>
      <p className="max-w-md text-sm text-neutral-500 dark:text-neutral-400">
        Real-time observability dashboard. Day 1 scaffolding is in place
        (monorepo, ws-server, shared schema, CI). The live log stream and
        dashboard UI land over the next days.
      </p>
    </main>
  );
}
