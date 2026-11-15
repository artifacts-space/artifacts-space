import { docsExampleFiles, single, spec } from "../spec-builders";
import type { ComponentDoc } from "./types";

const [imageFile, pdfFile] = docsExampleFiles;

const stateNote = "Inputs change only the spec's own state, on the reader's page. Nothing is saved or sent.";

export const inputDocs = {
  Checklist: {
    examples: [
      { title: "A launch checklist", spec: single("Checklist", { title: "Launch", items: [{ label: "Write release notes", checked: true }, { label: "Tag the release" }, { label: "Tell the team" }] }) },
    ],
    rules: ["Ticks stay on the reader's page only. Use `checked` for items that are already done."],
  },
  Checkbox: {
    examples: [
      {
        title: "Bound to state",
        note: "Tick the box: the text below reads the same state path.",
        spec: spec(
          "page",
          {
            page: { type: "Stack", props: { gap: "sm" }, children: ["notify", "status"] },
            notify: { type: "Checkbox", props: { label: "Notify the team", description: "A reminder only; nothing is sent.", checked: { $bindState: "/notify" } } },
            status: { type: "Text", props: { tone: "muted", size: "sm", text: { $cond: { $state: "/notify" }, $then: "The team will be told.", $else: "Nobody will be told." } } },
          },
          { notify: false },
        ),
      },
    ],
    rules: [stateNote],
  },
  Select: {
    examples: [
      {
        title: "Bound to state",
        spec: spec(
          "page",
          {
            page: { type: "Stack", props: { gap: "sm" }, children: ["env", "chosen"] },
            env: { type: "Select", props: { label: "Environment", options: ["Production", "Preview", "Development"], value: { $bindState: "/env" } } },
            chosen: { type: "Text", props: { size: "sm", tone: "muted", text: { $template: "Deploying to ${/env}." } } },
          },
          { env: "Preview" },
        ),
      },
    ],
    rules: [stateNote, "`description` sits under the label. `error` marks the field invalid and shows the message. `hideLabel` keeps the label for screen readers only.", "A Select is at most 384 pixels wide; `fullWidth` lets it fill its container, like Input and Textarea."],
  },
  Switch: {
    examples: [
      {
        title: "Show and hide a section",
        spec: spec(
          "page",
          {
            page: { type: "Stack", props: { gap: "md" }, children: ["toggle", "details"] },
            toggle: { type: "Switch", props: { label: "Show remaining work", checked: { $bindState: "/open" } } },
            details: { type: "Card", props: { title: "Remaining work" }, visible: { $state: "/open" }, children: ["todo"] },
            todo: { type: "List", props: { items: ["Fix the flaky upload test", "Update the migration guide"] } },
          },
          { open: true },
        ),
      },
    ],
    rules: [stateNote],
  },
  Slider: {
    examples: [
      {
        title: "Bound to state",
        spec: spec(
          "page",
          {
            page: { type: "Stack", props: { gap: "sm" }, children: ["rollout", "progress"] },
            rollout: { type: "Slider", props: { label: "Rollout percent", min: 0, max: 100, step: 5, value: { $bindState: "/rollout" } } },
            progress: { type: "Progress", props: { label: "Users on the new version", value: { $state: "/rollout" } } },
          },
          { rollout: 25 },
        ),
      },
    ],
    rules: ["`min` defaults to 0 and `max` to 100; `min` must be less than `max`.", stateNote],
  },
  Button: {
    examples: [
      {
        title: "Set state on press",
        spec: spec(
          "page",
          {
            page: { type: "Stack", props: { gap: "sm" }, children: ["buttons", "answer"] },
            buttons: { type: "Stack", props: { direction: "horizontal", gap: "sm" }, children: ["yes", "no"] },
            yes: { type: "Button", props: { label: "Approve" }, on: { press: { action: "setState", params: { statePath: "/answer", value: "Approved" } } } },
            no: { type: "Button", props: { label: "Hold", variant: "outline" }, on: { press: { action: "setState", params: { statePath: "/answer", value: "On hold" } } } },
            answer: { type: "Badge", props: { label: { $template: "Choice: ${/answer}" }, tone: "info" } },
          },
          { answer: "None yet" },
        ),
      },
      {
        title: "Sizes and icons",
        spec: single("Box", { direction: "horizontal", wrap: true, align: "center", gap: "sm" }, {
          small: { type: "Button", props: { label: "Filter", size: "sm", variant: "outline", icon: "filter" } },
          medium: { type: "Button", props: { label: "Continue", icon: "arrow-right", iconPosition: "end" } },
          large: { type: "Button", props: { label: "Start free", size: "lg" } },
          more: { type: "Button", props: { label: "More actions", variant: "ghost", icon: "dots", iconOnly: true } },
          off: { type: "Button", props: { label: "Unavailable", variant: "secondary", disabled: true } },
        }),
      },
      { title: "Full width", spec: single("Box", { maxWidth: "sm" }, { wide: { type: "Button", props: { label: "Create account", fullWidth: true } } }) },
      {
        title: "Open and close with one button",
        note: "`expanded` reads the same state the button flips, so screen readers hear whether the list is open.",
        spec: spec(
          "page",
          {
            page: { type: "Stack", props: { gap: "sm" }, children: ["more", "list"] },
            more: { type: "Button", props: { label: "All plans", variant: "outline", icon: "chevron-down", iconPosition: "end", expanded: { $state: "/open" } }, on: { press: { action: "toggleState", params: { statePath: "/open" } } } },
            list: { type: "List", props: { items: ["Starter", "Team", "Business"] }, visible: { $state: "/open" } },
          },
          { open: false },
        ),
      },
    ],
    rules: [
      "`press` can run setState, toggleState, pushState, removeState, or validateForm. A button cannot load or send data.",
      "`toggleState` flips the value at `statePath` between true and false, so one button opens and closes what a `visible` condition shows: { \"action\": \"toggleState\", \"params\": { \"statePath\": \"/open\" } }.",
      "Variants: default, outline, secondary, ghost, danger. Sizes: sm, md, lg.",
      "`danger` is for an action that deletes or cannot be undone: a solid fill in the danger tone. Its label reads on every Box surface and in every theme.",
      "`iconOnly` needs an `icon`; the `label` is then what screen readers announce.",
      "`expanded` says whether what the button opens is open (a menu toggle, a \"Show more\"). Read it from the same path the button flips: `\"expanded\": { \"$state\": \"/open\" }`. That path must hold `true` or `false`; any other value stops the button from being shown. Leave it off a button that opens nothing.",
    ],
  },
} satisfies Record<string, ComponentDoc>;

export const mediaDocs = {
  Image: {
    examples: [
      {
        title: "An uploaded image",
        note: "The docs show a stand-in picture. On a real artifact, `file` is the id files_finalize returned.",
        spec: single("Image", { file: imageFile.id, alt: "Architecture diagram: agents reach the API over MCP", caption: "How agents reach the API." }),
      },
      {
        title: "Cropped to a shape",
        spec: single("Grid", { columns: 2 }, {
          wide: { type: "Image", props: { file: imageFile.id, alt: "Architecture diagram, cropped wide", ratio: "wide", radius: "xl" } },
          square: { type: "Image", props: { file: imageFile.id, alt: "Architecture diagram, shown whole in a square", ratio: "square", fit: "contain", radius: "lg" } },
        }),
      },
    ],
    rules: [
      "`file` is the id of a finished upload attached to this artifact. URLs are refused.",
      "`file` must be written in the spec, not read from state, so saving can check it.",
      "PNG, JPEG, GIF, WebP, and AVIF. The image shows at up to its natural size.",
      "`ratio` crops the image to a shape (`fit: \"contain\"` shows all of it instead), and `radius` rounds its corners.",
    ],
  },
  File: {
    examples: [
      {
        title: "A download card",
        spec: single("Stack", { gap: "sm" }, {
          report: { type: "File", props: { file: pdfFile.id } },
          labelled: { type: "File", props: { file: pdfFile.id, label: "Board deck, Q3" } },
        }),
      },
    ],
    rules: ["Upload with files_request_upload, PUT the bytes, then files_finalize. Put the returned id in `file`.", "`label` replaces the shown file name."],
  },
} satisfies Record<string, ComponentDoc>;

