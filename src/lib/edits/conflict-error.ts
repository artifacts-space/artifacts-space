import { UserFacingError } from "@/lib/user-facing-error";

import { agentRefusalCodes, agentRefusalMessage, type AgentWriteRefusal, type ChangedBy } from "./edit-conflict-rules";

/**
 * An agent's save refused because the artifact changed since the agent read
 * it, or because a person is typing in it. Nothing was saved. MCP tools turn
 * it into a typed tool error (src/lib/mcp/tool-errors.ts).
 */
export class EditConflictError extends UserFacingError {
  readonly refusal: AgentWriteRefusal;
  readonly code: string;
  readonly changedBy: ChangedBy | null;

  constructor(refusal: AgentWriteRefusal, changedBy: ChangedBy | null) {
    super(agentRefusalMessage(refusal, changedBy));
    this.name = "EditConflictError";
    this.refusal = refusal;
    this.code = agentRefusalCodes[refusal];
    this.changedBy = changedBy;
  }
}

/** The refusal an agent passed a malformed base version: it never came from artifacts_get. */
export class BadBaseVersionError extends UserFacingError {
  constructor() {
    super("baseVersion is not one artifacts.space handed out. Read the artifact with artifacts_get and pass its baseVersion exactly as you got it.");
    this.name = "BadBaseVersionError";
  }
}
