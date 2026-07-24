import { readdirSync, type Dirent } from 'node:fs';
import path from 'node:path';
import { getErrorMessage, isMissingPathError } from '@trethore/pi-shared/error.js';
import type { ScriptTemplateDiagnostic } from '#src/core/diagnostics.js';
import { getGlobalScriptTemplatesDirectory, getProjectScriptTemplatesDirectory } from '#src/scripts/locations.js';
import type { ScriptScope, TemplateScript } from '#src/scripts/types.js';

const SCRIPT_EXTENSIONS = new Set(['.cjs', '.js', '.mjs']);
const TEMPLATE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

interface DiscoveredTemplateScripts {
  scripts: Map<string, TemplateScript>;
  diagnostics: ScriptTemplateDiagnostic[];
}

export function discoverTemplateScripts(
  cwd: string,
  options: { includeProject?: boolean } = {}
): DiscoveredTemplateScripts {
  const diagnostics: ScriptTemplateDiagnostic[] = [];
  const global = discoverDirectory(getGlobalScriptTemplatesDirectory(), 'global', diagnostics);
  const scripts = new Map(global.scripts);

  if (options.includeProject !== false) {
    const project = discoverDirectory(getProjectScriptTemplatesDirectory(cwd), 'project', diagnostics);
    for (const name of project.duplicateNames) scripts.delete(name);
    for (const [name, script] of project.scripts) scripts.set(name, script);
  }

  return { scripts, diagnostics };
}

interface DiscoveredDirectory {
  scripts: Map<string, TemplateScript>;
  duplicateNames: Set<string>;
}

function discoverDirectory(
  directory: string,
  scope: ScriptScope,
  diagnostics: ScriptTemplateDiagnostic[]
): DiscoveredDirectory {
  const scripts = new Map<string, TemplateScript>();
  const duplicateNames = new Set<string>();

  let entries: Dirent<string>[];
  try {
    entries = readdirSync(directory, { withFileTypes: true, encoding: 'utf8' });
  } catch (error) {
    if (isMissingPathError(error)) return { scripts, duplicateNames };
    diagnostics.push({
      severity: 'warning',
      message: `pi-script-template could not read ${directory}: ${getErrorMessage(error)}`,
    });
    return { scripts, duplicateNames };
  }

  entries = entries
    .filter((entry) => entry.isFile() && SCRIPT_EXTENSIONS.has(path.extname(entry.name)))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const name = path.basename(entry.name, path.extname(entry.name));
    if (!TEMPLATE_NAME_PATTERN.test(name)) {
      diagnostics.push({
        severity: 'warning',
        message: `pi-script-template ignored ${path.join(directory, entry.name)}; template names may contain only letters, digits, underscores, and hyphens.`,
      });
      continue;
    }

    const existing = scripts.get(name);
    if (existing || duplicateNames.has(name)) {
      scripts.delete(name);
      duplicateNames.add(name);
      diagnostics.push({
        severity: 'warning',
        template: name,
        message: `pi-script-template ignored duplicate {{${name}}} script ${entry.name} in ${directory}${existing ? `; it conflicts with ${path.basename(existing.filePath)}` : ''}.`,
      });
      continue;
    }

    scripts.set(name, { name, filePath: path.resolve(directory, entry.name), scope });
  }

  return { scripts, duplicateNames };
}
