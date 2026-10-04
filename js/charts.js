// Small inline-SVG charts for the Semester Forecast. No libraries, so they
// render offline and cost no data. Colours come from CSS tokens
// (--series-1/--series-2, validated for light and dark surfaces).

import { t, money } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function niceStep(range) {
  const raw = range / 3;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || pow * 10;
}

// Money left at the end of each week: allowance on time vs late.
export function cashFlowChart(f, lateWeeks) {
  const W = 340, H = 200, L = 56, R = 16, T = 16, B = 28;
  const series = [
    { key: 'onTime', label: t('chart.onTime'), cls: 's1', values: [f.start, ...f.onTime.weeks] },
    { key: 'late', label: t('chart.late', { n: lateWeeks }), cls: 's2', values: [f.start, ...f.late.weeks] },
  ];
  const all = series.flatMap((s) => s.values);
  const step = niceStep(Math.max(...all, 0) - Math.min(...all, 0));
  const lo = Math.floor(Math.min(0, ...all) / step) * step;
  const hi = Math.ceil(Math.max(0, ...all) / step) * step || step;
  const x = (i) => L + (i * (W - L - R)) / 8;
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);

  const ticks = [];
  for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);

  const grid = ticks.map((v) => `<line class="grid${v === 0 ? ' zero' : ''}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(money(v))}</text>`).join('');
  const below = lo < 0 ? `<rect class="below" x="${L}" y="${y(0)}" width="${W - L - R}" height="${y(lo) - y(0)}"/>
    <text class="below-label" x="${W - R - 4}" y="${y(lo) - 6}" text-anchor="end">${esc(t('chart.out'))}</text>` : '';
  const xTicks = Array.from({ length: 9 }, (_, i) => `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${i === 0 ? esc(t('chart.start')) : i}</text>`).join('');
  const lines = series.map((s) => `<polyline class="line ${s.cls}" points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`).join('');
  const ends = series.map((s) => `<circle class="dot ${s.cls}" cx="${x(8)}" cy="${y(s.values[8])}" r="4"/>`).join('');
  const runOut = f.late.runOut
    ? `<circle class="dot s2 mark" cx="${x(f.late.runOut)}" cy="${y(f.late.weeks[f.late.runOut - 1])}" r="5"/>` : '';
  // Hit targets bigger than the marks: one column per week.
  const hits = Array.from({ length: 8 }, (_, i) => `<rect class="hit" data-chart-week="${i + 1}" x="${x(i + 0.5)}" y="${T}" width="${(W - L - R) / 8}" height="${H - T - B}" tabindex="0" role="button" aria-label="${esc(t('chart.week', { n: i + 1 }))}"/>`).join('');

  const rows = Array.from({ length: 8 }, (_, i) => `<tr><th scope="row">${i + 1}</th><td>${esc(money(f.onTime.weeks[i]))}</td><td>${esc(money(f.late.weeks[i]))}</td></tr>`).join('');
  const data = JSON.stringify({ onTime: f.onTime.weeks, late: f.late.weeks });

  return `<figure class="chart" data-series='${esc(data)}'>
    <figcaption>
      <span class="chart-title">${esc(t('chart.label'))}</span>
      <span class="legend">${series.map((s) => `<span class="key"><i class="swatch ${s.cls}"></i>${esc(s.label)}</span>`).join('')}</span>
    </figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('chart.label'))}">
      ${below}${grid}${xTicks}<line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" />${lines}${ends}${runOut}${hits}
    </svg>
    <p class="chart-readout" aria-live="polite">${esc(t('chart.hint'))}</p>
    <details class="chart-table"><summary>${esc(t('chart.table'))}</summary>
      <table><thead><tr><th scope="col">#</th><th scope="col">${esc(series[0].label)}</th><th scope="col">${esc(series[1].label)}</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </details>
  </figure>`;
}

// Update the readout + crosshair when a week is tapped or hovered.
export function showChartWeek(rect) {
  const fig = rect.closest('.chart');
  const week = Number(rect.dataset.chartWeek);
  const { onTime, late } = JSON.parse(fig.dataset.series);
  const cx = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2;
  const cross = fig.querySelector('.cross');
  cross.setAttribute('x1', cx);
  cross.setAttribute('x2', cx);
  cross.classList.add('on');
  const keys = fig.querySelectorAll('.legend .key');
  fig.querySelector('.chart-readout').textContent =
    `${t('chart.week', { n: week })}: ${keys[0].textContent} ${money(onTime[week - 1])} · ${keys[1].textContent} ${money(late[week - 1])}`;
}

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
