import { boxPlacementClass } from "@/components/artifact-view/ui/box";
import { componentProps } from "@/lib/ui/catalog";
import type { UiElement } from "@/lib/ui/spec";
import { cn } from "@/lib/utils";

/*
 * Each block in the interface editor sits in a frame that holds its handle.
 * A block that sizes itself against its parent (a Box that grows in a row, a
 * placeholder that fills the width) would size itself against the frame
 * instead, and the page would lay out differently while it is edited. So
 * the frame takes the block's place in the parent, and the block fills the
 * frame.
 */

/** The frame of a block whose view fills the width it is given. */
const fullWidth = "w-full";

function boxFrame(props: Record<string, unknown>): string | undefined {
  const parsed = componentProps.Box.safeParse(props);
  // The Box is the frame's last child: it grows to the frame's height, so a painted Box in a row is as tall as its neighbours.
  return parsed.success ? cn("flex-col [&>*:last-child]:grow", boxPlacementClass(parsed.data)) : undefined;
}

function placeholderFrame(props: Record<string, unknown>): string | undefined {
  const small = (props.variant === "logo" || props.variant === "avatar") && props.ratio === undefined;
  return small ? undefined : fullWidth;
}

const frames: Record<string, (props: Record<string, unknown>) => string | undefined> = {
  Box: boxFrame,
  Placeholder: placeholderFrame,
  Image: (props) => (props.ratio === undefined ? undefined : fullWidth),
  Button: (props) => (props.fullWidth === true && props.iconOnly !== true ? fullWidth : undefined),
  Input: (props) => cn(fullWidth, props.fullWidth !== true && "max-w-sm"),
  Textarea: (props) => cn(fullWidth, props.fullWidth !== true && "max-w-sm"),
};

/** The classes a block's frame takes so the block sits in its parent as it does for readers, or undefined when the frame needs none. */
export function frameLayoutClass(element: UiElement | undefined): string | undefined {
  return element ? frames[element.type]?.(element.props) : undefined;
}
