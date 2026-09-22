import assert from "node:assert/strict";
import test from "node:test";

import { headerHelperCommand } from "../src/config-codex.mjs";
import { configRoot, skillInstallPath } from "../src/paths.mjs";
import { normalizeMcpUrl } from "../src/url.mjs";

test("normaliza base e preserva endpoint oficial", () => {
  assert.equal(normalizeMcpUrl("https://crm.exemplo.com/"), "https://crm.exemplo.com/api/mcp");
  assert.equal(normalizeMcpUrl("https://deskcomm.empresa.com/api/mcp"), "https://deskcomm.empresa.com/api/mcp");
  assert.throws(() => normalizeMcpUrl("http://crm.exemplo.com"), /HTTPS/);
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
