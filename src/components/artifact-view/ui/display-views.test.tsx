import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { uiSpecToMarkdown } from "@/lib/markdown/ui-spec";

import { ArtifactView } from "../artifact-view";

/* AvatarGroup, Kbd, Rating, and the Badge dot, as readers get them. */

function one(type: string, props: Record<string, unknown>): string {
  return renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify({ version: 1, root: "e", elements: { e: { type, props } } })} title="Test" />);
}

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;
const people = ["Maya Chen", "Omar Haddad", "Priya Nair", "Tomás de la Cruz", "Ines Okafor"].map((name) => ({ name }));

describe("AvatarGroupView", () => {
  it("should be one image named with the count, the names drawn, and how many more, when there are more than max", () => {
    const html = one("AvatarGroup", { people, max: 3 });
    expect(count(html, /role="img"/g)).toBe(1);
    expect(html).toContain('aria-label="5 people: Maya Chen, Omar Haddad, Priya Nair, and 2 more"');
    expect(count(html, /data-avatar-person=""/g)).toBe(3);
    expect(html).toMatch(/data-avatar-more="".*>\+2</);
  });

  it("should draw no count when everyone is drawn, and initials in place of the name's letters when they are set", () => {
    const html = one("AvatarGroup", { people: [{ name: "Northwind support", initials: "ns" }, { name: "Maya Chen" }] });
    expect(html).not.toContain("data-avatar-more");
    expect(html).toContain(">NS<");
    expect(html).toContain(">MC<");
  });

  it("should write a large remainder short, when total is in the thousands", () => {
    expect(one("AvatarGroup", { people: people.slice(0, 2), total: 2400 })).toContain(">+2.4K<");
  });
});

describe("KbdView", () => {
  it("should draw each key hidden from screen readers and read the shortcut as words", () => {
    const html = one("Kbd", { keys: ["⌘", "K"] });
    expect(html).toContain('<span class="sr-only">Command K</span>');
    expect(count(html, /<kbd aria-hidden="true"/g)).toBe(2);
  });
});

describe("RatingView", () => {
  it("should be one image named as a score, with full, half, and empty stars", () => {
    const html = one("Rating", { value: 3.5, label: "Average rating" });
    expect(html).toContain('aria-label="Average rating: 3.5 out of 5"');
    expect(count(html, /data-star="full"/g)).toBe(3);
    expect(count(html, /data-star="half"/g)).toBe(1);
    expect(count(html, /data-star="empty"/g)).toBe(1);
  });

  it("should draw as many stars as max, and the number beside them when showValue is set", () => {
    const html = one("Rating", { value: 7, max: 10, showValue: true });
    expect(count(html, /data-star=/g)).toBe(10);
    expect(html).toMatch(/tabular-nums">7</);
  });
});

describe("Badge dot", () => {
  it("should draw a dot before the label, hidden from screen readers, when dot is start", () => {
    const html = one("Badge", { label: "Online", tone: "success", dot: "start" });
    expect(html).toMatch(/<span aria-hidden="true" data-badge-dot="start" class="[^"]*bg-tone-success/);
    expect(html).toContain(">Online<");
  });

  it("should draw the dot in the page color on a solid badge, so it shows on the fill", () => {
    expect(one("Badge", { label: "Live", tone: "danger", variant: "solid", dot: "start" })).toMatch(/data-badge-dot="start" class="[^"]*bg-background/);
  });

  it("should draw the dot alone and keep the label for screen readers only, when dot is only", () => {
    const html = one("Badge", { label: "Unread", tone: "info", dot: "only" });
    expect(html).toContain('data-badge-dot="only"');
    expect(html).toContain('<span class="sr-only">Unread</span>');
    expect(html).not.toContain("rounded-full border px-2");
  });

  it("should draw a lone neutral dot in the full muted color, not the faint one", () => {
    expect(one("Badge", { label: "Away", dot: "only" })).toMatch(/data-badge-dot="only" class="[^"]*bg-muted-foreground"/);
  });
});

describe("Grid narrowColumns", () => {
  const gridClass = (props: Record<string, unknown>) => /data-slot="ui-grid" class="([^"]+)"/.exec(one("Grid", props))?.[1]?.split(" ") ?? [];

  it("should start from two columns in place of one, and keep the wider steps, when narrowColumns is 2", () => {
    const classes = gridClass({ columns: 4, narrowColumns: 2 });
    expect(classes).toContain("grid-cols-2");
    expect(classes).not.toContain("grid-cols-1");
    expect(classes).toContain("@4xl/ui:grid-cols-4");
  });

  it("should start from one column when narrowColumns is not set", () => {
    expect(gridClass({ columns: 4 })).toContain("grid-cols-1");
  });
});

describe("the Markdown copy", () => {
  it("should write each display piece in the words screen readers hear", () => {
    const markdown = uiSpecToMarkdown(JSON.stringify({
      version: 1,
      root: "page",
      elements: {
        page: { type: "Stack", props: {}, children: ["group", "keys", "stars"] },
        group: { type: "AvatarGroup", props: { people: people.slice(0, 2), total: 9 } },
        keys: { type: "Kbd", props: { keys: ["⌘", "K"] } },
        stars: { type: "Rating", props: { value: 4.5, label: "Average rating" } },
      },
    }));
    expect(markdown).toBe("9 people: Maya Chen, Omar Haddad, and 7 more\n\n`⌘ K` (Command K)\n\nAverage rating: 4.5 out of 5");
  });
});
