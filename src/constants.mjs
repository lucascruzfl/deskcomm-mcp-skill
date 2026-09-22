export const PACKAGE_NAME = "deskcomm-mcp-skill";
export const VERSION = "0.1.0";
export const SKILL_NAME = "deskcomm-mcp";
export const DEFAULT_PROFILE = "default";
export const MCP_PATH = "/api/mcp";
export const CLIENTS = new Set(["codex", "claude"]);
export const SCOPES = new Set(["project", "global"]);
export const MANAGED_COMMENT = "managed by deskcomm-mcp-skill";

export const ESSENTIAL_TOOL_HINTS = [
  "crm_get_operational_diagnostics",
  "crm_list_pipelines",
  "crm_list_contacts",
];
