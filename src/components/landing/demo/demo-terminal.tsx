import type { ReactNode } from "react";

import { agentWrap, demoCalls, demoPeople, demoPrompt, T, typedAt, type DemoCall } from "@/lib/landing/demo-story";
import { toolRows } from "@/lib/mcp/tool-summaries";

import { beat } from "./beat";

const toolCount = toolRows().length;

/** A line of the transcript: a marker column, then the text. */
function Line({ marker, className, style, children }: { marker: ReactNode; className: string; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <div className={className} style={style}>
      <span aria-hidden="true">{marker}</span>
      <p>{children}</p>
    </div>
  );
}

/** One MCP call the way Claude Code prints it, then its result under ⎿. */
function Call({ call }: { call: DemoCall }) {
  return (
    <>
      <Line marker={<span className="demo-dot" data-ok="" />} className="demo-call" style={beat(call.at)}>
        <b>artifacts - {call.tool}</b> (MCP)
        <span className="demo-args">
          ({call.args.map(([key, value], index) => `${index > 0 ? ", " : ""}${key}: "${value}"`).join("")})
        </span>
      </Line>
      <Line marker="⎿" className="demo-result" style={beat(call.resultAt)}>
        {call.result}
      </Line>
    </>
  );
}

/** The prompt, one character at a time, as it is typed into the input box. */
function TypedPrompt() {
  return (
    <span className="demo-typed" style={beat(0, T.send)}>
      {Array.from(demoPrompt, (char, index) => (
        <span key={index} className="demo-char" style={beat(typedAt(index))}>{char}</span>
      ))}
    </span>
  );
}

/**
 * A Claude Code session, drawn the way Claude Code draws it: the welcome box,
 * the `>` prompt, `⏺` tool calls with compact arguments, `⎿` results, and the
 * input box at the bottom. It follows the page theme.
 */
export function DemoTerminal() {
  return (
    <div className="demo-term">
      <div className="demo-term__bar">
        <span className="demo-lights"><i /><i /><i /></span>
        <span className="demo-term__title">claude — ~/{demoPeople.project}</span>
      </div>
      <div className="demo-term__body" data-demo-pane="">
        <Line marker={<span className="demo-spark">✻</span>} className="demo-welcome">
          <b>Claude Code</b>
          <span>~/{demoPeople.project} · artifacts connected</span>
        </Line>
        <Line marker="&gt;" className="demo-user" style={beat(T.send)}>{demoPrompt}</Line>
        {demoCalls.map((call) => <Call key={`${call.tool}-${String(call.at)}`} call={call} />)}
        <Line marker={<span className="demo-dot" />} className="demo-say" style={beat(T.wrap)}>{agentWrap}</Line>
      </div>
      <div className="demo-term__input" data-demo-pane="">
        <span aria-hidden="true">&gt;</span>
        <p>
          {/* The full prompt keeps the box at its typed height; the typed copy sits on top of it. */}
          <span className="demo-term__sizer">{demoPrompt}</span>
          <span className="demo-term__live">
            <TypedPrompt />
            <i className="demo-caret" />
          </span>
        </p>
      </div>
      <div className="demo-term__hint">
        <span>? for shortcuts</span>
        <span>artifacts · {toolCount} tools</span>
      </div>
    </div>
  );
}
