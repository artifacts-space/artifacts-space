export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-none animate-pulse p-6">
      <div className="h-6 w-28 rounded-sm bg-muted" />
      <div className="mt-2 h-4 w-44 rounded-sm bg-muted" />
      <div className="mt-6 grid gap-0 overflow-hidden rounded-md border lg:grid-cols-[280px_1fr]">
        <div className="h-[560px] border-b bg-muted/40 lg:border-r lg:border-b-0" />
        <div className="h-[560px] bg-card" />
      </div>
    </div>
  );
}
