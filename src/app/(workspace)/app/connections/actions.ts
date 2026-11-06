"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { revokeConnectedApp } from "@/lib/oauth/clients";
import { getSession } from "@/lib/session";
import { createApiToken, type listApiTokens, revokeApiToken } from "@/lib/tokens";
import type { ActionResult } from "@/lib/artifact-types";

export type ApiTokenDto = Awaited<ReturnType<typeof listApiTokens>>[number];

async function requireUserId() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user.id;
}

export async function createTokenAction(
  name: string,
): Promise<ActionResult<{ token: string; record: ApiTokenDto }>> {
  try {
    const userId = await requireUserId();
    const result = await createApiToken(userId, name);
    revalidatePath("/app/connections");
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not create the token.",
    };
  }
}

export async function revokeTokenAction(id: string): Promise<ActionResult<string>> {
  try {
    const userId = await requireUserId();
    await revokeApiToken(userId, id);
    revalidatePath("/app/connections");
    return { success: true, data: id };
  } catch {
    return { success: false, error: "Could not revoke the token." };
  }
}

const clientIdSchema = z.string().trim().min(1).max(512);

/** Revokes one approved MCP app: its access and refresh tokens stop working at once. */
export async function revokeConnectedAppAction(clientId: string): Promise<ActionResult<string>> {
  try {
    const parsed = clientIdSchema.safeParse(clientId);
    if (!parsed.success) return { success: false, error: "Could not find that app." };
    const userId = await requireUserId();
    await revokeConnectedApp(userId, parsed.data);
    revalidatePath("/app/connections");
    return { success: true, data: parsed.data };
  } catch {
    return { success: false, error: "Could not revoke the app's access." };
  }
}
