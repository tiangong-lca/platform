/** Fixed, dependency-free enhancement. It receives no report text as executable code. */
export const BROWSER_SCRIPT = String.raw`(() => {
  'use strict';
  for (const table of document.querySelectorAll('[data-report-table]')) {
    const search = table.querySelector('input[type="search"]');
    const order = table.querySelector('select');
    const body = table.querySelector('tbody');
    const count = table.querySelector('[role="status"]');
    const rows = Array.from(body.rows);
    const refresh = () => {
      const query = search.value.toLocaleLowerCase('en-US');
      const selected = rows.slice();
      if (order.value !== 'original') {
        selected.sort((a, b) => {
          const left = a.dataset.label.toLocaleLowerCase('en-US');
          const right = b.dataset.label.toLocaleLowerCase('en-US');
          const comparison = left < right ? -1 : left > right ? 1 : 0;
          return order.value === 'descending' ? -comparison : comparison;
        });
      }
      for (const row of selected) {
        row.hidden = !row.textContent.toLocaleLowerCase('en-US').includes(query);
        body.append(row);
      }
      count.textContent = selected.filter(row => !row.hidden).length + ' of ' + rows.length + ' facts shown';
    };
    search.addEventListener('input', refresh);
    order.addEventListener('change', refresh);
  }
})();`;
