import { Duration } from 'luxon';

export function fakePositiveDurationOnTestMode(duration: Duration): Duration {
  if (process.env.TEST_MODE === 'true') {
    return Duration.fromObject({ hours: Math.round(Math.random() * 30) });
  }
  return duration;
}

export function sliceRandomlyOnTestMode<T>(array: T[]): T[] {
  if (process.env.TEST_MODE === 'true') {
    return shuffle(array).slice(0, Math.round(Math.random() * 2));
  }
  return array;
}

function shuffle<T>(array: T[]) {
  return array.sort(() => Math.random() - 0.5);
}
