export default function Loading() {
  return (
    // The same app shell as the workspace (see Dashboard), so the page does not jump when it arrives.
    <div data-app-shell className="mx-auto flex w-full max-w-none animate-pulse flex-col p-6 md:min-h-0 md:flex-1">
      <div className="h-6 w-28 rounded-sm bg-muted" />
      <div className="mt-2 h-4 w-44 rounded-sm bg-muted" />
      <div className="card-surface mt-6 grid gap-0 overflow-hidden md:min-h-0 md:flex-1 md:grid-rows-[min(360px,32dvh)_minmax(0,1fr)] lg:grid-cols-[280px_1fr] lg:grid-rows-[minmax(0,1fr)]">
        <div className="h-[560px] border-b bg-muted/40 md:h-auto lg:border-r lg:border-b-0" />
        <div className="h-[560px] bg-card md:h-auto" />
      </div>
    </div>
  );
}
