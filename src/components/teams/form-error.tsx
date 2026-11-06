/** An inline error under a form. Empty messages render nothing. */
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm leading-5 text-destructive">
      {message}
    </p>
  );
}
