"use client";

import type { ReactNode } from "react";
import ReactGridLayout, {
  noCompactor,
  useContainerWidth,
  type Layout,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import type { DashboardWidget } from "@/lib/api/types";

export const GRID_COLUMNS = 12;
export const GRID_ROW_HEIGHT = 40;
export const GRID_MARGIN = 12;

interface DashboardGridProps {
  widgets: DashboardWidget[];
  onLayoutChange: (layout: Layout) => void;
  renderWidget: (widget: DashboardWidget) => ReactNode;
}

/**
 * RGL v2 wrapper. It is loaded client-side only (the wrapper around this file
 * uses `next/dynamic`), because the grid measures the DOM before rendering.
 *
 * `noCompactor` keeps the saved arrangement exact: moving a tile never silently
 * reflows the rest of the canvas, so the document only changes on user action.
 */
export default function DashboardGrid({
  widgets,
  onLayoutChange,
  renderWidget,
}: DashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth();

  const layout: Layout = widgets.map((widget) => ({
    i: widget.id,
    x: widget.layout.x,
    y: widget.layout.y,
    w: widget.layout.w,
    h: widget.layout.h,
    minW: 2,
    minH: 2,
  }));

  return (
    <div ref={containerRef} className="w-full">
      {mounted ? (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{
            cols: GRID_COLUMNS,
            rowHeight: GRID_ROW_HEIGHT,
            margin: [GRID_MARGIN, GRID_MARGIN],
            containerPadding: [0, 0],
          }}
          dragConfig={{ enabled: true, handle: ".widget-drag-handle" }}
          resizeConfig={{ enabled: true, handles: ["se"] }}
          compactor={noCompactor}
          onLayoutChange={onLayoutChange}
        >
          {widgets.map((widget) => (
            <div key={widget.id}>{renderWidget(widget)}</div>
          ))}
        </ReactGridLayout>
      ) : null}
    </div>
  );
}
