// Arrow-key behavior for a WAI-ARIA tab list with automatic activation:
// Left/Right (and Up/Down) move to the previous/next tab, Home/End to the ends; the newly
// focused tab is selected. Pair with tabIndex={selected ? 0 : -1} on each tab (WCAG 2.1.1).
export function handleTabListKeyDown(event, tabIds, activeId, onSelect) {
  const keys = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1
  };
  const count = tabIds.length;
  const currentIndex = Math.max(0, tabIds.indexOf(activeId));
  let nextIndex;

  if (event.key in keys) {
    nextIndex = (currentIndex + keys[event.key] + count) % count;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = count - 1;
  } else {
    return;
  }

  event.preventDefault();
  const nextId = tabIds[nextIndex];
  onSelect(nextId);
  const tabList = event.currentTarget;
  const nextTab = tabList?.querySelectorAll?.('[role="tab"]')?.[nextIndex];
  nextTab?.focus();
}
