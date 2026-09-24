// Simulation milliseconds per real millisecond. Slow down around every visible event;
// nearby shots and deaths naturally form one continuous slow-motion stretch.
export function playbackRateAt(time, eventTimes) {
  if (eventTimes.some(event => Math.abs(event - time) <= 30)) return 0.035;
  if (time < -120) return 0.35;
  if (time < 0) return 0.07;
  return 0.16;
}

export function nextEventBetween(from, to, eventTimes) {
  return eventTimes.find(event => event > from + 0.0001 && event <= to) ?? null;
}

