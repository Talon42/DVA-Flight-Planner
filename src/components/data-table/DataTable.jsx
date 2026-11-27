import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FixedSizeList as List } from "react-window";
import TableHeader from "./TableHeader";
import TableRow from "./TableRow";
import {
  applyOptionalColumnGroups,
  buildContentColumnTemplate,
  buildColumnTemplate,
  getTablePresetKey,
  getResolvedColumnsMinWidth,
  resolveColumnsForPreset,
  resolvedColumnsFit
} from "./tableUtils";
import { TABLE_ROW_HEIGHT } from "./tableWidthPresets";
import { cn } from "../ui/cn";
import { tableCanvasClassName } from "../ui/patterns";

const INITIAL_VISIBLE_ROWS = 50;
const VISIBLE_ROW_PAGE = 50;
const VISIBLE_ROW_THRESHOLD = 10;
const CONTENT_FILLER_COLUMN = Object.freeze({
  key: "__content_filler",
  label: "",
  filler: true,
  sortable: false,
  required: false
});

function getDefaultRowId(row) {
  return row.id;
}

function getVirtualizedRowKey(index, data) {
  return data.getRowId(data.rows[index]) || index;
}

const TableListOuter = forwardRef(function TableListOuter(props, ref) {
  const { className, style, ...rest } = props;

  return (
    <div
      {...rest}
      ref={ref}
      role="rowgroup"
      className={cn(className, "app-scrollbar relative z-0", tableCanvasClassName)}
      style={{
        ...style,
        overflowX: "hidden",
        overflowY: "auto"
      }}
    />
  );
});

function RowRenderer({ index, style, data }) {
  const row = data.rows[index];

  if (!row) {
    return null;
  }

  const rowId = data.getRowId(row);
  const isSelected =
    data.enableRowSelection && data.selectedRowId != null && data.selectedRowId === rowId;

  return (
    <TableRow
      row={row}
      rowId={rowId}
      rowIndex={index}
      isActive={index === data.activeRowIndex}
      onRowFocus={data.onRowFocus}
      onRowNavigate={data.onRowNavigate}
      style={style}
      columns={data.columns}
      columnTemplate={data.columnTemplate}
      enableRowSelection={data.enableRowSelection}
      isSelected={isSelected}
      selectedRowClassName={data.selectedRowClassName}
      onSelectRow={data.onSelectRow}
      onActivateRow={data.onActivateRow}
      getRowClassName={data.getRowClassName}
      renderRowOverlay={data.renderRowOverlay}
      layoutMode={data.layoutMode}
    />
  );
}

// Renders the shared measured table shell used by schedule, tours, and logbook views.
export default function DataTable({
  rows,
  columns,
  viewportWidth,
  sort,
  onSort,
  selectedRowId,
  enableRowSelection = false,
  selectedRowClassName = "",
  onSelectRow,
  onActivateRow,
  getRowId = getDefaultRowId,
  getRowClassName,
  renderRowOverlay,
  frameClassName = "",
  layoutMode = "fill",
  activeSortClassName = "",
  rowHeight = TABLE_ROW_HEIGHT,
  virtualized = true,
  initialVisibleRows = INITIAL_VISIBLE_ROWS,
  visibleRowPage = VISIBLE_ROW_PAGE,
  visibleRowThreshold = VISIBLE_ROW_THRESHOLD,
  ariaLabel = "Table",
  rowActionHint = ""
}) {
  const tableRef = useRef(null);
  const listRef = useRef(null);
  const hintId = useId();
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const pendingFocusIndexRef = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  // Uses the measured table width when available so label presets follow the panel, not the window.
  const tableLayoutWidth = availableWidth || viewportWidth;
  const activePresetKey = getTablePresetKey(tableLayoutWidth);
  const fullPresetColumns = useMemo(
    () => resolveColumnsForPreset(columns, tableLayoutWidth, activePresetKey),
    [columns, tableLayoutWidth, activePresetKey]
  );
  const compactPresetColumns = useMemo(
    () => resolveColumnsForPreset(columns, tableLayoutWidth, "compact"),
    [columns, tableLayoutWidth]
  );
  const resolvedColumns = useMemo(() => {
    if (resolvedColumnsFit(fullPresetColumns, tableLayoutWidth)) {
      return fullPresetColumns;
    }

    if (resolvedColumnsFit(compactPresetColumns, tableLayoutWidth)) {
      return compactPresetColumns;
    }

    return applyOptionalColumnGroups(compactPresetColumns, availableWidth, tableLayoutWidth);
  }, [availableWidth, tableLayoutWidth, fullPresetColumns, compactPresetColumns]);
  const displayColumns = useMemo(
    () => (layoutMode === "content" ? [...resolvedColumns, CONTENT_FILLER_COLUMN] : resolvedColumns),
    [layoutMode, resolvedColumns]
  );
  const columnTemplate = useMemo(
    () =>
      layoutMode === "content"
        ? buildContentColumnTemplate(resolvedColumns)
        : buildColumnTemplate(resolvedColumns),
    [layoutMode, resolvedColumns]
  );
  const bodyRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const firstRowId = rows[0] ? getRowId(rows[0]) : "";
  const lastRowId = rows[rows.length - 1] ? getRowId(rows[rows.length - 1]) : "";
  const [visibleRowCount, setVisibleRowCount] = useState(() =>
    Math.min(rows.length, initialVisibleRows)
  );
  const [listHeight, setListHeight] = useState(320);
  const [headerScrollbarOffset, setHeaderScrollbarOffset] = useState(0);

  useEffect(() => {
    setVisibleRowCount(Math.min(rows.length, initialVisibleRows));
  }, [rows.length, firstRowId, lastRowId, initialVisibleRows]);

  // Keep the single tabbable row inside the current result set when filters shrink it.
  useEffect(() => {
    setActiveRowIndex((current) => Math.max(0, Math.min(current, rows.length - 1)));
  }, [rows.length]);

  // Moves keyboard focus to a row, paging it into the rendered window first when needed.
  const focusRow = useCallback(
    (index) => {
      if (!rows.length) {
        return;
      }

      const nextIndex = Math.max(0, Math.min(index, rows.length - 1));
      setVisibleRowCount((current) => Math.max(current, Math.min(rows.length, nextIndex + 1 + visibleRowThreshold)));
      setActiveRowIndex(nextIndex);
      pendingFocusIndexRef.current = nextIndex;
      listRef.current?.scrollToItem?.(nextIndex);
    },
    [rows.length, visibleRowThreshold]
  );

  useEffect(() => {
    const pendingIndex = pendingFocusIndexRef.current;

    if (pendingIndex == null) {
      return undefined;
    }

    let attempts = 0;
    let frame = 0;
    const tryFocus = () => {
      const rowNode = tableRef.current?.querySelector(`[data-row-index="${pendingIndex}"]`);

      if (rowNode) {
        pendingFocusIndexRef.current = null;
        rowNode.focus();
        return;
      }

      attempts += 1;
      if (attempts < 10 && typeof requestAnimationFrame === "function") {
        frame = requestAnimationFrame(tryFocus);
      }
    };

    tryFocus();
    return () => {
      if (frame && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
      }
    };
  }, [activeRowIndex, visibleRowCount]);

  const handleRowNavigate = useCallback(
    (index, key) => {
      const page = Math.max(1, Math.floor(listHeight / rowHeight) - 1);
      const targets = {
        ArrowDown: index + 1,
        ArrowUp: index - 1,
        PageDown: index + page,
        PageUp: index - page,
        Home: 0,
        End: rows.length - 1
      };

      if (!(key in targets)) {
        return false;
      }

      focusRow(targets[key]);
      return true;
    },
    [focusRow, listHeight, rowHeight, rows.length]
  );

  const handleRowFocus = useCallback((index) => {
    setActiveRowIndex(index);
  }, []);

  useEffect(() => {
    const tableNode = tableRef.current;

    if (!tableNode) {
      return undefined;
    }

    const updateAvailableWidth = () => {
      setAvailableWidth(Math.max(0, Math.floor(tableNode.clientWidth)));
    };

    updateAvailableWidth();

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(updateAvailableWidth);
      resizeObserver.observe(tableNode);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener("resize", updateAvailableWidth);
    return () => window.removeEventListener("resize", updateAvailableWidth);
  }, []);

  useEffect(() => {
    const bodyNode = bodyRef.current;

    if (!bodyNode || !virtualized) {
      return undefined;
    }

    const updateListHeight = () => {
      setListHeight(Math.max(140, Math.floor(bodyNode.clientHeight)));
    };

    updateListHeight();

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(updateListHeight);
      resizeObserver.observe(bodyNode);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener("resize", updateListHeight);
    return () => window.removeEventListener("resize", updateListHeight);
  }, [rows.length, viewportWidth, virtualized]);

  const visibleRows = useMemo(
    () => rows.slice(0, visibleRowCount),
    [rows, visibleRowCount]
  );

  useEffect(() => {
    const scrollNode = scrollContainerRef.current;

    if (!scrollNode) {
      setHeaderScrollbarOffset(0);
      return undefined;
    }

    const updateHeaderScrollbarOffset = () => {
      setHeaderScrollbarOffset(
        Math.max(0, scrollNode.offsetWidth - scrollNode.clientWidth)
      );
    };

    updateHeaderScrollbarOffset();

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(updateHeaderScrollbarOffset);
      resizeObserver.observe(scrollNode);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener("resize", updateHeaderScrollbarOffset);
    return () => window.removeEventListener("resize", updateHeaderScrollbarOffset);
  }, [listHeight, visibleRows.length, viewportWidth, virtualized]);

  function handleItemsRendered({ visibleStopIndex }) {
    if (
      visibleStopIndex < visibleRowCount - visibleRowThreshold ||
      visibleRowCount >= rows.length
    ) {
      return;
    }

    setVisibleRowCount((current) => Math.min(rows.length, current + visibleRowPage));
  }
  const itemData = useMemo(
    () => ({
      rows: visibleRows,
      columns: displayColumns,
      columnTemplate,
      layoutMode,
      selectedRowId,
      onSelectRow,
      onActivateRow,
      getRowId,
      enableRowSelection,
      selectedRowClassName,
      getRowClassName,
      renderRowOverlay,
      activeRowIndex,
      onRowFocus: handleRowFocus,
      onRowNavigate: handleRowNavigate
    }),
    [
      activeRowIndex,
      handleRowFocus,
      handleRowNavigate,
      visibleRows,
      displayColumns,
      columnTemplate,
      layoutMode,
      selectedRowId,
      onSelectRow,
      onActivateRow,
      getRowId,
      enableRowSelection,
      selectedRowClassName,
      getRowClassName,
      renderRowOverlay
    ]
  );

  return (
    <div
      ref={tableRef}
      className={cn(
        frameClassName ||
          "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border-2 border-[color:var(--panel-border)]",
        tableCanvasClassName
      )}
    >
      {/* One horizontal viewport keeps header and body in lockstep, including keyboard focus scrolling. */}
      <div
        className="app-scrollbar flex min-h-0 w-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        role="region"
        aria-label={`${ariaLabel} columns`}
        tabIndex={0}
      >
        {rowActionHint ? (
          <p id={hintId} className="sr-only">
            {rowActionHint}
          </p>
        ) : null}
        <div
          className="flex min-h-0 min-w-full flex-1 flex-col"
          role="grid"
          aria-label={ariaLabel}
          aria-describedby={rowActionHint ? hintId : undefined}
          aria-rowcount={rows.length + 1}
          aria-readonly="true"
          style={{ minWidth: getResolvedColumnsMinWidth(resolvedColumns) + headerScrollbarOffset }}
        >
          <div className="w-full min-w-0 flex-none overflow-hidden" role="rowgroup">
            <TableHeader
              columns={displayColumns}
              columnTemplate={columnTemplate}
              sort={sort}
              onSort={onSort}
              scrollbarOffset={headerScrollbarOffset}
              layoutMode={layoutMode}
              activeSortClassName={activeSortClassName}
            />
          </div>

          {virtualized ? (
            <div ref={bodyRef} className="min-h-0 w-full min-w-0 flex-1">
              <List
                ref={listRef}
                className="flight-list"
                height={listHeight}
                itemCount={visibleRows.length}
                itemData={itemData}
                itemKey={getVirtualizedRowKey}
                itemSize={rowHeight}
                onItemsRendered={handleItemsRendered}
                outerElementType={TableListOuter}
                outerRef={scrollContainerRef}
                overscanCount={8}
                width="100%"
              >
                {RowRenderer}
              </List>
            </div>
          ) : (
            <div
              ref={scrollContainerRef}
              role="rowgroup"
              className={cn(
                "app-scrollbar relative z-0 min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden",
                tableCanvasClassName
              )}
            >
              {rows.map((row, index) => {
                const rowId = getRowId(row);
                return (
                  <TableRow
                    key={rowId}
                  row={row}
                  rowId={rowId}
                  rowIndex={index}
                  isActive={index === activeRowIndex}
                  onRowFocus={handleRowFocus}
                  onRowNavigate={handleRowNavigate}
                  style={{ height: rowHeight }}
                  columns={displayColumns}
                  columnTemplate={columnTemplate}
                  enableRowSelection={enableRowSelection}
                  isSelected={enableRowSelection && selectedRowId != null && selectedRowId === rowId}
                  selectedRowClassName={selectedRowClassName}
                  onSelectRow={onSelectRow}
                  onActivateRow={onActivateRow}
                  getRowClassName={getRowClassName}
                  renderRowOverlay={renderRowOverlay}
                  layoutMode={layoutMode}
                />
              );
            })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
