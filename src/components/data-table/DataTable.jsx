import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList as List } from "react-window";
import TableHeader from "./TableHeader";
import TableRow from "./TableRow";
import { buildColumnTemplate, fitColumnsToWidth, resolveColumns } from "./tableUtils";
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
      className={cn(className, "app-scrollbar")}
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

  return (
    <TableRow
      row={row}
      rowId={rowId}
      style={style}
      columns={data.columns}
      columnTemplate={data.columnTemplate}
      isSelected={data.selectedRowId === rowId}
      onSelectRow={data.onSelectRow}
      onActivateRow={data.onActivateRow}
      getRowClassName={data.getRowClassName}
      renderRowOverlay={data.renderRowOverlay}
    />
  );
}

export default function DataTable({
  rows,
  columns,
  viewportWidth,
  sort,
  onSort,
  timeDisplayMode,
  onToggleTimeDisplayMode,
  selectedRowId,
  onSelectRow,
  onActivateRow,
  getRowId = (row) => row.id,
  getRowClassName,
  renderRowOverlay,
  rowHeight = TABLE_ROW_HEIGHT
}) {
  const tableRef = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const baseColumns = useMemo(
    () => resolveColumns(columns, viewportWidth),
    [columns, viewportWidth]
  );
  const resolvedColumns = useMemo(
    () => fitColumnsToWidth(baseColumns, availableWidth),
    [availableWidth, baseColumns]
  );
  const columnTemplate = useMemo(
    () => buildColumnTemplate(resolvedColumns, availableWidth),
    [availableWidth, resolvedColumns]
  );
  const bodyRef = useRef(null);
  const listOuterRef = useRef(null);
  const firstRowId = rows[0] ? getRowId(rows[0]) : "";
  const lastRowId = rows[rows.length - 1] ? getRowId(rows[rows.length - 1]) : "";
  const [visibleRowCount, setVisibleRowCount] = useState(() =>
    Math.min(rows.length, INITIAL_VISIBLE_ROWS)
  );
  const [listHeight, setListHeight] = useState(320);
  const [headerScrollbarOffset, setHeaderScrollbarOffset] = useState(0);

  useEffect(() => {
    setVisibleRowCount(Math.min(rows.length, INITIAL_VISIBLE_ROWS));
  }, [rows.length, firstRowId, lastRowId]);

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
  }, [viewportWidth]);

  useEffect(() => {
    const bodyNode = bodyRef.current;

    if (!bodyNode) {
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
  }, [rows.length, viewportWidth]);

  const visibleRows = useMemo(
    () => rows.slice(0, visibleRowCount),
    [rows, visibleRowCount]
  );

  useEffect(() => {
    const listOuterNode = listOuterRef.current;

    if (!listOuterNode) {
      setHeaderScrollbarOffset(0);
      return undefined;
    }

    const updateHeaderScrollbarOffset = () => {
      setHeaderScrollbarOffset(
        Math.max(0, listOuterNode.offsetWidth - listOuterNode.clientWidth)
      );
    };

    updateHeaderScrollbarOffset();

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(updateHeaderScrollbarOffset);
      resizeObserver.observe(listOuterNode);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener("resize", updateHeaderScrollbarOffset);
    return () => window.removeEventListener("resize", updateHeaderScrollbarOffset);
  }, [listHeight, visibleRows.length, viewportWidth]);

  function handleItemsRendered({ visibleStopIndex }) {
    if (
      visibleStopIndex < visibleRowCount - VISIBLE_ROW_THRESHOLD ||
      visibleRowCount >= rows.length
    ) {
      return;
    }

    setVisibleRowCount((current) => Math.min(rows.length, current + VISIBLE_ROW_PAGE));
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
      getRowClassName,
      renderRowOverlay
    ]
  );

  return (
    <div
      ref={tableRef}
      className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border-2 border-[color:var(--panel-border)]"
    >
      <div className="w-full min-w-0 flex-none overflow-hidden">
        <TableHeader
          columns={resolvedColumns}
          columnTemplate={columnTemplate}
          sort={sort}
          onSort={onSort}
          timeDisplayMode={timeDisplayMode}
          onToggleTimeDisplayMode={onToggleTimeDisplayMode}
          scrollbarOffset={headerScrollbarOffset}
        />
      </div>

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
          outerRef={listOuterRef}
          overscanCount={8}
          width="100%"
        >
          {RowRenderer}
        </List>
      </div>
    </div>
  );
}
