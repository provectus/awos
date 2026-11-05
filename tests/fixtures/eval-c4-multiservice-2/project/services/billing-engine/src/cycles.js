'use strict';

// Billing-cycle computation. Readings are cumulative register values, so the
// usage a meter contributed inside a cycle window is (last reading in window)
// minus (first reading in window). A meter with fewer than two readings in
// the window contributes zero.

function readingsInWindow(readings, { periodStart, periodEnd }) {
  const start = Date.parse(periodStart);
  const end = Date.parse(periodEnd);
  return readings
    .filter((reading) => {
      const at = Date.parse(reading.readAt);
      return at >= start && at <= end;
    })
    .sort((a, b) => a.readAt.localeCompare(b.readAt));
}

function meterUsageKwh(readings, window) {
  const inWindow = readingsInWindow(readings, window);
  if (inWindow.length < 2) return 0;
  return inWindow[inWindow.length - 1].value - inWindow[0].value;
}

function computeCycleUsage({ readingsByMeter, periodStart, periodEnd }) {
  const window = { periodStart, periodEnd };
  const perMeter = [];
  let totalKwh = 0;
  for (const [meterId, readings] of Object.entries(readingsByMeter)) {
    const usageKwh = meterUsageKwh(readings, window);
    perMeter.push({ meterId, usageKwh });
    totalKwh += usageKwh;
  }
  return { totalKwh, perMeter };
}

module.exports = { readingsInWindow, meterUsageKwh, computeCycleUsage };
