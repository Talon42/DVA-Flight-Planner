import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList as List } from "react-window";
import TableHeader from "./TableHeader";
import TableRow from "./TableRow";
import {
  applyOptionalColumnGroups,
  buildColumnTemplate,
  getTablePresetKey,
  resolveColumnsForPreset,
  resolvedColumnsFit
} from "./tableUtils";
import { TABLE_ROW_HEIGHT } from "./tableWidthPresets";
import { cn } from "../ui/cn";

const INITIAL_VISIBLE_ROWS = 50;
const VISIBLE_ROW_PAGE = 50;
const VISIBLE_ROW_THRESHOLD = 10;

const TableListOuter = forwardRef(function TableListOuter(props, ref) {
  const { className, style, ...rest } = props;

  return (
    <div
      {...rest}
      ref={ref}
      className={cn(className, "app-scrollbar relative z-0 bg-[var(--surface-table-row)]")}
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
      style={style}
      columns={data.columns}
      columnTemplate={data.columnTemplate}
      enableRowSelection={data.enableRowSelection}
      isSelected={isSelected}
      selectedRowClassName={data.selectedRowClassName}
      selectedCellClassName={data.selectedCellClassName}
      onSelectRow={data.onSelectRow}
      onActivateRow={data.onActivateRow}
      getRowClassName={data.getRowClassName}
      renderRowOverlay={data.renderRowOverlay}
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
  selectedCellClassName = "",
  onSelectRow,
  onActivateRow,
  getRowId = (row) => row.id,
  getRowClassName,
  renderRowOverlay,
  rowHeight = TABLE_ROW_HEIGHT,
  virtualized = true,
  initialVisibleRows = INITIAL_VISIBLE_ROWS,
  visibleRowPage = VISIBLE_ROW_PAGE,
  visibleRowThreshold = VISIBLE_ROW_THRESHOLD
}) {
  const tableRef = useRef(null);
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
  const columnTemplate = useMemo(
    () => buildColumnTemplate(resolvedColumns),
    [resolvedColumns]
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
      columns: resolvedColumns,
      columnTemplate,
      selectedRowId,
      onSelectRow,
      onActivateRow,
      getRowId,
      enableRowSelection,
      selectedRowClassName,
      selectedCellClassName,
      getRowClassName,
      renderRowOverlay
    }),
    [
      visibleRows,
      resolvedColumns,
      columnTemplate,
      selectedRowId,
      onSelectRow,
      onActivateRow,
      getRowId,
      enableRowSelection,
      selectedRowClassName,
      selectedCellClassName,
      getRowClassName,
      renderRowOverlay
    ]
  );

  return (
    <div
      ref={tableRef}
      className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border-2 border-[color:var(--panel-border)] bg-[var(--surface-table-row)]"
    >
      <div className="w-full min-w-0 flex-none overflow-hidden">
        <TableHeader
          columns={resolvedColumns}
          columnTemplate={columnTemplate}
          sort={sort}
          onSort={onSort}
          scrollbarOffset={headerScrollbarOffset}
        />
      </div>

      {virtualized ? (
        <div ref={bodyRef} className="min-h-0 w-full min-w-0 flex-1">
          <List
            className="flight-list"
            height={listHeight}
            itemCount={visibleRows.length}
            itemData={itemData}
            itemKey={(index, data) => data.getRowId(data.rows[index]) || index}
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
          className="app-scrollbar relative z-0 min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--surface-table-row)]"
        >
          {rows.map((row) => {
            const rowId = getRowId(row);
            return (
              <TableRow
                key={rowId}
                row={row}
                rowId={rowId}
                style={{ height: rowHeight }}
                columns={resolvedColumns}
                columnTemplate={columnTemplate}
                enableRowSelection={enableRowSelection}
                isSelected={enableRowSelection && selectedRowId != null && selectedRowId === rowId}
                selectedRowClassName={selectedRowClassName}
                selectedCellClassName={selectedCellClassName}
                onSelectRow={onSelectRow}
                onActivateRow={onActivateRow}
                getRowClassName={getRowClassName}
                renderRowOverlay={renderRowOverlay}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
