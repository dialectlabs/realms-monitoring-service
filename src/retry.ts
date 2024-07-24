import { noop } from 'lodash';

export interface RetryParameters<T> {
  func: () => Promise<T>;
  maxRetries?: number;
  onError?: (e: Error) => void;
}
export async function retry<T>({
  func,
  maxRetries = 2,
  onError = noop,
}: RetryParameters<T>): Promise<T> {
  for (let count = 0; count < maxRetries; count++) {
    try {
      return await func();
    } catch (e) {
      if (e instanceof Error) {
        onError(e);
      }
    }
  }
  throw new Error('Retries exceeded: try again later');
}
