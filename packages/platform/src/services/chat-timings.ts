export type ServiceTimingSummary = {
  flow: string;
  phases: Record<string, number>;
  durations: Record<string, number>;
};

type ServiceTimingOptions = {
  log?: (summary: ServiceTimingSummary) => void;
};

function buildDurations(phases: Record<string, number>) {
  const durations: Record<string, number> = {};
  const entries = Object.entries(phases);

  for (let index = 0; index < entries.length; index += 1) {
    const [startLabel, startTime] = entries[index]!;

    for (let nextIndex = index + 1; nextIndex < entries.length; nextIndex += 1) {
      const [endLabel, endTime] = entries[nextIndex]!;
      durations[`${startLabel}_to_${endLabel}`] = Math.round((endTime - startTime) * 100) / 100;
    }
  }

  return durations;
}

export function createServiceTimingFlow(flow: string, options: ServiceTimingOptions = {}) {
  let phases: Record<string, number> = {};

  function summary(): ServiceTimingSummary {
    return {
      flow,
      phases,
      durations: buildDurations(phases),
    };
  }

  function mark(label: string) {
    phases = {
      ...phases,
      [label]: performance.now(),
    };
    const nextSummary = summary();
    options.log?.(nextSummary);
    return nextSummary;
  }

  function reset() {
    phases = {};
  }

  return {
    mark,
    summary,
    reset,
  };
}
