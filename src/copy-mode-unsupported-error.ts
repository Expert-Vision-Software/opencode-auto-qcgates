export class CopyModeUnsupportedError extends Error {
  constructor(packageName: string) {
    super(
      `${packageName} is a code-backed package: it ships a src/plugin.ts hook plus skills and ` +
        `commands that only work through plugin registration. Copy install cannot express ` +
        `that. Run without --mode copy, or with --mode plugin.`
    );
    this.name = "CopyModeUnsupportedError";
  }
}
