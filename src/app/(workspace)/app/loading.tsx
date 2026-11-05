export default function Loading() {
  return (
    <div className="animate-pulse p-6">
      <div className="h-4 w-28 rounded bg-white/[0.06]" />
      <div className="mt-4 h-8 w-64 rounded bg-white/[0.06]" />
      <div className="mt-8 grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="h-[540px] rounded-lg border border-white/[0.06] bg-white/[0.02]" />
        <div className="h-[540px] rounded-lg border border-white/[0.06] bg-white/[0.02]" />
      </div>
    </div>
  );
}
