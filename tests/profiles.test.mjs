import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadCredential, saveCredential } from "../src/credentials.mjs";
import { doctor } from "../src/doctor.mjs";
import { install, reconfigureProfile, updateInstallations } from "../src/installer.mjs";
import { addProfile, listProfiles, removeProfile, showProfile, verifyAllProfiles } from "../src/profile-manager.mjs";
import { loadProfiles, setDefaultProfile } from "../src/profiles.mjs";
import { codexConfigPath, profilesPath } from "../src/paths.mjs";
import { FAKE_TOKEN, pathOptionsFor, startMockMcp } from "./helpers.mjs";

const VIP_TOKEN = ["dsk", "test_vip_token"].join("_");
const NEW_TOKEN = ["dsk", "test_rotated_token"].join("_");

test("mesma URL, tokens distintos, subsets distintos e configs Codex/Claude isoladas", async () => {
  const context = await temporaryContext();
  const accepted = {
    [FAKE_TOKEN]: { scopes: ["contacts:read"], toolCount: 1 },
    [VIP_TOKEN]: { scopes: ["contacts:read", "messages:write"], toolCount: 8 },
  };
  const mock = await startMockMcp({ tokenProfiles: accepted });
  try {
    const lucas = await addProfile({ name: "Lucas", url: mock.url, token: FAKE_TOKEN, pathOptions: context.pathOptions });
    const vip = await addProfile({ name: "Vip Stetic", url: mock.url, token: VIP_TOKEN, pathOptions: context.pathOptions });
    assert.equal(lucas.id, "lucas");
    assert.equal(vip.id, "vip-stetic");
    assert.equal((await loadProfiles(context.pathOptions)).default_profile, "lucas");
    for (const client of ["codex", "claude"]) {
      for (const item of [lucas, vip]) {
        await install({ client, scope: "global", profile: item.id, projectRoot: context.projectRoot,
          pathOptions: context.pathOptions });
      }
    }
    const listing = await listProfiles(context.pathOptions);
    assert.equal(listing.profiles.length, 2);
    assert.deepEqual(listing.profiles.map((item) => item.installations.length), [2, 2]);
    assert.deepEqual((await verifyAllProfiles({ pathOptions: context.pathOptions })).map((item) => item.tool_count), [1, 8]);
    const state = await import("../src/state.mjs").then((module) => module.loadState(context.pathOptions));
    const codex = await readFile(state.installations.find((item) => item.client === "codex").config_file, "utf8");
    const claude = await readFile(state.installations.find((item) => item.client === "claude").config_file, "utf8");
    assert.match(codex, /mcp_servers\.deskcomm-lucas/);
    assert.match(codex, /mcp_servers\.deskcomm-vip-stetic/);
    assert.match(claude, /"deskcomm-lucas"/);
    assert.match(claude, /"deskcomm-vip-stetic"/);
    assert.doesNotMatch(codex + claude + JSON.stringify(listing), /dsk_test_/);
    const registry = await readFile(profilesPath(context.pathOptions), "utf8");
    assert.doesNotMatch(registry, /dsk_test_/);
    assert(!profilesPath(context.pathOptions).startsWith(context.projectRoot));
    assert.notEqual((await loadCredential({ profile: "lucas", pathOptions: context.pathOptions })).file,
      (await loadCredential({ profile: "vip-stetic", pathOptions: context.pathOptions })).file);

    delete accepted[VIP_TOKEN];
    const checks = await verifyAllProfiles({ pathOptions: context.pathOptions });
    assert.deepEqual(checks.map((item) => item.ok), [true, false]);
    assert.match(checks[1].error, /401/);
    const diagnosis = await doctor({ client: "codex", scope: "global", profile: "vip-stetic",
      projectRoot: context.projectRoot, pathOptions: context.pathOptions });
    assert.equal(diagnosis.checks.find((item) => item.name === "connection").ok, false);
    assert.doesNotMatch(JSON.stringify(diagnosis.checks), /dsk_test_/);
  } finally { await mock.close(); }
});

test("URLs diferentes, nomes com acento e atualização de URL/token preservam perfis", async () => {
  const context = await temporaryContext();
  const firstServer = await startMockMcp({ tokenProfiles: {
    [FAKE_TOKEN]: { toolCount: 2 }, [NEW_TOKEN]: { toolCount: 4 },
  } });
  const secondServer = await startMockMcp({ tokenProfiles: { [VIP_TOKEN]: { toolCount: 5 } } });
  const thirdServer = await startMockMcp({ tokenProfiles: { [NEW_TOKEN]: { toolCount: 4 } } });
  try {
    const clinic = await addProfile({ name: "Clínica X", url: firstServer.url, token: FAKE_TOKEN, pathOptions: context.pathOptions });
    const vip = await addProfile({ name: "Vip Stetic", url: secondServer.url, token: VIP_TOKEN, pathOptions: context.pathOptions });
    assert.equal(clinic.id, "clinica-x");
    assert.equal((await showProfile("Clínica X", context.pathOptions)).name, "Clínica X");
    assert.notEqual(clinic.url, vip.url);
    await assert.rejects(addProfile({ name: "Clinica X", url: firstServer.url, token: NEW_TOKEN,
      pathOptions: context.pathOptions }), /já existe/);
    await assert.rejects(addProfile({ name: "Duplicado", url: firstServer.url, token: FAKE_TOKEN,
      pathOptions: context.pathOptions }), /Token já está associado/);
    for (const client of ["codex", "claude"]) {
      await install({ client, scope: "global", profile: clinic.id, projectRoot: context.projectRoot, pathOptions: context.pathOptions });
    }
    await setDefaultProfile("Vip Stetic", context.pathOptions);
    assert.equal((await loadProfiles(context.pathOptions)).default_profile, "vip-stetic");
    await reconfigureProfile({ profile: "Clínica X", url: secondServer.url, token: NEW_TOKEN,
      pathOptions: context.pathOptions, fetchImpl: async (...args) => {
        // This server intentionally refuses the new token: no persistent change is allowed.
        return fetch(...args);
      } }).then(() => assert.fail("expected 401"), (error) => assert.match(error.message, /401/));
    assert.equal((await loadCredential({ profile: clinic.id, pathOptions: context.pathOptions })).url, firstServer.url);
    const changed = await reconfigureProfile({ profile: clinic.id, url: thirdServer.url, token: NEW_TOKEN,
      pathOptions: context.pathOptions });
    assert.equal(changed.verification.tool_count, 4);
    const clinicCredential = await loadCredential({ profile: clinic.id, pathOptions: context.pathOptions });
    assert.equal(clinicCredential.token, NEW_TOKEN);
    assert.equal(clinicCredential.url, thirdServer.url);
    const state = await import("../src/state.mjs").then((module) => module.loadState(context.pathOptions));
    const codexConfig = await readFile(state.installations.find((item) => item.client === "codex").config_file, "utf8");
    assert.match(codexConfig, new RegExp(thirdServer.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const updated = await updateInstallations({ pathOptions: context.pathOptions });
    assert.equal(updated.updated, 2);
    assert.equal((await loadProfiles(context.pathOptions)).profiles.length, 2);
    const removed = await removeProfile({ name: "Vip Stetic", pathOptions: context.pathOptions });
    assert.equal(removed.removed_credential, false);
    assert.equal((await loadCredential({ profile: vip.id, pathOptions: context.pathOptions })).token, VIP_TOKEN);
    assert.equal((await loadProfiles(context.pathOptions)).profiles.length, 1);
    assert.equal((await loadProfiles(context.pathOptions)).default_profile, null);
    const cleanup = await removeProfile({ name: "Clínica X", deleteCredential: true, pathOptions: context.pathOptions });
    assert.equal(cleanup.removed_installations, 2);
    await assert.rejects(loadCredential({ profile: clinic.id, pathOptions: context.pathOptions }), /não foi encontrada/);
  } finally { await firstServer.close(); await secondServer.close(); await thirdServer.close(); }
});

test("doctor diagnostica perfil inexistente, catálogo duplicado e configuração órfã", async () => {
  const context = await temporaryContext();
  const mock = await startMockMcp();
  try {
    await addProfile({ name: "Lucas", url: mock.url, token: FAKE_TOKEN, pathOptions: context.pathOptions });
    const missing = await doctor({ client: "codex", scope: "global", profile: "nao-existe",
      projectRoot: context.projectRoot, pathOptions: context.pathOptions });
    assert.equal(missing.checks.find((item) => item.name === "profile_exists").ok, false);
    const orphanConfig = codexConfigPath({ scope: "global", ...context.pathOptions });
    await mkdir(path.dirname(orphanConfig), { recursive: true });
    await writeFile(orphanConfig, '[mcp_servers.deskcomm-lucas]\nurl = "https://example.invalid/api/mcp"\n');
    const orphan = await doctor({ client: "codex", scope: "global", profile: "lucas",
      projectRoot: context.projectRoot, pathOptions: context.pathOptions });
    assert.equal(orphan.checks.find((item) => item.name === "config_managed").ok, false);
    const catalog = await loadProfiles(context.pathOptions);
    await writeFile(profilesPath(context.pathOptions), JSON.stringify({
      ...catalog, profiles: [...catalog.profiles, catalog.profiles[0]],
    }));
    const duplicate = await doctor({ client: "codex", scope: "global", profile: "lucas",
      projectRoot: context.projectRoot, pathOptions: context.pathOptions });
    assert.match(duplicate.checks.find((item) => item.name === "profile_catalog").detail, /duplicado/);
  } finally { await mock.close(); }
});

test("cadastro legado 0.2 é descoberto sem mover ou revelar credenciais", async () => {
  const context = await temporaryContext();
  const mock = await startMockMcp();
  try {
    const saved = await saveCredential({ profile: "default", url: mock.url, token: FAKE_TOKEN,
      pathOptions: context.pathOptions });
    const catalog = await loadProfiles(context.pathOptions);
    assert.equal(catalog.default_profile, "default");
    assert.equal(catalog.profiles[0].credential_ref, "default");
    assert.doesNotMatch(JSON.stringify(catalog), /dsk_test_/);
    await install({ client: "codex", scope: "global", profile: "default",
      projectRoot: context.projectRoot, pathOptions: context.pathOptions });
    assert.equal((await loadCredential({ profile: "default", pathOptions: context.pathOptions })).file, saved.file);
    assert.equal((await loadProfiles(context.pathOptions)).profiles.length, 1);
  } finally { await mock.close(); }
});

test("catálogo recusa campo secreto e não o mostra em profiles list", async () => {
  const context = await temporaryContext();
  const mock = await startMockMcp();
  try {
    await addProfile({ name: "Lucas", url: mock.url, token: FAKE_TOKEN, pathOptions: context.pathOptions });
    const catalog = await loadProfiles(context.pathOptions);
    catalog.profiles[0].token = FAKE_TOKEN;
    await writeFile(profilesPath(context.pathOptions), JSON.stringify(catalog));
    await assert.rejects(listProfiles(context.pathOptions), /campos não permitidos/);
    const diagnosis = await doctor({ client: "codex", scope: "global", profile: "lucas",
      projectRoot: context.projectRoot, pathOptions: context.pathOptions });
    assert.equal(diagnosis.checks.find((item) => item.name === "profile_catalog").ok, false);
    assert.doesNotMatch(JSON.stringify(diagnosis.checks), /dsk_test_/);
  } finally { await mock.close(); }
});

async function temporaryContext() {
  const base = await mkdtemp(path.join(os.tmpdir(), "deskcomm-multiclient-"));
  return {
    projectRoot: path.join(base, "Project Space"),
    pathOptions: pathOptionsFor(path.join(base, "User Home")),
  };
}
