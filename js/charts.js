// Small inline-SVG charts for the Semester Forecast. No libraries, so they
// render offline and cost no data. Colours come from CSS tokens
// (--series-1/--series-2, validated for light and dark surfaces).

import { t } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Risk per week as columns: one hue for magnitude, the two riskiest called out.
export function riskStrip(risks, top, causeLabel) {
  const max = Math.max(...risks.map((r) => r.total), 1);
  const topWeeks = top.map((r) => r.week);
  return `<div class="risk-strip" role="list">
    ${risks.map((r) => {
      const isTop = topWeeks.includes(r.week);
      const label = `${t('chart.week', { n: r.week })}: ${t(`fc.level.${r.level}`)}${r.total ? ` · ${causeLabel(r.cause)}` : ''}`;
      return `<button class="risk-col ${isTop ? 'top' : ''}" role="listitem" data-risk="${esc(label)}" aria-label="${esc(label)}">
        <span class="risk-bar"><span style="height:${Math.max(6, (r.total / max) * 100)}%"></span></span>
        <span class="risk-week">${r.week}</span>
      </button>`;
    }).join('')}
  </div>
  <ul class="risk-top">${top.map((r) => `<li><b>${esc(t('chart.week', { n: r.week }))}</b> ${esc(causeLabel(r.cause))}</li>`).join('')}</ul>
  <p class="chart-readout risk-readout" aria-live="polite">${esc(t('chart.hint'))}</p>`;
}
