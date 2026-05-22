import { env } from '$env/dynamic/private';

export function load() {
  return {
    hasServerToken: Boolean(env.DAILY_DEV_API_TOKEN?.trim())
  };
}
