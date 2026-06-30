import { cn } from "../ui/cn";
import { bodyMdTextClassName } from "../ui/typography";
import { selectableCellClassName } from "./tableCellStyles";

// Keeps body cells aligned to the same content edge declared in the column metadata.
function getCellAlignmentClass(column) {
  if (column.align === "center") {
    return "justify-center text-center";
  }

  if (column.align === "right") {
    return "justify-end text-right";
  }

  return "justify-start text-left";
}

function normalizeCellContent(content, truncate) {
  if (typeof content === "string" || typeof content === "number") {
    return (
      <span
        className={cn("block min-w-0 leading-none", truncate ? "truncate" : "whitespace-nowrap")}
      >
        {content}
      </span>
    );
  }

  return content;
}

export default function TableRow({
  row,
  rowId,
  style,
  columns,
  columnTemplate,
  enableRowSelection = false,
  isSelected,
  selectedRowClassName = "",
  onSelectRow,
  onActivateRow,
  getRowClassName,
  renderRowOverlay
}) {
  const isSelectableSelected = Boolean(enableRowSelection && isSelected && selectedRowClassName);

  function handleCellClick(column, event) {
    column.onCellClick?.(row, column, event);

    if (column.stopRowSelectOnClick) {
      return;
    }

    if (enableRowSelection) {
      onSelectRow?.(rowId, row);
    }
  }

  return (
    <div
      className={cn(
        "relative grid h-full w-full min-w-0 items-stretch border-b border-[color:var(--line)] bg-[var(--surface-table-row)] transition-colors duration-150 even:bg-[var(--surface-table-row-alt)] hover:bg-[var(--surface-table-row-hover)]",
        getRowClassName?.(row),
        isSelectableSelected && selectedRowClassName
      )}
      style={{
        ...style,
        width: "100%",
        gridTemplateColumns: columnTemplate
      }}
    >
      {renderRowOverlay?.(row) || null}
      {columns.map((column) => {
        const content = column.renderCell ? column.renderCell(row, column) : row[column.key];
        const alignClassName = getCellAlignmentClass(column);
        const overflowClassName = column.allowOverflow ? "overflow-visible" : "overflow-hidden";

        return (
          <div
            key={column.key}
            className={cn(
              "flex min-w-0 self-stretch items-center px-3 bp-1024:px-2",
              overflowClassName,
              alignClassName
            )}
          >
            <button
              type="button"
              className={cn(
                "inline-flex max-w-full appearance-none border-0 bg-transparent p-0 text-left text-[color:var(--table-row-text,var(--text-primary))] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-outline)] dark:text-[rgb(255,255,255)]",
                column.onCellClick ? "cursor-pointer" : "cursor-default",
                bodyMdTextClassName
              )}
              onClick={(event) => handleCellClick(column, event)}
              onDoubleClick={() =>
                onActivateRow
                  ? onActivateRow(rowId, row)
                  : enableRowSelection
                    ? onSelectRow?.(rowId, row)
                    : undefined
              }
              aria-label={column.cellAriaLabel?.(row, column)}
              title={column.cellTitle?.(row, column)}
            >
              <span
                className={cn(
                  "inline-flex min-w-0 max-w-full items-center leading-none",
                  column.onCellClick && selectableCellClassName
                )}
              >
                {normalizeCellContent(content, column.truncate)}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
