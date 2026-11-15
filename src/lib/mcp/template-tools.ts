import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { McpAccess } from "@/lib/oauth/scopes";
import { templateDetail } from "@/lib/ui/templates/detail";
import { listTemplates } from "@/lib/ui/templates/index";
import { templateBudget, templateCategoryNames, templateKinds } from "@/lib/ui/templates/types";
import { UserFacingError } from "@/lib/user-facing-error";

import { gateTools } from "./tool-access";

/**
 * MCP tools that hand agents section templates: ready-made pieces of a
 * website or app screen (a navbar, a hero, a pricing section) built only
 * from the interface components, to start a ui artifact or a canvas frame
 * from. Both tools only read the templates that ship with the server: they
 * touch no artifact and no account, so they take no user.
 *
 * Template text is ours, written in this repository
 * (src/lib/ui/templates), not content a person or an agent saved, so the
 * results carry no untrusted-content label.
 */

/**
 * A tool's value as text. A refusal written for the caller (an unknown id, a
 * prefix that cannot be used) passes through; anything else is logged and
 * replaced.
 */
function respond(run: () => unknown) {
  try {
    return { content: [{ type: "text" as const, text: JSON.stringify(run(), null, 2) }] };
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    console.error("[mcp] Template tool failed", error instanceof Error ? error.name : "unknown error");
    throw new Error("Something went wrong on the server. Try again.");
  }
}

const categories = templateCategoryNames.join(", ");

/** Registers ui_templates_list and ui_template_get. Both are read tools, so every connection gets them. */
export function registerTemplateTools(server: McpServer, access: McpAccess) {
  const gated = gateTools(server, access);

  gated.registerTool(
    "ui_templates_list",
    {
      title: "List section templates",
      description:
        "Lists the section templates for mockups of websites and app screens: ready-made navbars, heroes, pricing sections, sign-in screens, and more, built only from the ui components. Each row has the template's id, name, category, kind (marketing or app), one sentence on what it shows, the widths it is drawn for (`viewport`: fluid, wide, or phone), and how many elements it adds. Rows carry no specs, so the whole list is small. Call it before you draw a page or a screen from nothing, then fetch the ones you want with ui_template_get.",
      inputSchema: {
        category: z.enum(templateCategoryNames).optional().describe(`Only this category: ${categories}`),
        kind: z.enum(templateKinds).optional().describe("Only sections of a marketing site, or only app screens"),
      },
    },
    ({ category, kind }) => respond(() => {
      const templates = listTemplates({ category, kind });
      return { templates, count: templates.length };
    }),
  );

  gated.registerTool(
    "ui_template_get",
    {
      title: "Get one section template",
      description:
        "One section template by id, ready to use: its elements and state, the `slots` that name what to change (a prop of an element, or a value in the state), and one sentence on how to attach it. With `as: \"fragment\"` (the default) you get a piece to add to a ui spec you are building; with `as: \"spec\"` you get a complete ui spec to save as a ui artifact or to pass as a frame's `spec` to canvas_frame_save. Every element key and state path carries `prefix` (the template's id when left out), so several templates share one spec; pass another `prefix` to use one template twice. Change the words, keep the structure, and check the result with artifacts_validate. Nothing is saved.",
      inputSchema: {
        id: z.string().min(1).max(templateBudget.maxIdLength).describe("The template's id, from ui_templates_list"),
        prefix: z.string().min(1).max(templateBudget.maxIdLength).optional().describe('Lowercase letters, digits, and hyphens, such as "hero" or "pricing-2". Element keys become "<prefix>-<key>" and state moves under "/<prefix>". Defaults to the template\'s id.'),
        as: z.enum(["fragment", "spec"]).optional().describe('"fragment" (default): a piece to attach to your spec. "spec": a complete ui spec.'),
      },
    },
    ({ id, prefix, as }) => respond(() => templateDetail(id, { prefix, as })),
  );
}
