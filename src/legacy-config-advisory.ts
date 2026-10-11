export class LegacyPluginKeyAdvisor {
  private readonly advisedPaths: Set<string> = new Set();

  advise(configPath: string, packageName: string): void {
    if (this.advisedPaths.has(configPath)) {
      return;
    }
    this.advisedPaths.add(configPath);
    console.warn(this.buildMessage(configPath, packageName));
  }

  private buildMessage(configPath: string, packageName: string): string {
    return (
      `[${packageName}] The singular "plugin" key in ${configPath} is legacy and inert under ` +
      `OpenCode v2; the host loads the "plugins" array instead. Run "bunx ${packageName} install" ` +
      `to write the v2 "plugins" entry. The legacy key is tolerated read-only and was left untouched.`
    );
  }
}

export const legacyPluginKeyAdvisor = new LegacyPluginKeyAdvisor();
