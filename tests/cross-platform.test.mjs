import assert from "node:assert/strict";
import test from "node:test";

import { headerHelperCommand } from "../src/config-codex.mjs";
import { claudeConfigPath, codexConfigPath, configRoot, credentialPath, profilesPath, sanitizeProfile, skillInstallPath } from "../src/paths.mjs";
import { normalizeMcpUrl } from "../src/url.mjs";

test("normaliza base e preserva endpoint oficial", () => {
  assert.equal(normalizeMcpUrl("https://crm.exemplo.com/"), "https://crm.exemplo.com/api/mcp");
  assert.equal(normalizeMcpUrl("https://deskcomm.empresa.com/api/mcp"), "https://deskcomm.empresa.com/api/mcp");
  assert.equal(normalizeMcpUrl("https://deskcomm.empresa.com/prefix/api/mcp/"), "https://deskcomm.empresa.com/prefix/api/mcp");
  assert.equal(normalizeMcpUrl("http://localhost:3000"), "http://localhost:3000/api/mcp");
  assert.throws(() => normalizeMcpUrl("http://crm.exemplo.com"), /HTTPS/);
  assert.throws(() => normalizeMcpUrl("https://name:secret@crm.exemplo.com"), /usuário ou senha/);
  assert.throws(() => normalizeMcpUrl("https://crm.exemplo.com/api/mcp?token=hidden"), /query string/);
});

test("nomes com espaços e acentos geram IDs estáveis", () => {
  assert.equal(sanitizeProfile("Vip Stetic"), "vip-stetic");
  assert.equal(sanitizeProfile("Clínica X"), "clinica-x");
  assert.equal(sanitizeProfile("Clínica X"), sanitizeProfile("Clinica X"));
});

for (const platform of ["linux", "darwin", "win32"]) {
  test(`${platform}: paths com espaço e escopo project/global`, () => {
    const home = platform === "win32" ? "C:\\Users\\Maria Silva" : "/Users/Maria Silva";
    const env = platform === "win32"
      ? { USERPROFILE: home, APPDATA: `${home}\\AppData\\Roaming` }
      : { HOME: home };
    const root = configRoot({ platform, env, home });
    assert.match(root, /DeskcommMCP|deskcomm-mcp/);
    assert.match(skillInstallPath({ client: "codex", scope: "project", projectRoot: `${home}/Meu Projeto`, env, home }), /.agents/);
    assert.match(skillInstallPath({ client: "claude", scope: "global", env, home }), /.claude/);
    if (platform === "win32") {
      assert.equal(root, "C:\\Users\\Maria Silva\\AppData\\Roaming\\DeskcommMCP");
      assert.equal(codexConfigPath({ scope: "global", env, platform }), "C:\\Users\\Maria Silva\\.codex\\config.toml");
      assert.equal(claudeConfigPath({ scope: "global", env, platform }), "C:\\Users\\Maria Silva\\.claude.json");
      assert.match(credentialPath({ platform, env }, "default"), /profiles\\default\.json$/);
      assert.equal(profilesPath({ platform, env }), "C:\\Users\\Maria Silva\\AppData\\Roaming\\DeskcommMCP\\profiles.json");
    }
  });
}

test("helper Codex cita paths POSIX e Windows sem inserir segredo", () => {
  const posix = headerHelperCommand({
    nodePath: "/opt/Node JS/node",
    helperPath: "/home/a b/helper.mjs",
    credentialFile: "/home/a b/profile.json",
    platform: "linux",
  });
  const windows = headerHelperCommand({
    nodePath: "C:\\Program Files\\node.exe",
    helperPath: "C:\\Users\\A B\\helper.mjs",
    credentialFile: "C:\\Users\\A B\\profile.json",
    platform: "win32",
  });
  assert.match(posix, /'\/opt\/Node JS\/node'/);
  assert.match(windows, /^"C:\\Program Files/);
  assert.doesNotMatch(`${posix}${windows}`, /dsk_/);
});
