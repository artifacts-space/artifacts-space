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
    rules: [stateNote],
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
    ],
    rules: ["`press` can run setState, pushState, removeState, or validateForm. A button cannot load or send data.", "Variants: default, outline, secondary, ghost."],
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
    ],
    rules: [
      "`file` is the id of a finished upload attached to this artifact. URLs are refused.",
      "`file` must be written in the spec, not read from state, so saving can check it.",
      "PNG, JPEG, GIF, WebP, and AVIF. The image shows at up to its natural size.",
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

