import { cn } from "../ui/cn";
import { bodyMdTextClassName } from "../ui/typography";

function normalizeCellContent(content, truncate) {
  if (typeof content === "string" || typeof content === "number") {
    return (
      <span
        className={cn(
          "block min-w-0 overflow-hidden leading-none",
          truncate ? "truncate" : "whitespace-nowrap"
        )}
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
  isSelected,
  onSelectRow,
  onActivateRow,
  getRowClassName,
  renderRowOverlay
}) {
  return (
    <div
      className={cn(
        "relative grid h-full w-full min-w-0 items-stretch border-b border-[color:var(--line)] bg-[var(--surface-table-row)] even:bg-[var(--surface-table-row-alt)]",
        isSelected && "bg-[var(--surface-table-row-selected)]",
        getRowClassName?.(row)
      )}
      style={{
        ...style,
        width: "100%",
        gridTemplateColumns: columnTemplate
      }}
    >
      {renderRowOverlay?.(row) || null}
      {columns.map((column) => {
        const content = column.renderCell ? column.renderCell(row) : row[column.key];

        return (
          <div key={column.key} className="min-w-0 self-stretch">
            <button
              type="button"
              className={cn(
                "block h-full w-full appearance-none border-0 bg-transparent p-0 text-left text-[var(--text-primary)] outline-none transition-colors duration-150 hover:bg-[rgba(255,255,255,0.18)] dark:text-[rgb(255,255,255)]",
                bodyMdTextClassName
              )}
              onClick={() => onSelectRow?.(rowId)}
              onDoubleClick={() =>
                onActivateRow ? onActivateRow(rowId) : onSelectRow?.(rowId)
              }
            >
              <span
                className={cn(
                  "flex h-full min-h-0 w-full items-center overflow-hidden px-3 leading-none bp-1024:px-2",
                  column.align === "center" && "justify-center text-center",
                  column.align === "right" && "justify-end text-right",
                  column.align !== "center" && column.align !== "right" && "text-left"
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
