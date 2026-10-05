export class BundledAssetsMissingError extends Error {
  constructor(
    missingPath: string,
    packageName: string,
    packageVersion: string,
    cacheRoot: string
  ) {
    super(
      `Bundled asset directory missing or empty: ${missingPath}. ` +
        `The ${packageName} package cache at ${cacheRoot}/${packageName}@${packageVersion} ` +
        `is partial. ` +
        `Clear it with: bunx ${packageName} clear-cache, then reinstall with: ` +
        `bunx ${packageName} install --scope global`
    );
    this.name = "BundledAssetsMissingError";
  }
}
