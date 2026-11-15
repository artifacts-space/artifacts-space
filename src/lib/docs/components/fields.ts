import { single, spec, text } from "../spec-builders";
import type { ComponentDoc } from "./types";

const typedNote = "What a reader types changes only the spec's own state, on the reader's page. Nothing is saved or sent.";
const noLinkRule = "In a spec with a bound Input or Textarea, a Link address and Markdown, Steps, and Diagram text must be written in the spec, so typed text can never reach a link.";

export const fieldDocs: Record<"Input" | "Textarea", ComponentDoc> = {
  Input: {
    examples: [
      {
        title: "Bound to state",
        note: "Type a name: the text below reads the same state path.",
        spec: spec(
          "page",
          {
            page: { type: "Box", props: { gap: "sm", maxWidth: "sm" }, children: ["name", "greeting"] },
            name: { type: "Input", props: { label: "Project name", placeholder: "Northwind", description: "Shown on the dashboard.", value: { $bindState: "/name" }, fullWidth: true } },
            greeting: { type: "Text", props: { tone: "muted", size: "sm", text: { $template: "Project: ${/name}" } } },
          },
          { name: "" },
        ),
      },
      {
        title: "A sign-in mockup",
        note: "The password field is a row of dots. A reader cannot type into it or focus it.",
        spec: spec("card", {
          card: { type: "Box", props: { surface: "card", border: "all", radius: "xl", padding: "lg", gap: "md", maxWidth: "sm" }, children: ["email", "password", "submit"] },
          email: { type: "Input", props: { label: "Email", type: "email", placeholder: "you@example.com", fullWidth: true } },
          password: { type: "Input", props: { label: "Password", type: "password", fullWidth: true } },
          submit: { type: "Button", props: { label: "Sign in", fullWidth: true } },
        }),
      },
      {
        title: "An error and a disabled field",
        spec: single("Box", { gap: "md", maxWidth: "sm" }, {
          email: { type: "Input", props: { label: "Email", type: "email", value: "maya@", error: "Enter a full email address.", fullWidth: true } },
          plan: { type: "Input", props: { label: "Plan", value: "Team", disabled: true, fullWidth: true } },
          search: { type: "Input", props: { label: "Search orders", hideLabel: true, type: "search", placeholder: "Search orders", fullWidth: true } },
        }),
      },
    ],
    rules: [
      typedNote,
      "`type` is text, email, search, number, or password, written in the spec. A password Input is a stand-in: it takes no `value`, cannot be bound, and cannot be typed into.",
      "Password managers skip every field, and no field has a form around it.",
      noLinkRule,
      "`label` is required. `hideLabel` keeps it for screen readers only.",
    ],
  },
  Textarea: {
    examples: [
      {
        title: "A feedback box",
        spec: spec(
          "page",
          {
            page: { type: "Box", props: { gap: "sm", maxWidth: "md" }, children: ["notes", "count"] },
            notes: { type: "Textarea", props: { label: "Notes for the reviewer", placeholder: "What should they look at first?", rows: 4, value: { $bindState: "/notes" }, fullWidth: true } },
            count: { type: "Text", props: { tone: "muted", size: "sm", text: { $cond: { $state: "/notes" }, $then: "Notes are on this page only.", $else: "No notes yet." } } },
          },
          { notes: "" },
        ),
      },
    ],
    rules: [typedNote, "`rows` is 2 to 12 and defaults to 3. It is the least number of lines the field shows; the field grows with what is typed.", noLinkRule],
  },
};

export const avatarDocs: Record<"Avatar", ComponentDoc> = {
  Avatar: {
    examples: [
      {
        title: "Sizes and tones",
        spec: single("Box", { direction: "horizontal", wrap: true, align: "center", gap: "md" }, {
          small: { type: "Avatar", props: { name: "Maya Chen", size: "sm" } },
          medium: { type: "Avatar", props: { name: "Omar Haddad", tone: "info" } },
          large: { type: "Avatar", props: { name: "Priya Nair", size: "lg", tone: "success" } },
          extra: { type: "Avatar", props: { name: "Northwind", size: "xl", tone: "warning" } },
        }),
      },
      {
        title: "Beside a name",
        spec: spec("row", {
          row: { type: "Box", props: { direction: "horizontal", align: "center", gap: "sm" }, children: ["face", "who"] },
          face: { type: "Avatar", props: { name: "Maya Chen" } },
          who: { type: "Box", props: { gap: "none" }, children: ["name", "role"] },
          name: text("Maya Chen", { weight: "medium", size: "sm" }),
          role: text("Operations lead", { tone: "muted", size: "xs" }),
        }),
      },
    ],
    rules: ["An avatar shows the initials of `name` and never loads a picture.", "Screen readers announce `name`."],
  },
};
