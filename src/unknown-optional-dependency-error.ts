export class UnknownOptionalDependencyError extends Error {
  constructor(unknownIds: readonly string[], knownIds: readonly string[]) {
    const known = knownIds.length > 0 ? knownIds.join(", ") : "(none declared)";
    super(
      `Unknown optional dependency: ${unknownIds.join(", ")}. ` +
        `Available optional dependencies: ${known}. ` +
        `Nothing was installed; re-run with a listed id.`
    );
    this.name = "UnknownOptionalDependencyError";
  }
}
