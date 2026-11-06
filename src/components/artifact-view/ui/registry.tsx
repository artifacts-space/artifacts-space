"use client";

import { defineRegistry, type BaseComponentProps } from "@json-render/react";
import type { ComponentType, ReactNode } from "react";

import type { UiComponentName } from "@/lib/ui/catalog";
import { uiCatalog } from "@/lib/ui/catalog";

import { ChartView } from "./chart";
import { BadgeView, CalloutView, CodeView, HeadingView, LinkView, ListView, MarkdownBlockView, QuoteView, TextView } from "./content";
import { DiagramView, MetricView, ProgressView, TableView, TimelineView } from "./data";
import { ButtonView, CheckboxView, ChecklistView, SelectView, SliderView, SwitchView } from "./inputs";
import { AccordionView, CardView, GridView, SectionView, SeparatorView, StackView, TabsView } from "./layout";
import { KeyValueView } from "./key-value";
import { FileView, ImageView } from "./media";
import { StepsView } from "./steps";
import { renderStout, type ViewProps } from "./stout";

type Views = { [K in UiComponentName]: ComponentType<ViewProps<K>> };

/** One view per catalog component. */
const views: Views = {
  Section: SectionView,
  Stack: StackView,
  Grid: GridView,
  Card: CardView,
  Tabs: TabsView,
  Accordion: AccordionView,
  Separator: SeparatorView,
  Heading: HeadingView,
  Text: TextView,
  Markdown: MarkdownBlockView,
  Code: CodeView,
  Callout: CalloutView,
  Badge: BadgeView,
  List: ListView,
  Steps: StepsView,
  Link: LinkView,
  Quote: QuoteView,
  Table: TableView,
  Metric: MetricView,
  Chart: ChartView,
  KeyValue: KeyValueView,
  Progress: ProgressView,
  Timeline: TimelineView,
  Diagram: DiagramView,
  Checklist: ChecklistView,
  Checkbox: CheckboxView,
  Select: SelectView,
  Switch: SwitchView,
  Slider: SliderView,
  Button: ButtonView,
  Image: ImageView,
  File: FileView,
};

function stoutComponent(type: UiComponentName) {
  // Each view matches its own component's props; the map erases that pairing, so restore the general type.
  const View = views[type] as ComponentType<ViewProps<UiComponentName>>;
  return (context: BaseComponentProps) => renderStout(type, context, View);
}

const components = Object.fromEntries(
  (Object.keys(views) as UiComponentName[]).map((type) => [type, stoutComponent(type)]),
) as Record<UiComponentName, (context: BaseComponentProps) => ReactNode>;

/** The React registry for ui artifacts: every catalog component, each checked and isolated. */
export const { registry: uiRegistry } = defineRegistry(uiCatalog, { components });

/** Rendered for component types the catalog does not know: nothing visible. Validation reports them. */
export function UnknownComponent() {
  return null;
}
