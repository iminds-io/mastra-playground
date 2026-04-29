export type ChatTimingSummary = {
  flow: string;
  marks: Record<string, number>;
  durations: Record<string, number>;
};

type ChatTimingOptions = {
  log?: (summary: ChatTimingSummary) => void;
};

function buildDurations(marks: Record<string, number>) {
  const durations: Record<string, number> = {};
  const entries = Object.entries(marks);

  for (let index = 0; index < entries.length; index += 1) {
    const [startLabel, startTime] = entries[index]!;

    for (let nextIndex = index + 1; nextIndex < entries.length; nextIndex += 1) {
      const [endLabel, endTime] = entries[nextIndex]!;
      durations[`${startLabel}_to_${endLabel}`] = Math.round((endTime - startTime) * 100) / 100;
    }
  }

  return durations;
}

export function createChatTimingFlow(flow: string, options: ChatTimingOptions = {}) {
  let marks: Record<string, number> = {};

  function summary(): ChatTimingSummary {
    return {
      flow,
      marks,
      durations: buildDurations(marks),
    };
  }

  function mark(label: string) {
    marks = {
      ...marks,
      [label]: performance.now(),
    };
    const nextSummary = summary();
    options.log?.(nextSummary);
    return nextSummary;
  }

  function reset() {
    marks = {};
  }

  return {
    mark,
    summary,
    reset,
  };
}
