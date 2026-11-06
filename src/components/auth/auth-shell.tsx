import { Logo } from "@/components/logo";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-14 w-full max-w-[1440px] items-center px-6">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">{children}</main>
      <footer className="mx-auto w-full max-w-[1440px] px-6 py-6 text-sm text-muted-foreground">
        Artifacts are private by default. You can revoke any app or token at any time.
      </footer>
    </div>
  );
}
