# Formats, crawlers, and section templates

Part of the agent and contributor guide, [AGENTS.md](../../AGENTS.md), whose
rules apply here too. Read this before you change which format new visual work uses, llms.txt, the sitemap, or interface section templates.

## Where new visual work goes

Decided by the owner on 16 Nov 2026: a new mockup, prototype, dashboard, or
report is an HTML artifact (kind `html`, a full web page that runs in the
page sandbox). The interface (`ui`) and canvas formats are kept for the
artifacts that use them and get no new work:

- Agents are pointed at `html` for visual work (`artifacts_create` in
  `src/lib/mcp/routing-copy.ts`), and the `ui` and canvas format
  descriptions and guides open by saying so (`newVisualWork`,
  `earlierFormatNote` in `src/lib/artifact-formats.ts`). Keep one wording,
  from those two constants.
- Nothing saved is deleted or converted. Existing interface and canvas
  artifacts keep drawing, their tools keep working, and their bugs,
  contrast failures, and security faults are still fixed.
- Do not add a component to the interface component set, a section
  template, or a feature to the canvas board built on that set. Section
  templates and their two MCP tools are retired once HTML starting points
  exist; canvas frames become HTML frames on the same board.
- Live updates of an open canvas beyond catching up when the tab comes back
  (a stream, Follow, pictures after an agent's save) are paused until HTML
  pages have a runtime.

## What crawlers and language models are told

`/llms.txt` says what the site is and links its docs, as Markdown for
language models (`llmsTxtFor` in `src/lib/llms-txt.ts`; the route only
calls it). It is built from the lists the site already keeps, never
written by hand: the docs pages (`src/lib/docs/pages.ts`), the formats
(`currentFormatKinds` and `earlierFormatKinds` in
`src/lib/artifact-formats.ts`), and the MCP endpoint. A new docs page is in
it at once, and a test fails when one is missing.

- The docs of the earlier formats are one section, last in the list
  (`earlierFormatsSection`: JSON Render and every page under it). llms.txt
  links them only under `## Optional`, and the sitemap leaves them out
  (`crawledDocsPaths` in `src/lib/crawl-rules.ts`). They stay reachable and
  linked from the docs menu: no `noindex`, no redirect. A new page about
  `ui` or canvas goes into that section; a new page about anything else
  never does.
- The sitemap lists `/llms.txt`. robots.txt allows it by name and keeps one
  rule for every crawler; it has no directive that points at llms.txt,
  because none exists. Naming a crawler, or treating one apart, is the
  owner's decision.
- llms.txt links only pages a signed-out reader can open, and only by this
  site's own origin (`crawlOrigin`), so a self-hosted copy points at itself.
  Like every path, it answers 404 on a host under the page domain.
- Docs copy for new work leads with Markdown and `html`. The docs home's
  format table lists the current formats only.

## Section templates

Section templates are ready-made pieces of a website or app screen (a
navbar, a hero, a pricing section, a sign-in screen) built only from the
interface components, in `src/lib/ui/templates`. Agents get them over MCP
(`ui_templates_list`, `ui_template_get` in `src/lib/mcp/template-tools.ts`,
both read tools) and start a ui artifact or a canvas frame from them. The
template text is ours, so the tools add no untrusted-content label.

- A template is authored metadata (`id`, `name`, `category`, `description`,
  `viewport`, `surface`, `slots`) and a fragment (`root`, `elements`,
  `state`). Nothing that can be counted is written by hand: `facts.ts`
  counts elements, depth, components, state paths, and whether a reader can
  change anything; the kind (marketing or app) follows from the category
  (`templateCategories` in `types.ts`).
- Add a template by adding it to its batch file (`nav.ts`, `heroes.ts`,
  `features.ts`, `pricing.ts`, `social.ts`, `app.ts`; the category says
  which). A batch that outgrows one file continues in `social-2.ts`,
  `app-2.ts`, and so on, and each file is one entry of `templateSources` in
  `index.ts`: the index is built from that list and nothing else, so a
  template is in the index only with the file it is written in, and
  `templates.test.ts` reads each file for its ids. The docs' "Edit this
  page" link reads the same list (`templateCategorySource`).
- Do not write a test for a template. `templates.test.ts` runs
  `templateProblems` (`rules.ts`) over every template in the index.
  `e2e/templates.spec.ts` draws each category on
  `/dev/templates?category=<name>` in the frames its `viewport` names
  (`templateFrameWidths` in `frames.ts`, the one record the page and the
  specs read: 1440, 768, and 390 pixels for `fluid`, 1440 and 768 for
  `wide`, 390 for `phone`) and checks that every template stays inside its
  frames, passes axe, and passes color contrast in light and in dark.
  `e2e/templates-behavior.spec.ts` reads each template in those frames, and
  a fluid one also at 640 (the tablet frame made narrower), so its readings
  sit on either side of every width step (576, 672, 896): it presses every
  button whose press sets state and checks that its own frame changes, no
  other does, and the button that undoes it brings the frame back; that
  every link and button reachable in the widest frame is reachable at the
  narrower widths, at rest or with a panel open; and that no link, button,
  or picture is drawn more often between the ends than at either end. A
  press nothing undoes is checked for its change only, and the test notes
  why: a `setState` no button writes back, and every `pushState` and
  `removeState` (`oneWayReasons`). A `toggleState` button is pressed twice:
  after the first press it must still have the focus, and the second press
  of the same button must bring the frame back. So an open and close pair
  that stays in one place is one toggle whose label and icon follow the
  state, never two buttons that take each other's place (the pressed one
  leaves the page, and the focus with it). That toggle sets `expanded`
  from the path it flips (`"expanded": { "$state": "/open" }`), so screen
  readers hear whether its panel is open; the loop reads `aria-expanded`
  before and after each press from the fragment (`PressButton.expanded`),
  and a unit test fails for a template toggle without it. A toggle that
  stays on instead of opening a panel (Bold, a filter chip) sets `pressed`
  from its path, never both; the loop reads `aria-pressed` the same way
  (`PressButton.pressed`), and a toggle that is on counts as a change of
  its frame. Every
  action the validator allows is read by `behavior.ts` (`stateActions`) or
  listed there as not pressed, with a reason (`unpressedActions`), and a
  test fails for a new action that is in neither. What it presses and
  counts is read from the fragment (`behavior.ts`), never from a list. A
  link or button left out of narrow frames on purpose goes in
  `leftOutWhenNarrow` in that spec, with its reason. All of them name the
  template that fails.
- Pages stay light however many templates there are. `/dev/templates` draws
  one category (or `?template=<id>`), never all of them. The docs index
  (`/docs/json-render/templates`) has one row per template and no specs;
  `/docs/json-render/templates/<category>` is built for each category that
  has a template, draws only that category, and sends each spec once, as
  compact JSON (`TemplateExample` indents it in the browser for Copy JSON).
  A category's page title is in `src/lib/docs/template-docs.ts`. Never pass
  a spec to two client components, and never draw every template on one
  page.
- A scan waits for the browser, not for luck. Before axe, a templates test
  waits for the page's ready mark (`data-templates-ready` on the dev page,
  `data-ready` on each docs preview, both from `useHydrated`) and polls
  `unreachableSidewaysScrollers` (`e2e/support/scrollers.ts`) until every
  code block and table that scrolls has become a tab stop. One test runs
  the docs checks with a slowed CPU, so a scan that depends on timing fails
  on a fast machine too. What a reader needs must not wait for the browser
  at all: a Checkbox or Switch names itself in the server's HTML with
  `aria-labelledby` (`inputs.tsx`, `toggle-views.test.tsx`).
- Rules, all checked by `templateProblems`: the id is `<category>-<variant>`
  and is accepted as a prefix (`prefixProblem`), since it is the default one;
  the root is a Box; at most 60 elements and 10 levels deep; its first
  heading is level 1 or 2, so stacked sections never skip a level; list content
  lives in `state` and is drawn by one `repeat`; every state path the
  template reads or writes starts at a key of its own `state`; a Box that
  hides links or buttons below a width step is paired with one that hides
  links or buttons above the same step; the value a bound Select starts
  with, and every string a condition compares it with, is one of its
  options word for word (a Select's value is its option's words); a
  state-changing button has a label the fragment can read (fixed words, or
  a `$cond` on state with fixed words in both branches, as a toggle's
  "Open menu" and "Close menu"); a path a `toggleState` flips
  starts as true or false; a bare
  `${name}` in `$template` only inside a repeat; no Image or File (use
  Placeholder); links have no `href`, or point at example.com; `validateForm`
  names its `statePath`; every slot points at a prop that is set or a state
  value that exists; and the template, drawn as a spec, validates with no
  errors and no warnings. Copy is original placeholder text: no company
  names, no real logos, nothing taken from a block library. One narrow
  exception, approved by the owner on 2026-11-15, is a brand mark (the
  `brand-` icons in `src/lib/ui/icon-names.ts`): a social profile link in a
  footer or a contact section, drawn as an icon-only Button or a Link whose
  label names the network ("LinkedIn"), and a "Continue with <provider>"
  sign-in Button that uses `brand-google`, `brand-apple`, or `brand-github`.
  Still not allowed: a company name or logo as the product's own brand,
  customer logos, or a mark used as if the template's company were that
  company. `brandProblems` (`rules.ts`) checks the part it can read: a brand
  mark sits on a Button or a Link (in an element or in an item of the state
  a repeat draws), its label names the brand, and "Continue with" is for the
  three sign-in marks only.
- A view never marks a part of itself as a landmark: one screen is often on
  a page several times (three canvas frames, three widths here), and axe
  then reports `landmark-unique`. An open Accordion panel is a group named
  by its button, not a region (`AccordionView`, `accordion-view.test.tsx`);
  Steps and the Calendar's panel for a pressed day are named groups too.
  `landmark-views.test.tsx` renders every component fixture and fails on a
  new landmark; its list of views still to change is empty, so keep it so.
  A part that only shows after a press is in no fixture: draw it open in
  that test, as the Calendar's panel is (`MonthGrid` with a day selected).
  `e2e/templates-canvas.spec.ts` scans one template screen in three frames
  (`/dev/canvas?fixture=screens`).
- An agent never gets a template's own keys. `instantiateTemplate`
  (`instantiate.ts`) puts every element key and every state path under a
  prefix (the template's id by default), so several templates, or one twice,
  share a spec; `templateAsSpec` wraps it in a root Box named `page`;
  `attachFragment` adds a fragment under an element. `attachFragment` has no
  caller in the app yet: it is the merge the web editor's insert picker
  will call, and the one the guides tell agents to do themselves. A prefix
  is refused when the state key or paths it makes are ones the ui format
  rejects; that check is the format's own (`findUnsafePaths` in
  `src/lib/ui/expressions.ts`), never a second list. The header of
  `instantiate.ts` lists every place a key or a state path can appear. When
  json-render or the validator gains a new one (a new expression key, a new
  action param that names a path), add it there (`statePathKeys`,
  `absoluteReferences`, or the rewrite; `facts.ts` reads the same two) and
  to the sample template in `instantiate.test.ts`.
