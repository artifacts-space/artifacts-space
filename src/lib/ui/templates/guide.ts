import { templateCategoryNames } from "./types";

/**
 * What the format guides tell an agent about section templates: that they
 * exist, which tools hand them out, and how to use one in a ui spec or in a
 * canvas frame. The ui guide and the canvas guide each carry their passage.
 */

/** The heading both passages sit under. */
export const templateGuideHeading = "## Start from a template";

const shared = [
  "`slots` names what to change: a prop of one element, or a value in the state (the list a `repeat` draws, a switch's start value). Change the words and the lists; keep the structure.",
  "Every element key and state path of a template carries a prefix (the template's id unless you pass `prefix`), so several templates share one spec. Pass another `prefix` to use one template twice.",
];

const forUi = [
  "Build a page from sections: fetch the first with `as: \"spec\"`, which gives a complete spec whose root Box is \"page\", then fetch each further section as a fragment, add its `elements` and its `state` key to the spec, and put its root in the `children` of \"page\".",
  ...shared,
  "Check the finished spec with artifacts_validate before you save it.",
];

const forCanvas = [
  "Fetch a template with `as: \"spec\"` and use the result as a frame's `spec`, in artifacts_create or canvas_frame_save. To put several sections in one frame, fetch the rest as fragments and attach them under the spec's \"page\" Box; the ui guide says how.",
  "`viewport` says which frame widths a template is drawn for: fluid lays itself out at any width, wide needs a desktop or tablet frame, phone is a phone screen. Use the same fluid template in a 1440 frame and a 390 frame to show one page at both sizes.",
  ...shared,
];

/** The passage for one guide: the ui guide's, or the canvas guide's. */
export function templateGuide(target: "ui" | "canvas"): string {
  const opening =
    target === "ui"
      ? "Do not draw a navbar, a hero, a pricing section, or a sign-in screen from nothing. Section templates are ready-made pieces of a website or an app screen, built only from these components."
      : "Do not draw a screen from nothing. Section templates are ready-made pieces of a website or an app screen (navbars, heroes, pricing, sign-in, dashboards), built only from the ui components.";
  return [
    templateGuideHeading,
    `${opening} ui_templates_list lists them (categories: ${templateCategoryNames.join(", ")}); ui_template_get returns one, ready to use.`,
    (target === "ui" ? forUi : forCanvas).map((line) => `- ${line}`).join("\n"),
  ].join("\n\n");
}
