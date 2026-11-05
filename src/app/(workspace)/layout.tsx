import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { getSession } from "@/lib/session";

export const instant = false;

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-[#111216]">
      <AppHeader user={session.user} />
      {children}
    </div>
  );
}
