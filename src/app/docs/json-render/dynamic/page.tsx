import Link from "next/link";

import { CodeSnippet } from "@/components/code/code-snippet";
import { DocsH, FactTable, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { LiveExample } from "@/components/docs/live-example";
import { bindStateExample, condExample, repeatExample, setStateExample, stateExample, templateExample, validateFormExample, visibleExample } from "@/lib/docs/guide-examples";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { compactJson } from "@/lib/docs/spec-builders";
import { componentEvents } from "@/lib/ui/catalog";
import { uiLimits } from "@/lib/ui/limits";
import { allowedActions } from "@/lib/ui/validate-element";
import { maxRenderedElements } from "@/lib/ui/validate-tree";

export const metadata = docsMetadata("json-render/dynamic");

const conditions = [
  ['{ "$state": "/open" }', "The value at /open is truthy."],
  ['{ "$state": "/tab", "eq": "a" }', "Equal. Also neq."],
  ['{ "$state": "/bugs", "gt": 5 }', "Greater than. Also gte, lt, and lte."],
  ['{ "$state": "/open", "not": true }', "Inverts the result."],
  ['[ cond, cond ]', "Every condition holds (and)."],
  ['{ "$and": [ … ] } / { "$or": [ … ] }', "All of them, or any of them."],
  ['{ "$item": "done", "eq": true }', "Inside a repeat: a field of the current item."],
  ['{ "$index": true, "eq": 0 }', "Inside a repeat: the item's position."],
];

const actionRows = [
  ["setState", '{ "statePath": "/decision", "value": "Approved" }', "Writes a value at a path."],
  ["pushState", '{ "statePath": "/items", "value": { … }, "clearStatePath": "/draft" }', "Appends to an array. clearStatePath, if given, is set to an empty string afterwards."],
  ["removeState", '{ "statePath": "/items", "index": { "$index": true } }', "Removes one array item by position."],
  ["validateForm", '{ "statePath": "/review" }', "Writes { valid, errors } to the path (default /formValidation)."],
];

const eventList = Object.entries(componentEvents).map(([component, events]) => `${component}: ${events.join(", ")}`).join(" · ");

const bindingShape = compactJson({ on: { press: [{ action: "setState", params: { statePath: "/step", value: 2 } }, { action: "pushState", params: { statePath: "/log", value: { $state: "/draft" } } }] } });

/** Dynamic props, conditions, repeats, and the four state actions, each with a live example. */
export default function DynamicPage() {
  const page = "json-render/dynamic" as const;
  return (
    <RegistryPage slug={page}>
      <Prose>
        <p>
          Any prop can be a <strong>dynamic value</strong>: an object with one special key that resolves when the page renders. Dynamic values read the spec&apos;s <code>state</code>, written as JSON Pointer paths such as <code>/build/status</code>. Validation skips the schema check for a prop that holds an expression, and the renderer checks it again once it resolves: a value of the wrong type shows a small notice in place of that element only.
        </p>
      </Prose>

      <DocsH page={page} id="state" />
      <Prose><p><code>{'{ "$state": "/path" }'}</code> reads a value from state.</p></Prose>
      <LiveExample example={stateExample} />

      <DocsH page={page} id="bind-state" />
      <Prose>
        <p>
          <code>{'{ "$bindState": "/path" }'}</code> on an input&apos;s value prop (<code>checked</code> on Checkbox and Switch, <code>value</code> on Select and Slider) reads the path and writes it back when the reader changes the input. Anything else that reads the same path updates at once. Inside a repeat, <code>{'{ "$bindItem": "field" }'}</code> binds to a field of the current item.
        </p>
      </Prose>
      <LiveExample example={bindStateExample} />

      <DocsH page={page} id="template" />
      <Prose>
        <p>
          <code>{'{ "$template": "Hi ${/name}" }'}</code> builds a string. <code>{"${/path}"}</code> reads state; inside a repeat, a bare name such as <code>{"${owner}"}</code> reads the current item first.
        </p>
      </Prose>
      <LiveExample example={templateExample} />

      <DocsH page={page} id="cond" />
      <Prose>
        <p><code>{'{ "$cond": <condition>, "$then": a, "$else": b }'}</code> picks one of two values. Conditions use the same forms as <code>visible</code>, below.</p>
      </Prose>
      <LiveExample example={condExample} />

      <DocsH page={page} id="visible" />
      <Prose>
        <p><code>visible</code> sits on the element, next to <code>props</code>, not inside them. The element and its children render only while the condition holds.</p>
      </Prose>
      <FactTable head={["Condition", "Meaning"]} rows={conditions} />
      <LiveExample example={visibleExample} />

      <DocsH page={page} id="repeat" />
      <Prose>
        <p>
          <code>{'{ "repeat": { "statePath": "/items", "key": "id" } }'}</code> renders the element&apos;s children once per item of a state array. <code>key</code> is optional: name a field that is unique per item so React keeps each row&apos;s place. Inside, read fields with <code>{'{ "$item": "name" }'}</code> and the position with <code>{'{ "$index": true }'}</code>.
        </p>
        <ul>
          <li>A repeat cannot sit inside another repeat. Flatten the data into one array.</li>
          <li>One repeat renders at most {uiLimits.maxRepeatItems} items, and a whole spec at most {maxRenderedElements.toLocaleString("en-US")} elements once repeats expand.</li>
        </ul>
      </Prose>
      <LiveExample example={repeatExample} />

      <DocsH page={page} id="actions" />
      <Prose>
        <p>
          <code>on</code> maps an event to one action or a list of actions that run in order. Events: {eventList}. Every other component has no events. The allowed actions are {[...allowedActions].map((action, index) => <span key={action}>{index > 0 ? ", " : ""}<code>{action}</code></span>)}. Action params accept the same dynamic values as props.
        </p>
      </Prose>
      <FactTable head={["Action", "params", "What it does"]} rows={actionRows} mono={[0, 1]} />
      <CodeSnippet title="Two actions on one press" language="json" code={bindingShape} className="mt-6" />
      <DocsH page={page} id="set-state" />
      <LiveExample example={setStateExample} />
      <DocsH page={page} id="push-remove" />
      <Prose><p>The repeat example above uses both: each Add button pushes an object onto <code>/services</code>, and each Remove button removes its own item with <code>{'{ "$index": true }'}</code>.</p></Prose>
      <DocsH page={page} id="validate-form" />
      <LiveExample example={validateFormExample} />

      <DocsH page={page} id="unsupported" />
      <Prose>
        <ul>
          <li><code>$computed</code>: it needs app functions, and none are registered.</li>
          <li><code>watch</code> and named <code>slots</code> on an element.</li>
          <li>Any action that is not in the list above. Nothing on a page can fetch, send, navigate, or save.</li>
          <li>Keys or state paths that use <code>__proto__</code>, <code>constructor</code>, or <code>prototype</code>.</li>
        </ul>
      </Prose>
      <Note>
        Validation names each of these with the element key and the fix. See <Link href={docsHref("json-render/validation")} className="underline underline-offset-2">Validation</Link>.
      </Note>
    </RegistryPage>
  );
}
