import { join } from "node:path";
import { getGlobalConfigPath, getLocalConfigPath, getPackageName, getPackageDir } from "./installer.ts";
import { InstallManifest } from "./manifest.ts";
import { loadPackageManifest } from "./optional-deps.ts";

export interface PendingOptionalDepsResult {
  count: number;
  ids: string[];
}

const EMPTY_PENDING: PendingOptionalDepsResult = { count: 0, ids: [] };

export async function findPendingOptionalDeps(directory: string): Promise<PendingOptionalDepsResult> {
  const pkgManifest = await loadPackageManifest(getPackageDir());
  if (!pkgManifest.ok) {
    return EMPTY_PENDING;
  }
  const declaredIds = new Set(pkgManifest.manifest.optionalDependencies.map(dep => dep.id));

  const packageName = await getPackageName();
  const configBases = [getGlobalConfigPath(), getLocalConfigPath(directory)];
  const pending = new Set<string>();
  for (const configBase of configBases) {
    const manifest = await InstallManifest.read(join(configBase, `${packageName}.manifest.json`));
    for (const entry of manifest.optionalDependencies) {
      if (entry.state === "pending" && declaredIds.has(entry.id)) {
        pending.add(entry.id);
      }
    }
  }

  return { count: pending.size, ids: [...pending].sort() };
}
