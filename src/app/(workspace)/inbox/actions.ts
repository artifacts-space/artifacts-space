"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/lib/artifact-types";
import { markInboxRead } from "@/lib/comments/inbox";
import { getSession } from "@/lib/session";

const idsSchema = z.array(z.string().trim().min(1).max(200)).max(100);

/** Marks inbox entries read, by id or all at once. */
export async function markInboxReadAction(ids: string[] | "all"): Promise<ActionResult<number>> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  try {
    const changed = await markInboxRead(session.user.id, ids === "all" ? "all" : idsSchema.parse(ids));
    revalidatePath("/inbox");
    return { success: true, data: changed };
  } catch {
    return { success: false, error: "The inbox could not be updated. Please try again." };
  }
}
