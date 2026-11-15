import type { UiTemplate } from "./types";

/**
 * Pricing, comparison, and questions (batch D). Categories: pricing,
 * comparison, faq. The shared test (templates.test.ts) and the e2e loop
 * (e2e/templates.spec.ts) cover every template added here.
 */
export const pricingTemplates: readonly UiTemplate[] = [
  {
    id: "pricing-three-tiers",
    name: "Pricing, three tiers",
    category: "pricing",
    description: "Three plans side by side with a switch between monthly and yearly prices; the middle plan stands out.",
    viewport: "fluid",
    surface: "page",
    slots: [
      { what: "Small label above the headline", element: "eyebrow", prop: "text" },
      { what: "Headline", element: "title", prop: "text" },
      { what: "Supporting sentence", element: "text", prop: "text" },
      { what: "Billing switch label", element: "billing", prop: "label" },
      { what: "Plans, each with name, monthly and yearly price, features, popular, surface (card or muted), and button (default or outline)", state: "/plans" },
      { what: "Trial length in days, shown under the plans", state: "/trialDays" },
    ],
    fragment: {
      root: "pricing",
      state: {
        yearly: false,
        trialDays: 14,
        plans: [
          { name: "Starter", monthly: "$0", yearly: "$0", popular: false, surface: "card", button: "outline", features: ["Up to 5 people", "3 boards", "Weekly summary by email"] },
          { name: "Team", monthly: "$12", yearly: "$10", popular: true, surface: "muted", button: "default", features: ["Unlimited people", "Unlimited boards", "Shared calendars", "Priority support"] },
          { name: "Company", monthly: "$29", yearly: "$24", popular: false, surface: "card", button: "outline", features: ["Everything in Team", "Single sign-on", "Audit log", "A named contact"] },
        ],
      },
      elements: {
        pricing: { type: "Box", props: { direction: "vertical", align: "center", gap: "xl", paddingX: "lg", paddingY: "2xl", surface: "page" }, children: ["intro", "billing", "plans", "trial"] },
        intro: { type: "Box", props: { direction: "vertical", align: "center", gap: "sm", maxWidth: "lg" }, children: ["eyebrow", "title", "text"] },
        eyebrow: { type: "Text", props: { text: "Pricing", variant: "eyebrow", align: "center" } },
        title: { type: "Heading", props: { text: "Pick the plan that fits your team", level: 2, size: "xl", align: "center" } },
        text: { type: "Text", props: { text: "Start free and change plans at any time. Every plan keeps your boards and history.", tone: "muted", align: "center" } },
        billing: { type: "Switch", props: { label: "Bill yearly and save two months", checked: { $bindState: "/yearly" } } },
        plans: { type: "Grid", props: { columns: 3, gap: "md" }, repeat: { statePath: "/plans", key: "name" }, children: ["plan"] },
        plan: { type: "Box", props: { direction: "vertical", gap: "md", padding: "lg", surface: { $item: "surface" }, border: "all", radius: "lg" }, children: ["plan-head", "plan-cost", "plan-features", "plan-cta"] },
        "plan-head": { type: "Box", props: { direction: "horizontal", align: "center", justify: "between", gap: "sm" }, children: ["plan-name", "plan-flag"] },
        "plan-name": { type: "Heading", props: { text: { $item: "name" }, level: 3, size: "md" } },
        "plan-flag": { type: "Badge", props: { label: "Most popular", tone: "info" }, visible: { $item: "popular", eq: true } },
        "plan-cost": { type: "Box", props: { direction: "vertical", gap: "xs" }, children: ["plan-price", "plan-period"] },
        "plan-price": { type: "Text", props: { text: { $cond: { $state: "/yearly" }, $then: { $item: "yearly" }, $else: { $item: "monthly" } }, size: "3xl", weight: "semibold" } },
        "plan-period": { type: "Text", props: { text: { $cond: { $state: "/yearly" }, $then: "per person each month, billed yearly", $else: "per person each month" }, size: "sm", tone: "muted" } },
        "plan-features": { type: "List", props: { items: { $item: "features" }, marker: "check" } },
        "plan-cta": { type: "Button", props: { label: { $template: "Choose ${name}" }, variant: { $item: "button" }, fullWidth: true } },
        trial: { type: "Text", props: { text: { $template: "Paid plans start with a ${/trialDays}-day trial. No card needed." }, variant: "caption", align: "center" } },
      },
    },
  },
];
