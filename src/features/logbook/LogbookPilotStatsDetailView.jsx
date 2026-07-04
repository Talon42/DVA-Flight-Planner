import { useEffect, useMemo, useState } from "react";
import DataTable from "../../components/data-table/DataTable.jsx";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { sectionTitleTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import { buildPilotStatsDetailTableConfig, getDetailRowId } from "./logbookPilotStatsDetailTable.columns.jsx";

// Renders the pilot stats detail tables with the shared measured DataTable shell.
export default function LogbookPilotStatsDetailView({ detailView, detailRows, onClose }) {
  const [sortKey, setSortKey] = useState("rank");
  const [sortDirection, setSortDirection] = useState("asc");
  const config = useMemo(() => buildPilotStatsDetailTableConfig(detailView, detailRows), [detailRows, detailView]);

  useEffect(() => {
    setSortKey(config.defaultSortKey || "rank");
    setSortDirection(config.defaultSortDirection || "asc");
  }, [config.defaultSortDirection, config.defaultSortKey]);

  const sort = useMemo(
    () => ({
      key: sortKey,
      direction: sortDirection
    }),
    [sortDirection, sortKey]
  );

  const sortedRows = useMemo(() => {
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const activeColumn = config.columns.find((column) => column.sortKey === sortKey) || null;

    return [...rows].sort((left, right) => {
      const leftValue = activeColumn?.getSortValue ? activeColumn.getSortValue(left, activeColumn) : left?.[sortKey];
      const rightValue = activeColumn?.getSortValue ? activeColumn.getSortValue(right, activeColumn) : right?.[sortKey];
      const direction = sortDirection === "asc" ? 1 : -1;

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * direction;
      }

      return String(leftValue ?? "")
        .localeCompare(String(rightValue ?? ""), "en", { numeric: true, sensitivity: "base" })
        * direction;
    });
  }, [config.columns, config.rows, sortDirection, sortKey]);

  function handleSort(nextSortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  }

  return (
    <Panel
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden border border-[color:var(--line)] bg-[var(--surface-raised)] p-3",
        cardFrameClassName
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="justify-self-start text-[0.88rem] bp-1024:text-[0.82rem]"
        >
          <span className="inline-flex items-center gap-1">
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5L7 10l5 5" />
            </svg>
            <span>Back</span>
          </span>
        </Button>
        <p className={cn("m-0 min-w-0 justify-self-center text-center text-[var(--text-heading)]", sectionTitleTextClassName)}>
          {config.title}
        </p>

        <div aria-hidden="true" className="justify-self-end" />
      </div>

      <div className="min-h-0 flex-1 min-w-0">
        <DataTable
          rows={sortedRows}
          columns={config.columns}
          viewportWidth={0}
          layoutMode={config.tableLayoutMode || "fill"}
          sort={sort}
          onSort={handleSort}
          getRowId={(row) => getDetailRowId(detailView, row)}
          virtualized={false}
          rowHeight={config.rowHeight ?? 46}
          initialVisibleRows={sortedRows.length}
          frameClassName="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border border-[color:var(--line)] !bg-[var(--surface-raised)]"
        />
      </div>
    </Panel>
  );
}
