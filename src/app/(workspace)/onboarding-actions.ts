"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/lib/artifact-types";
import { cleanHandleInput } from "@/lib/handles";
import { getSession } from "@/lib/session";
import { changeUsername } from "@/lib/teams/setup";

/** Keeps or changes the viewer's username once. It is also their personal team's URL. */
export async function chooseUsernameAction(username: string): Promise<ActionResult<{ username: string }>> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  try {
    const result = await changeUsername(session.user.id, cleanHandleInput(z.string().max(100).parse(username)));
    if (!result.ok) return { success: false, error: result.error };
    revalidatePath("/", "layout");
    return { success: true, data: { username: result.username } };
  } catch {
    return { success: false, error: "Your username could not be saved. Please try again." };
  }
}
