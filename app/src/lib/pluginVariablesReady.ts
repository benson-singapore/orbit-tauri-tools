import type { Plugin } from "@/types";

export function isPluginVariablesReady(
  plugin: Pick<Plugin, "variablesReady" | "variablesSchema">,
): boolean {
  if (plugin.variablesReady === true) return true;
  if (plugin.variablesReady === false) return false;
  const schema = plugin.variablesSchema;
  if (!schema || Object.keys(schema).length === 0) return true;
  return !Object.values(schema).some(def => def.required);
}

/** Plugin is installed but required user variables are not configured yet. */
export function pluginNeedsVariablesConfiguration(
  plugin: Pick<Plugin, "variablesReady" | "variablesSchema">,
): boolean {
  const schema = plugin.variablesSchema;
  if (!schema || !Object.values(schema).some(def => def.required)) {
    return false;
  }
  return !isPluginVariablesReady(plugin);
}
