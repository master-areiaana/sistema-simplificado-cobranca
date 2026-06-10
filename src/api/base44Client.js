import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const rawBase44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: appBaseUrl || '',
  requiresAuth: false,
  appBaseUrl
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let queue = Promise.resolve();

function isRateLimitError(error) {
  return String(error?.message || error || '').toLowerCase().includes('rate limit');
}

async function runWithRateLimit(fn) {
  const run = async () => {
    let lastError = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const result = await fn();
        await sleep(350);
        return result;
      } catch (error) {
        lastError = error;
        if (!isRateLimitError(error)) throw error;
        await sleep(1800 + attempt * 900);
      }
    }

    throw lastError;
  };

  const task = queue.then(run, run);
  queue = task.catch(() => undefined);
  return task;
}

function proxify(value) {
  if (!value || typeof value !== 'object') return value;

  return new Proxy(value, {
    get(target, prop, receiver) {
      const current = Reflect.get(target, prop, receiver);

      if (typeof current === 'function') {
        if (prop === 'subscribe') {
          return current.bind(target);
        }

        return (...args) => runWithRateLimit(() => current.apply(target, args));
      }

      if (current && typeof current === 'object') {
        return proxify(current);
      }

      return current;
    }
  });
}

export const base44 = proxify(rawBase44);
