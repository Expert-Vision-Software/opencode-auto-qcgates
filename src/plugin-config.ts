import { exists, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { PluginNameNormalizer } from "./plugin-name.ts";

export type ConfigScope = "local" | "global";

export interface PluginConfigOptions {
  scope: ConfigScope;
  projectDir: string;
}

export interface EnsurePluginEntryOutcome {
  action: "noop" | "updated" | "created" | "blocked";
  configPath: string | null;
  warning: string | null;
}

export interface RemovePluginEntryOutcome {
  action: "noop" | "removed" | "blocked";
  configPath: string | null;
  warning: string | null;
}

interface CandidateConfig {
  path: string;
  lenient: boolean;
  writable: boolean;
}

interface CandidateRead {
  candidate: CandidateConfig;
  text: string;
  plugins: string[] | null;
}

interface PluginArrayRange {
  bracketStart: number;
  bracketEnd: number;
}

const DEFAULT_CONFIG_TEMPLATE = `{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["__PACKAGE_NAME__"]
}
`;

export class PluginConfigEditor {
  async ensurePluginEntry(
    packageName: string,
    options: PluginConfigOptions
  ): Promise<EnsurePluginEntryOutcome> {
    const canonical = PluginNameNormalizer.canonicalize(packageName);
    for (const { candidate, text, plugins } of await this.readCandidates(options)) {
      if (plugins === null) {
        return {
          action: "blocked",
          configPath: candidate.path,
          warning: this.parseFailureWarning(candidate.path),
        };
      }
      if (this.hasMatchingEntry(plugins, packageName)) {
        return { action: "noop", configPath: candidate.path, warning: null };
      }
      if (!candidate.writable) {
        continue;
      }
      const spliced = this.spliceEntry(text, canonical, packageName, candidate.lenient);
      if (spliced === null) {
        return {
          action: "blocked",
          configPath: candidate.path,
          warning: `The plugin array in ${candidate.path} could not be safely edited; file left untouched.`,
        };
      }
      await mkdir(join(candidate.path, ".."), { recursive: true });
      await writeFile(candidate.path, spliced);
      return { action: "updated", configPath: candidate.path, warning: null };
    }

    const target = await this.defaultConfigPath(options);
    const content = DEFAULT_CONFIG_TEMPLATE.replace("__PACKAGE_NAME__", canonical);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content);
    return { action: "created", configPath: target, warning: null };
  }

  async removePluginEntry(
    packageName: string,
    options: PluginConfigOptions
  ): Promise<RemovePluginEntryOutcome> {
    for (const { candidate, text, plugins } of await this.readCandidates(options)) {
      if (!candidate.writable) {
        continue;
      }
      if (plugins === null) {
        return {
          action: "blocked",
          configPath: candidate.path,
          warning: this.parseFailureWarning(candidate.path),
        };
      }
      let updated = text;
      while (this.hasMatchingEntry(this.parsePluginArray(updated, candidate.lenient) ?? [], packageName)) {
        const spliced = this.spliceOutFirstEntry(updated, packageName, candidate.lenient);
        if (spliced === null) {
          return {
            action: "blocked",
            configPath: candidate.path,
            warning: `The plugin array in ${candidate.path} could not be safely edited; file left untouched.`,
          };
        }
        updated = spliced;
      }
      if (updated === text) {
        continue;
      }
      await writeFile(candidate.path, updated);
      return { action: "removed", configPath: candidate.path, warning: null };
    }
    return { action: "noop", configPath: null, warning: null };
  }

  private hasMatchingEntry(entries: string[], packageName: string): boolean {
    return entries.some(entry => PluginNameNormalizer.matches(entry, packageName));
  }

  private parseFailureWarning(configPath: string): string {
    return (
      `Config file ${configPath} could not be parsed; refusing to modify it. ` +
      `Fix or remove the file and re-run the command. The file was left unchanged.`
    );
  }

  private candidateConfigs(options: PluginConfigOptions): CandidateConfig[] {
    const scopeBase = this.scopeBase(options.scope, options.projectDir);
    const configs: CandidateConfig[] = [];
    if (options.scope === "local") {
      for (const root of [scopeBase, options.projectDir]) {
        configs.push({ path: join(root, "opencode.json"), lenient: false, writable: true });
        configs.push({ path: join(root, "opencode.jsonc"), lenient: true, writable: true });
      }
    } else {
      configs.push({ path: join(scopeBase, "opencode.json"), lenient: false, writable: true });
      configs.push({ path: join(scopeBase, "opencode.jsonc"), lenient: true, writable: true });
    }
    return configs;
  }

  private async readCandidates(options: PluginConfigOptions): Promise<CandidateRead[]> {
    const reads: CandidateRead[] = [];
    for (const candidate of this.candidateConfigs(options)) {
      if (!(await exists(candidate.path))) {
        continue;
      }
      const text = await readFile(candidate.path, "utf-8");
      const plugins = this.parsePluginArray(text, candidate.lenient);
      if (plugins === null) {
        console.warn(`Warning: ${this.parseFailureWarning(candidate.path)}`);
      }
      reads.push({ candidate, text, plugins });
    }
    return reads;
  }

  private async defaultConfigPath(options: PluginConfigOptions): Promise<string> {
    if (options.scope === "global") {
      return join(this.scopeBase("global", options.projectDir), "opencode.json");
    }
    return join(this.scopeBase("local", options.projectDir), "opencode.json");
  }

  private scopeBase(scope: ConfigScope, projectDir: string): string {
    if (scope === "local") {
      return join(projectDir, ".opencode");
    }
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    if (xdgConfigHome) {
      return join(xdgConfigHome, "opencode");
    }
    return join(homedir(), ".config", "opencode");
  }

  private parsePluginArray(text: string, lenient: boolean): string[] | null {
    const config = this.parseConfig(text, lenient);
    if (config === null) {
      return null;
    }
    const plugins = config["plugin"];
    if (!Array.isArray(plugins)) {
      return [];
    }
    return plugins.filter((entry): entry is string => typeof entry === "string");
  }

  private parseConfig(text: string, lenient: boolean): Record<string, unknown> | null {
    const parseable = lenient ? this.normalizeJsonc(text) : text;
    try {
      return JSON.parse(parseable) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private normalizeJsonc(text: string): string {
    const withoutComments = this.blankComments(text);
    return withoutComments.replace(/,(\s*[}\]])/g, "$1");
  }

  private blankComments(text: string): string {
    const chars = text.split("");
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = 0; i < chars.length; i++) {
      const current = chars[i];
      const next = i + 1 < chars.length ? chars[i + 1] : "";
      if (inLineComment) {
        if (current === "\n") {
          inLineComment = false;
        } else {
          chars[i] = " ";
        }
        continue;
      }
      if (inBlockComment) {
        if (current === "*" && next === "/") {
          chars[i] = " ";
          chars[i + 1] = " ";
          i++;
          inBlockComment = false;
        } else {
          chars[i] = " ";
        }
        continue;
      }
      if (inString) {
        if (current === "\\") {
          i++;
          continue;
        }
        if (current === '"') {
          inString = false;
        }
        continue;
      }
      if (current === '"') {
        inString = true;
        continue;
      }
      if (current === "/" && next === "/") {
        chars[i] = " ";
        chars[i + 1] = " ";
        i++;
        inLineComment = true;
        continue;
      }
      if (current === "/" && next === "*") {
        chars[i] = " ";
        chars[i + 1] = " ";
        i++;
        inBlockComment = true;
        continue;
      }
    }
    return chars.join("");
  }

  private spliceEntry(
    text: string,
    canonicalEntry: string,
    packageName: string,
    lenient: boolean
  ): string | null {
    const navigable = this.blankComments(text);
    const range = this.findPluginArrayRange(navigable);
    const spliced =
      range === null
        ? this.splicePluginKey(text, navigable, canonicalEntry)
        : this.spliceArrayEntry(text, navigable, range, canonicalEntry);
    if (spliced === null) {
      return null;
    }
    const plugins = this.parsePluginArray(spliced, lenient);
    if (plugins === null || !this.hasMatchingEntry(plugins, packageName)) {
      return null;
    }
    return spliced;
  }

  private spliceOutFirstEntry(text: string, packageName: string, lenient: boolean): string | null {
    const navigable = this.blankComments(text);
    const range = this.findPluginArrayRange(navigable);
    if (range === null) {
      return null;
    }
    const innerStart = range.bracketStart + 1;
    const innerEnd = range.bracketEnd;
    const elements = this.arrayElementRanges(navigable, innerStart, innerEnd);
    const target = elements.find(element =>
      PluginNameNormalizer.matches(this.unquote(text.slice(element.start, element.end)), packageName)
    );
    if (!target) {
      return null;
    }
    const span = this.dropAdjacentComma(navigable, elements, target, innerStart, innerEnd);
    const result = text.slice(0, span.start) + text.slice(span.end);
    if (this.parsePluginArray(result, lenient) === null) {
      return null;
    }
    return result;
  }

  private arrayElementRanges(
    navigable: string,
    innerStart: number,
    innerEnd: number
  ): Array<{ start: number; end: number }> {
    const elements: Array<{ start: number; end: number }> = [];
    let inString = false;
    let depth = 0;
    let start = -1;
    for (let i = innerStart; i < innerEnd; i++) {
      const current = navigable[i];
      if (inString) {
        if (current === "\\") {
          i++;
        } else if (current === '"') {
          inString = false;
        }
        continue;
      }
      if (current === '"') {
        inString = true;
        if (start === -1) {
          start = i;
        }
        continue;
      }
      if (current === "[" || current === "{") {
        depth++;
        if (start === -1) {
          start = i;
        }
        continue;
      }
      if (current === "]" || current === "}") {
        depth--;
        continue;
      }
      if (current === "," && depth === 0) {
        if (start !== -1) {
          elements.push({ start, end: i });
        }
        start = -1;
        continue;
      }
      if (!/\s/.test(current) && start === -1) {
        start = i;
      }
    }
    if (start !== -1) {
      elements.push({ start, end: innerEnd });
    }
    return elements;
  }

  private dropAdjacentComma(
    navigable: string,
    elements: Array<{ start: number; end: number }>,
    target: { start: number; end: number },
    innerStart: number,
    innerEnd: number
  ): { start: number; end: number } {
    const index = elements.indexOf(target);
    const next = index + 1 < elements.length ? elements[index + 1] : null;
    if (next) {
      return { start: target.start, end: next.start };
    }
    const previous = index - 1 >= 0 ? elements[index - 1] : null;
    if (previous) {
      let commaEnd = target.start;
      while (commaEnd > previous.end && /\s/.test(navigable[commaEnd - 1])) {
        commaEnd--;
      }
      if (navigable[commaEnd - 1] === ",") {
        return { start: previous.end, end: commaEnd };
      }
    }
    let start = target.start;
    while (start > innerStart && /\s/.test(navigable[start - 1])) {
      start--;
    }
    let end = target.end;
    while (end < innerEnd && /\s/.test(navigable[end])) {
      end++;
    }
    return { start, end };
  }

  private unquote(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  private spliceArrayEntry(
    text: string,
    navigable: string,
    range: PluginArrayRange,
    canonicalEntry: string
  ): string | null {
    const innerStart = range.bracketStart + 1;
    const inner = text.slice(innerStart, range.bracketEnd);
    const firstElementOffset = inner.search(/\S/);
    if (firstElementOffset === -1) {
      return text.slice(0, innerStart) + `"${canonicalEntry}"` + text.slice(range.bracketEnd);
    }
    const insertAt = innerStart + firstElementOffset;
    const leadingWhitespace = inner.slice(0, firstElementOffset);
    return (
      text.slice(0, insertAt) +
      `"${canonicalEntry}",` +
      leadingWhitespace +
      text.slice(insertAt)
    );
  }

  private splicePluginKey(text: string, navigable: string, canonicalEntry: string): string | null {
    const objectStart = this.firstStructuralChar(navigable, "{");
    if (objectStart === -1) {
      return null;
    }
    const rest = text.slice(objectStart + 1);
    const nextContentOffset = rest.search(/\S/);
    if (nextContentOffset === -1) {
      return null;
    }
    const insertAt = objectStart + 1 + nextContentOffset;
    const leadingWhitespace = rest.slice(0, nextContentOffset);
    const isClosingBrace = rest[nextContentOffset] === "}";
    const property = isClosingBrace
      ? `"plugin": ["${canonicalEntry}"]`
      : `"plugin": ["${canonicalEntry}"],`;
    const separator = isClosingBrace ? "" : leadingWhitespace;
    return text.slice(0, insertAt) + property + separator + text.slice(insertAt);
  }

  private findPluginArrayRange(navigable: string): PluginArrayRange | null {
    let searchFrom = 0;
    while (searchFrom < navigable.length) {
      const keyIndex = navigable.indexOf('"plugin"', searchFrom);
      if (keyIndex === -1) {
        return null;
      }
      if (this.precededByStructuralChar(navigable, keyIndex, ["{", ","])) {
        const colonIndex = this.nextOutsideString(navigable, keyIndex + 8, ":");
        if (colonIndex !== -1) {
          const bracketStart = this.nextOutsideString(navigable, colonIndex + 1, "[");
          if (bracketStart !== -1) {
            const bracketEnd = this.matchingBracket(navigable, bracketStart);
            if (bracketEnd !== null) {
              return { bracketStart, bracketEnd };
            }
          }
        }
      }
      searchFrom = keyIndex + 1;
    }
    return null;
  }

  private precededByStructuralChar(text: string, index: number, allowed: string[]): boolean {
    for (let i = index - 1; i >= 0; i--) {
      const current = text[i];
      if (/\s/.test(current)) {
        continue;
      }
      return allowed.includes(current);
    }
    return false;
  }

  private firstStructuralChar(text: string, target: string): number {
    let inString = false;
    for (let i = 0; i < text.length; i++) {
      const current = text[i];
      if (inString) {
        if (current === "\\") {
          i++;
          continue;
        }
        if (current === '"') {
          inString = false;
        }
        continue;
      }
      if (current === '"') {
        inString = true;
        continue;
      }
      if (current === target) {
        return i;
      }
    }
    return -1;
  }

  private nextOutsideString(text: string, from: number, target: string): number {
    let inString = false;
    for (let i = from; i < text.length; i++) {
      const current = text[i];
      if (inString) {
        if (current === "\\") {
          i++;
          continue;
        }
        if (current === '"') {
          inString = false;
        }
        continue;
      }
      if (current === '"') {
        inString = true;
        continue;
      }
      if (current === target) {
        return i;
      }
    }
    return -1;
  }

  private matchingBracket(text: string, bracketStart: number): number | null {
    let depth = 0;
    let inString = false;
    for (let i = bracketStart; i < text.length; i++) {
      const current = text[i];
      if (inString) {
        if (current === "\\") {
          i++;
          continue;
        }
        if (current === '"') {
          inString = false;
        }
        continue;
      }
      if (current === '"') {
        inString = true;
        continue;
      }
      if (current === "[") {
        depth++;
      } else if (current === "]") {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    return null;
  }
}
