import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { commentExcerpt } from "@/lib/notifications/display-rules";
import type { NotificationView } from "@/lib/notifications/feed";

import { NotificationList } from "./notification-list";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

function mention(excerpt: string): NotificationView {
  return { id: "n1", type: "mention", createdAt: new Date().toISOString(), readAt: null, actor: { userId: "u1", kind: "person", label: "@ada" }, artifact: { publicId: "p1", title: "Plan", icon: null }, excerpt, requestKind: null, href: "/app?artifact=p1&comments=1" };
}

describe("the bell's excerpt", () => {
  it("should show a stored tag as its characters when the comment escaped it", () => {
    const excerpt = commentExcerpt("&lt;img src=x onerror=alert(1)&gt; is how it breaks");
    expect(excerpt).toBe("<img src=x onerror=alert(1)> is how it breaks");
    const html = renderToStaticMarkup(<NotificationList items={[mention(excerpt)]} onOpen={() => undefined} onRead={() => undefined} />);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; is how it breaks");
    expect(html).not.toContain("<img");
  });
});
