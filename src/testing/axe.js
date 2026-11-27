import axe from "axe-core";

// WCAG 2.2 A and AA rules, the conformance target of the accessibility audit.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Runs axe-core on a rendered DOM node and returns readable violation strings, so a failing
 * test names the rule and the elements. Color contrast and page-level rules are switched off
 * because jsdom has no layout or computed colors and a component is not a whole page; the
 * live-app scan covers those.
 */
export async function getAxeViolations(node = document.body, { rules = {} } = {}) {
  const results = await axe.run(node, {
    runOnly: { type: "tag", values: WCAG_TAGS },
    rules: {
      "color-contrast": { enabled: false },
      "target-size": { enabled: false },
      region: { enabled: false },
      "page-has-heading-one": { enabled: false },
      "landmark-one-main": { enabled: false },
      // WCAG 2.5.3 Label in Name: tagged experimental in axe, so the tag filter leaves it out.
      "label-content-name-mismatch": { enabled: true },
      ...rules
    }
  });

  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help} -> ${violation.nodes
        .map((item) => item.target.join(" "))
        .join(", ")}`
  );
}
