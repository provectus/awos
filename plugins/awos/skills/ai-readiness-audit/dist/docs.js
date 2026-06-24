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

// plugins/awos/skills/ai-readiness-audit/collectors/docs.ts
function countRecentlyUpdated(pages, lookbackDays) {
  const cutoff = new Date(Date.now() - lookbackDays * 864e5);
  return pages.filter((p) => {
    if (!p.updated_at) return false;
    const d = new Date(p.updated_at);
    return !isNaN(d.getTime()) && d >= cutoff;
  }).length;
}
function collect(_repoPath, period, connector) {
  if (connector === void 0 || connector === null) {
    return makeArtifact(
      "docs",
      false,
      "no docs connector provided; supply a Confluence/Notion/GitBook connector to enable documentation coverage metrics",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const pages = connector.pages ?? [];
  const recently_updated_count = countRecentlyUpdated(pages, period.lookback_days);
  const raw = {
    pages,
    page_count: pages.length,
    recently_updated_count
  };
  return makeArtifact("docs", true, null, period, raw);
}
export {
  collect
};
