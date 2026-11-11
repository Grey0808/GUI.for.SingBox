import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFile, readdir, lstat } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectPE } from "./pe.mjs";
const { parse } = createRequire(new URL("../../frontend/package.json", import.meta.url))("yaml");

export function validateSafeSettings(settings) {
  for (const flag of [
    "autoStartKernel",
    "autoRestartKernel",
    "autoSetSystemProxy",
    "autoSetSystemDNS",
    "closeKernelOnExit",
    "rollingRelease",
    "multipleInstance",
  ])
    assert.equal(settings[flag], false, flag);
  assert.equal(settings.requestProxyMode, "none");
  assert.equal(settings.githubApiToken, "");
  assert.equal(settings.kernel.branch, "main");
  assert.equal(settings.kernel.profile, "");
  for (const key of [
    "customPath",
    "previousKernelSelection",
    "lastWorkingSelection",
    "pinnedCores",
  ])
    assert.ok(!settings.kernel[key], key);
  for (const key of ["main", "alpha"]) {
    assert.deepEqual(settings.kernel[key].env, {});
    assert.deepEqual(settings.kernel[key].args, [
      "run",
      "--disable-color",
      "-c",
      "$APP_DATA_PATH/sing-box/config.json",
      "-D",
      "$APP_DATA_PATH/sing-box",
    ]);
  }
  assert.deepEqual(settings.pluginSettings, {});
  assert.ok(settings.plugins.sources.every((source) => !source.url.includes("undefined")));
  const walk = (value) => {
    if (typeof value === "string")
      assert.ok(!/^[a-z]:[\\/]|^\\\\/i.test(value), "Host absolute path in settings");
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(settings);
}

export async function inventory(root) {
  const result = [];
  async function walk(directory) {
    for (const entry of await readdir(directory)) {
      const path = join(directory, entry),
        stat = await lstat(path);
      assert.ok(!stat.isSymbolicLink(), `Linked bundle path: ${path}`);
      if (stat.isDirectory()) await walk(path);
      else {
        const bytes = await readFile(path);
        result.push({
          path: relative(root, path).replaceAll("\\", "/"),
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  }
  await walk(root);
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export async function verifyBundle(root, checkManifest = true) {
  root = resolve(root);
  validateSafeSettings(parse(await readFile(join(root, "data/user.yaml"), "utf8")));
  const files = await inventory(root);
  assert.deepEqual(
    files.filter((file) => file.path.startsWith("data/")).map((file) => file.path),
    ["data/user.yaml"],
  );
  for (const path of [
    "GUI.for.SingBox.Custom.Acceptance.exe",
    "Start-in-test-VM.cmd",
    "Verify-Package.ps1",
    "MANUAL_TESTING.md",
    "README.txt",
    "LICENSE",
    "THIRD_PARTY.md",
    "ACCEPTANCE_RESULTS.md",
    "DEPENDENCIES.json",
    "prerequisites/MicrosoftEdgeWebView2RuntimeInstallerX64.exe",
    "fixtures/Serve-Subscription.ps1",
    "fixtures/xray-mixed.json",
    "fixtures/sing-box-existing.json",
    "fixtures/check-only-official.json",
    "fixtures/check-only-lx.json",
    "fixtures/cores/official/1.14.4/sing-box.exe",
    "fixtures/cores/official/1.14.4/LICENSE",
    "fixtures/cores/lx/1.14.4-lx.33/sing-box.exe",
    "fixtures/cores/lx/1.14.4-lx.33/libcronet.dll",
    "fixtures/cores/lx/1.14.4-lx.33/LICENSE",
  ])
    assert.ok(
      files.some((file) => file.path === path),
      `Missing ${path}`,
    );
  const launcher = await readFile(join(root, "Start-in-test-VM.cmd"), "utf8");
  assert.ok(
    launcher.includes('--data-dir "%VM_DATA_DIR%"') && launcher.includes("VM_DATA_DIR=%~dp0data"),
  );
  assert.ok(!/restart-from|reg\.exe|netsh|sc\.exe|schtasks|taskkill/i.test(launcher));
  const system =
    /^(?:kernel32|advapi32|dbghelp|ws2_32|shell32|iphlpapi|winmm|shlwapi|ole32|winhttp|user32|secur32|crypt32|ntdll)\.dll$|^api-ms-win-/i;
  for (const file of files.filter(
    (file) => /\.(?:exe|dll)$/i.test(file.path) && !file.path.startsWith("prerequisites/"),
  )) {
    const pe = inspectPE(await readFile(join(root, file.path)));
    assert.equal(pe.machine, "8664", file.path);
    assert.ok(
      pe.imports.every((name) => system.test(name)),
      `Unbundled non-system dependency in ${file.path}`,
    );
  }
  for (const name of ["check-only-official.json", "check-only-lx.json"]) {
    const config = JSON.parse(await readFile(join(root, "fixtures", name), "utf8"));
    assert.deepEqual(config.inbounds, []);
    assert.deepEqual(config.route.rule_set, []);
    assert.equal(config.route.auto_detect_interface, false);
    assert.equal(config.experimental.cache_file.enabled, false);
    assert.ok(!config.experimental.clash_api.external_controller);
  }
  if (checkManifest) {
    const manifest = JSON.parse(await readFile(join(root, "MANIFEST.json"), "utf8"));
    assert.deepEqual(
      files.filter((file) => file.path !== "MANIFEST.json"),
      manifest.files,
      "Bundle differs from manifest",
    );
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = await verifyBundle(process.argv[2], !process.argv.includes("--before-manifest"));
  process.stdout.write(
    `Verified ${files.length} bundle files without executing any packaged program.\n`,
  );
}
