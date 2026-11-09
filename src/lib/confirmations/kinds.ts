import { z } from "zod";

/**
 * Destructive actions whose confirmation dialog a person can turn off with
 * "Don't ask again". Adding a value is safe; removing one leaves old rows
 * that `listSkippedConfirmations` ignores.
 */
export const confirmationActions = [
  "deleteArtifact",
  "revokeToken",
  "revokeAgentToken",
  "revokeConnectedApp",
  "leaveTeam",
  "removeAgent",
  // Removing an agent that would delete artifacts only it (and its owner) can read.
  "removeAgentWithArtifacts",
  "removeMember",
  "restoreVersion",
  "discardEdits",
  "deleteProject",
  "mergeProject",
  "deleteTeamPreset",
  "removePushDevice",
  "deleteTeamRole",
] as const;

export const confirmationActionSchema = z.enum(confirmationActions, { error: "Unknown confirmation." });

export type ConfirmationAction = z.infer<typeof confirmationActionSchema>;
