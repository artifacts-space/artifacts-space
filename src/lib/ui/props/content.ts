import { z } from "zod";

import { isSafeHref, maxHrefLength } from "@/lib/link-policy";

import { label, prose, tone } from "./shared";

const stepItem = z.object({
  title: label(160),
  body: prose(5000).optional(),
  code: prose(10_000).optional(),
  language: label(40).optional(),
});

/** Props for text and content components. */
export const contentProps = {
  Heading: z.object({
    text: label(200),
    level: z.number().int().min(1).max(4).optional(),
  }),
  Text: z.object({
    text: prose(5000),
    tone: z.enum(["default", "muted"]).optional(),
    size: z.enum(["sm", "md", "lg"]).optional(),
  }),
  Markdown: z.object({
    content: prose(20_000),
  }),
  Code: z.object({
    code: prose(20_000),
    language: label(40).optional(),
    title: label(160).optional(),
  }),
  Callout: z.object({
    text: prose(2000),
    title: label(160).optional(),
    tone: tone.optional(),
  }),
  Badge: z.object({
    label: label(60),
    tone: tone.optional(),
  }),
  List: z.object({
    items: z.array(prose(1000)).max(200),
    ordered: z.boolean().optional(),
  }),
  Steps: z.object({
    items: z.array(stepItem).max(50),
    title: label(160).optional(),
  }),
  Link: z.object({
    label: label(200),
    href: z
      .string()
      .max(maxHrefLength)
      .refine(isSafeHref, "Use an absolute http, https, or mailto URL."),
  }),
  Quote: z.object({
    text: prose(2000),
    cite: label(200).optional(),
  }),
};
