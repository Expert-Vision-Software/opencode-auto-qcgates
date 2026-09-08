import { getGlobalConfigPath, getLocalConfigPath, getPackageName, getPackageDir } from "./installer.ts";
import { InstallManifest, installManifestPath } from "./manifest.ts";
import { loadPackageManifest } from "./optional-deps.ts";

export async function findPendingOptionalDeps(directory: string): Promise<string[]> {
  const pkgManifest = await loadPackageManifest(getPackageDir());
  if (!pkgManifest.ok) {
    return [];
  }
  const declaredIds = new Set(pkgManifest.manifest.optionalDependencies.map(dep => dep.id));

  const packageName = await getPackageName();
  const configBases = [getGlobalConfigPath(), getLocalConfigPath(directory)];
  const pending = new Set<string>();
  for (const configBase of configBases) {
    const manifest = await InstallManifest.read(installManifestPath(configBase, packageName));
    for (const entry of manifest.optionalDependencies) {
      if (entry.state === "pending" && declaredIds.has(entry.id)) {
        pending.add(entry.id);
      }
    }
  }

  return [...pending].sort();
}
