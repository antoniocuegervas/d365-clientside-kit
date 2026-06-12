import type { IApp } from "./AppContract";

/**
 * THE app registry (step 6), one obvious file mapping app keys to app
 * modules. Apps self-register from clientui/apps/index.ts.
 */
const apps = new Map<string, IApp>();

export function registerApp(key: string, app: IApp): void {
  if (apps.has(key)) {
    throw new Error(`Duplicate app key '${key}', app keys must be unique.`);
  }
  apps.set(key, app);
}

export function getApp(key: string): IApp | undefined {
  return apps.get(key);
}

export function listApps(): Array<{ key: string; title: string }> {
  return [...apps.entries()].map(([key, app]) => ({ key, title: app.title }));
}
