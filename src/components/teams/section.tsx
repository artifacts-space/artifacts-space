/** A bordered card section with a heading, used on team pages. */
export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string | undefined;
  children: React.ReactNode;
  action?: React.ReactNode | undefined;
}) {
  return (
    <section className="overflow-hidden rounded-md border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-md font-medium">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
