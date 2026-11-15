import type { UiTemplate } from "./types";

/**
 * Navigation, banners, and footers (batch A). Categories: navbar, banner,
 * footer. The shared test (templates.test.ts) and the e2e loop
 * (e2e/templates.spec.ts) cover every template added here.
 */
export const navTemplates: readonly UiTemplate[] = [
  {
    id: "navbar-basic",
    name: "Navbar, links right",
    category: "navbar",
    description: "A top bar with a logo, a row of page links, a sign-in link, and one button; on narrow screens a menu button stands in for the links.",
    viewport: "fluid",
    surface: "page",
    slots: [
      { what: "Logo label", element: "logo", prop: "label" },
      { what: "Page links, each with a label and whether it is the current page", state: "/links" },
      { what: "Sign-in link label", element: "sign-in", prop: "label" },
      { what: "Button label", element: "cta", prop: "label" },
    ],
    fragment: {
      root: "bar",
      state: {
        links: [
          { label: "Product", active: true },
          { label: "Pricing", active: false },
          { label: "Customers", active: false },
          { label: "Docs", active: false },
        ],
      },
      elements: {
        bar: { type: "Box", props: { direction: "horizontal", align: "center", justify: "between", gap: "md", paddingX: "lg", paddingY: "sm", border: "bottom", surface: "page", label: "Site navigation" }, children: ["logo", "links", "actions"] },
        logo: { type: "Placeholder", props: { variant: "logo", label: "Your logo" } },
        links: { type: "Box", props: { direction: "horizontal", align: "center", gap: "lg", hideBelow: "md" }, repeat: { statePath: "/links", key: "label" }, children: ["link"] },
        link: { type: "Link", props: { label: { $item: "label" }, variant: "nav", active: { $item: "active" } } },
        actions: { type: "Box", props: { direction: "horizontal", align: "center", gap: "md" }, children: ["sign-in-box", "cta", "menu-box"] },
        "sign-in-box": { type: "Box", props: { hideBelow: "sm" }, children: ["sign-in"] },
        "sign-in": { type: "Link", props: { label: "Sign in", variant: "nav" } },
        cta: { type: "Button", props: { label: "Get started" } },
        "menu-box": { type: "Box", props: { hideAbove: "md" }, children: ["menu"] },
        menu: { type: "Button", props: { label: "Open menu", icon: "menu-2", iconOnly: true, variant: "ghost" } },
      },
    },
  },
];
