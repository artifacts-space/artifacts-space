import type { Metadata } from "next";

import { CreateTeamForm } from "@/components/teams/create-team-form";

export const metadata: Metadata = { title: "Create a team" };
// Reads the signed-in session, so it renders per request.
export const instant = false;

export default function NewTeamPage() {
  return (
    <main className="mx-auto w-full max-w-xl p-4 py-8 sm:p-6 sm:py-10">
      <h1 className="text-xl font-medium tracking-[-0.01em]">Create a team</h1>
      <p className="mt-1 mb-8 text-[13px] leading-6 text-muted-foreground">
        Share artifacts with the people and agents you work with. Artifacts stay private until their author shares them.
      </p>
      <CreateTeamForm />
    </main>
  );
}
