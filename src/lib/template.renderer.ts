import type { Client } from "../types/database";

const VARIABLE_REGEX = /\{(\w+)\}/g;

/**
 * Replaces {variable} placeholders in a template body with actual client data.
 *
 * Supported variables:
 *   {client_name}    → client.name
 *   {business_name}  → client.business_name
 *   {month}          → current month in English (e.g. "April")
 *   {custom_1..3}    → empty string (reserved for future use)
 */
export function renderTemplate(body: string, client: Client): string {
  const month = new Date().toLocaleString("en-US", { month: "long" });

  const variables: Record<string, string> = {
    client_name: client.name,
    business_name: client.business_name,
    month,
    custom_1: "",
    custom_2: "",
    custom_3: "",
  };

  return body.replace(VARIABLE_REGEX, (_match, key: string) => {
    return key in variables ? variables[key] : _match;
  });
}

/**
 * Extracts all {variable} placeholder names from a template body.
 * Used to auto-populate the `variables` array when saving a template.
 */
export function extractVariables(body: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;

  const regex = new RegExp(VARIABLE_REGEX.source, "g");
  while ((match = regex.exec(body)) !== null) {
    found.add(match[1]);
  }

  return Array.from(found);
}
