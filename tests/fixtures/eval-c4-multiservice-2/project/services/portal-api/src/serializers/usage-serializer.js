'use strict';

// Shapes raw readings into the per-meter usage payload the portal returns.

function serializeUsage({ customerId, readings }) {
  const byMeter = new Map();
  for (const reading of readings) {
    if (!byMeter.has(reading.meterId)) {
      byMeter.set(reading.meterId, []);
    }
    byMeter.get(reading.meterId).push(reading);
  }

  const meters = [...byMeter.entries()].map(([meterId, meterReadings]) => ({
    meterId,
    points: meterReadings.map((r) => ({
      readAt: r.readAt,
      value: r.value,
      unit: r.unit,
    })),
  }));

  return { customerId, meters };
}

module.exports = { serializeUsage };
