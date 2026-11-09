"use client";

import { JSONUIProvider, Renderer } from "@json-render/react";
import { IconPlus } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";

import { UnknownComponent, uiRegistry, uiViews } from "@/components/artifact-view/ui/registry";
import { renderStoutView, type ViewProps } from "@/components/artifact-view/ui/stout";
import { ViewNotice } from "@/components/artifact-view/view-notice";
import { Button } from "@/components/ui/button";
import { validateArtifactContent } from "@/lib/artifact-content";
import type { BlockTemplate } from "@/lib/ui/block-templates";
import { containerComponents, isUiComponentName, type UiComponentName } from "@/lib/ui/catalog";
import { containsExpression } from "@/lib/ui/expressions";
import { toRendererSpec, type UiElement, type UiSpec } from "@/lib/ui/spec";
import { readRawSpec, replaceProps, setProp as setRawProp, writeRawSpec, type RawSpec } from "@/lib/ui/spec-blocks";
import { validateUiSpec } from "@/lib/ui/validate";

import { insertAt, isContainerType } from "./block-changes";
import { BlockEditorContext, createActiveBlockStore, createDraggedBlock, useBlockEditor, type BlockEditor, type InsertTarget } from "./block-editor-context";
import { BlockFrame } from "./block-frame";
import { InsertPicker } from "./insert-picker";
import { PropsDialog } from "./props-dialog";
import { renderEditableBlock } from "./text-blocks";

const noHandlers = {};
const noEmit = () => undefined;

/** True when `content` is an interface the block editor can open: it parses as a spec and renders. */
export function canEditBlocks(content: string): boolean {
  return readRawSpec(content) !== null && validateUiSpec(content).renderable;
}

/** The first error the shared content check (artifacts_validate) finds, or null. */
function firstError(content: string): string | null {
  return validateArtifactContent("ui", content).issues.find((issue) => issue.severity === "error")?.message ?? null;
}

/** Elements driven by state (repeat, visible, or an expression in a prop) render as they do for readers and edit through View source. */
function isStateDriven(element: UiElement): boolean {
  return element.repeat !== undefined || element.visible !== undefined || containsExpression(element.props);
}

/** The block the properties form edits, or null when it is closed or the block is gone. */
function propsBlock(spec: UiSpec, key: string | null) {
  const element = key ? spec.elements[key] : undefined;
  if (!key || !element || !isUiComponentName(element.type)) return null;
  return { key, type: element.type, props: element.props };
}

/** "Add a block" inside a container with no blocks yet. */
function AddInto({ parent }: { parent: string }) {
  const { openInsert } = useBlockEditor();
  return (
    <Button variant="ghost" size="sm" onClick={(event) => { openInsert({ kind: "end", parent }, event.currentTarget); }} className="w-fit text-muted-foreground">
      <IconPlus /> Add a block
    </Button>
  );
}

/** A state-driven element, drawn by json-render so its expressions resolve. */
function StateDrivenElement({ id }: { id: string }) {
  const { spec } = useBlockEditor();
  return <Renderer spec={{ ...toRendererSpec(spec), root: id }} registry={uiRegistry} fallback={UnknownComponent} />;
}

/** One element and, inside it, its child blocks, each with a handle. */
function ElementView({ id }: { id: string }) {
  const { spec } = useBlockEditor();
  const element = spec.elements[id];
  if (!element || !isUiComponentName(element.type)) return null;
  if (isStateDriven(element)) return <StateDrivenElement id={id} />;
  const type: UiComponentName = element.type;
  const blocks: ReactNode[] = element.children.map((child, index) => (
    <BlockFrame key={child} id={child} type={spec.elements[child]?.type ?? "Block"} parent={id} index={index}>
      <ElementView id={child} />
    </BlockFrame>
  ));
  if (blocks.length === 0 && containerComponents.has(type)) blocks.push(<AddInto key="add" parent={id} />);
  const editable = renderEditableBlock(type, id, element.props, blocks);
  if (editable) return editable;
  // Each view matches its own component's props; the map erases that pairing.
  const View = uiViews[type] as ComponentType<ViewProps<UiComponentName>>;
  return renderStoutView(type, { props: element.props, children: blocks, emit: noEmit }, View);
}

interface UiBlockEditorProps {
  content: string;
  onChange: (content: string) => void;
}

/** The editor's actions over the latest spec, kept in a ref so typing never reads a stale spec. */
function useBlockActions(raw: RawSpec | null, onChange: (content: string) => void) {
  const latest = useRef({ raw, onChange });
  const pendingFocus = useRef<string | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => { latest.current = { raw, onChange }; }, [raw, onChange]);

  const apply = useCallback<BlockEditor["apply"]>((change) => {
    const current = latest.current.raw;
    const result = current ? change(current) : null;
    if (!result) return false;
    const text = writeRawSpec(result.spec);
    const error = firstError(text);
    if (error) {
      setProblem(`That change was not made, because the interface would break: ${error}`);
      return false;
    }
    setProblem("");
    pendingFocus.current = result.focus ?? null;
    latest.current.raw = result.spec;
    latest.current.onChange(text);
    return true;
  }, []);

  const setProp = useCallback<BlockEditor["setProp"]>((key, name, value) => {
    const current = latest.current.raw;
    if (!current) return;
    const next = setRawProp(current, key, name, value);
    latest.current.raw = next;
    latest.current.onChange(writeRawSpec(next));
  }, []);

  const takeFocus = useCallback((key: string) => {
    if (pendingFocus.current !== key) return false;
    pendingFocus.current = null;
    return true;
  }, []);

  return { apply, setProp, takeFocus, problem };
}

/**
 * An interface artifact (a json-render spec) edited as itself: click any
 * text and type, use a block's handle to drag, duplicate, or delete it, and
 * add blocks with "+" or by typing "/" on an empty line. Every change keeps
 * the spec valid by the same rules as artifacts_validate; the raw JSON stays
 * behind View source. Render it only when canEditBlocks(content) is true.
 */
export function UiBlockEditor({ content, onChange }: UiBlockEditorProps) {
  const spec = useMemo(() => validateUiSpec(content).spec, [content]);
  const raw = useMemo(() => readRawSpec(content), [content]);
  const { apply, setProp, takeFocus, problem } = useBlockActions(raw, onChange);
  const [insert, setInsert] = useState<{ target: InsertTarget; anchor: HTMLElement } | null>(null);
  const [propsKey, setPropsKey] = useState<string | null>(null);
  const openProps = useCallback((key: string) => { setPropsKey(key); }, []);
  const [dragging] = useState(createDraggedBlock);
  const [active] = useState(createActiveBlockStore);
  const openInsert = useCallback((target: InsertTarget, anchor: HTMLElement) => { setInsert({ target, anchor }); }, []);

  const editor = useMemo<BlockEditor | null>(
    () => (spec ? { spec, apply, setProp, openInsert, openProps, takeFocus, dragging, active } : null),
    [spec, apply, setProp, openInsert, openProps, takeFocus, dragging, active],
  );
  if (!editor || !spec) return null;

  const pick = (template: BlockTemplate) => {
    const target = insert?.target;
    setInsert(null);
    if (target) apply((current) => insertAt(current, target, template.create()));
  };
  const rootType = spec.elements[spec.root]?.type ?? "Block";

  return (
    <JSONUIProvider registry={uiRegistry} initialState={spec.state ?? {}} handlers={noHandlers}>
      <BlockEditorContext value={editor}>
        <div data-slot="ui-block-editor" className="flex min-w-0 flex-col gap-4" onMouseLeave={() => { active.set(null); }}>
          {problem ? <ViewNotice tone="warning" title="Not changed">{problem}</ViewNotice> : null}
          {isContainerType(rootType) ? <ElementView id={spec.root} /> : <BlockFrame id={spec.root} type={rootType} parent={spec.root} index={0}><ElementView id={spec.root} /></BlockFrame>}
          <Button variant="ghost" size="sm" onClick={(event) => { openInsert({ kind: "end", parent: spec.root }, event.currentTarget); }} className="w-fit text-muted-foreground">
            <IconPlus /> Add a block
          </Button>
        </div>
        <InsertPicker anchor={insert?.anchor ?? null} onPick={pick} onClose={() => { setInsert(null); }} />
        <PropsDialog
          block={propsBlock(spec, propsKey)}
          onValid={(key, props) => { apply((current) => ({ spec: replaceProps(current, key, props) })); }}
          onClose={() => { setPropsKey(null); }}
        />
      </BlockEditorContext>
    </JSONUIProvider>
  );
}
