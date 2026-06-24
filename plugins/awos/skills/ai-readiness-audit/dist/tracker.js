// plugins/awos/skills/ai-readiness-audit/collectors/_base.ts
function makeArtifact(source, available, reasonIfAbsent, period, raw) {
  return {
    source,
    available: Boolean(available),
    reason_if_absent: reasonIfAbsent,
    period: {
      bucket_days: period.bucket_days,
      lookback_days: period.lookback_days,
      history_available_days: period.history_available_days
    },
    raw
  };
}

// plugins/awos/skills/ai-readiness-audit/collectors/tracker.ts
function buildTypeCounts(tickets) {
  const counts = {};
  for (const t of tickets) {
    const key = (t.type ?? "unknown").toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
function countResolved(tickets) {
  return tickets.filter(
    (t) => t.status?.toLowerCase() === "done" || t.resolved_at != null
  ).length;
}
function collect(_repoPath, period, connector) {
  if (connector === void 0 || connector === null) {
    return makeArtifact(
      "tracker",
      false,
      "no tracker connector provided; supply a Jira/Linear/GitHub Issues connector to enable work-mix and throughput metrics",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const tickets = connector.tickets ?? [];
  const incident_source = connector.incident_source ?? null;
  const raw = {
    tickets,
    type_counts: buildTypeCounts(tickets),
    resolved_count: countResolved(tickets),
    incident_source
  };
  return makeArtifact("tracker", true, null, period, raw);
}
export {
  collect
};
