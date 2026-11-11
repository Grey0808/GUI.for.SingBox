# Windows GUI acceptance — P0

Status: **native Windows GUI acceptance is NOT completed**. Automated component, store and bridge results do not establish WebView2 layout, native window input, real application relaunch or live TCP behaviour. Record results below; unchecked items remain unverified.

## Safety and environment

1. Use a disposable Windows x64 VM or an idle dedicated test machine with a snapshot. Do **not** run this GUI on the current computer while its original GUI/sing-box VPN is active. Do not copy live profiles, subscriptions, tokens or binaries into the test data directory.
2. Copy the complete acceptance bundle into a new directory. Verify `SHA256SUMS.txt` against its exe using `Get-FileHash -Algorithm SHA256`. Use its supplied `data/user.yaml`: auto-start/restart, auto-proxy/DNS, close-core-on-exit and rolling updates are disabled; request proxy is `none`. Leave them disabled throughout this procedure.
3. The supplied `Start-in-test-VM.cmd` passes the bundle's own `--data-dir`. Do not launch an installed shortcut, invoke a registered URI scheme, use `--restart-from`, enable multiple-instance bypass, elevate privileges, install a service or change autostart.
4. Do not press Start/TUN/system proxy/system DNS, run latency/speed/IP tests or connect to VPN servers. Installation, selection, custom `version`/`check --help`, import and Mode CRUD can be tested with the core stopped. API switching is tested with mocks by the automated suite, separately from the native window.
5. If data paths are unexpected, a core appears running, startup requests elevation, or settings differ from the supplied fixture, stop the procedure. On this host do not attempt to correct the environment by stopping the working VPN or editing its settings. In the disposable VM, discard the snapshot and investigate the test instance only.

Data-directory separation alone is insufficient: Wails 2.17.0 initializes Windows notification COM/AUMID registry entries by **executable basename**, independently of data-dir. Its Windows single-instance mutex/message window uses the application's data-dir-derived ID and sends `WM_COPYDATA` launch arguments to the existing instance; the application then focuses that instance and handles deep links. See [startup audit](docs/windows-startup-audit.md). These are why the test GUI was deliberately not launched on the active-VPN host.

## ZIP contents and clean Windows 11 prerequisites

The VM ZIP is self-contained for these manual fixtures: no Node, Go, pnpm, repository checkout or existing VPN installation is required. Windows PowerShell 5.1 is sufficient. Extract **all** files into a new local VM folder (for example `C:\VM-Acceptance`), not into an installed application or a shared host data folder.

- `GUI.for.SingBox.Custom.Acceptance.exe`: x64 Go/Wails application; frontend HTML/JS/CSS/images/icons and the Go WebView2 loader are embedded. External `frontend/dist` and `WebView2Loader.dll` are not required by this build.
- `prerequisites/MicrosoftEdgeWebView2RuntimeInstallerX64.exe`: Microsoft's complete offline Evergreen installer, with a verified Microsoft Corporation Authenticode signature. On the VM, check installed apps for Microsoft Edge WebView2 Runtime. If missing, run this installer **in the VM only**, then retry the test GUI. Nothing in the launcher automatically installs it. The installer can change the VM's registry/updater; it was not run on the host. See [Microsoft's distribution documentation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).
- `fixtures/cores/official/1.14.4/` and `fixtures/cores/lx/1.14.4-lx.33/`: complete checksum-verified public release folders, including licenses and LX `libcronet.dll`. These are offline custom-path/check fixtures, not active installations. Keep the DLL beside its LX executable. No extra VC++ redistributable was identified in their PE import tables; reported imports are Windows system DLLs/API sets. `DEPENDENCIES.json` records this static audit, not a clean-VM launch result.
- `fixtures/`: ready JSON/YAML/Base64 subscription samples, check-only configs and a built-in PowerShell loopback server. UUID/REALITY values are public dummy test values; no paid subscription or live server is included.
- `data/user.yaml`: fresh safe settings; it contains no host absolute paths, selected custom executable, PID, profiles, subscriptions, plugin credentials or tasks. Runtime arguments use `$APP_DATA_PATH`. It uses the real GUI.for.SingBox Plugin Hub identifier (`gfs`), not the old packaging fixture's invalid `undefined` identifier.

Before first launch, run in the extracted VM folder:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Verify-Package.ps1
```

Expected: all manifest files verified. A missing/modified file is a packaging failure: re-extract a fresh ZIP, do not repair it using files from a working application. `MANIFEST.json` lists sizes/SHA-256 for every payload file except itself; the externally supplied ZIP SHA-256 protects the manifest too. Verification is intended **before** tests modify data/results. `-ExecutionPolicy Bypass` here affects only this child PowerShell process; it does not change machine policy.

GUI launch after dependency/integrity checks: double-click `Start-in-test-VM.cmd`. It sets its working directory and supplies only its adjacent `data` directory via `--data-dir`, irrespective of the extraction location. Application settings/caches stay there. The unchanged Wails default stores its browser profile separately at `%APPDATA%\GUI.for.SingBox.Custom.Acceptance.exe` **inside the VM**, and notifications use the test exe's own basename; neither uses the original GUI.exe's namespace. These native effects are not confined to the extracted folder. The supplied settings keep the core stopped and network automation off. Do not launch the exe directly for the first test. The GUI is a test build, not a signed production release.

GitHub release listing/installation still requires direct internet access from the VM; the ZIP does not emulate GitHub. Public release data needs no user token. Offline fixtures permit custom-path, import, compatibility and check-only tests; mark unavailable live release-list/install cases as blocked, not passed. If WebView2/window automation is unavailable, record that limitation without repeated infrastructure repair attempts.

## 1. First launch and data-directory isolation

1. In the VM, launch `Start-in-test-VM.cmd`. Expected: one window, stopped kernel, no profiles/subscriptions, automation switches disabled. Inspect the test bundle's data directory for app settings/caches; WebView2's browser profile is the separate VM `%APPDATA%\GUI.for.SingBox.Custom.Acceptance.exe` directory described above. No production directory is used.
2. Close using the application's Exit control and reopen using the same launcher. Expected: settings remain, no core starts and no network settings change. Do not terminate processes by image name.
3. Repeat only in a fresh VM snapshot for each layout:

| Layout | Preparation / launch | Expected storage |
| --- | --- | --- |
| Explicit | Supplied launcher / `--data-dir "<bundle>\data"` | Supplied data directory |
| Portable | Separate exe copy, supplied safe `user.yaml` in its adjacent `data`, `--portable` | Adjacent `data` |
| Standard | Exe in a directory with **no adjacent data**; in a fresh VM only, seed safe `user.yaml` under `%LOCALAPPDATA%\GUI.for.SingBox`, launch without data flags | Per-user directory |

Do not overwrite any existing per-user directory. If it already exists, use another disposable snapshot. Preserve separate settings, version directories and subscription caches in each layout.

- [ ] Native first launch/reopen and all three layouts accepted.

## 2. Single-instance and deep links — disposable VM only

1. With the test window open, invoke the **same test exe and identical data-dir** again without a URL. Expected: original test window receives focus, no second lasting instance or core appears.
2. With a second fresh, safely seeded test data directory, open that test copy. Use a **different exe basename** for that second copy (for example `GUI.for.SingBox.Custom.Acceptance.Second.exe`) as well as a different data-dir, to separate the unchanged WebView2/notification namespaces. Expected: independent window/settings and distinct browser profiles. Close both normally. Identical exe basenames with only different data-dir values still share Wails' default browser-profile namespace.
3. For cold/warm deep-link import, use the local fixture URL from section 5. Pass an encoded `sing-box://import-remote-profile?url=<encoded-local-URL>&name=LocalFixture` as a literal argument to the test exe, together with its explicit data-dir. Do **not** open the scheme through the Windows shell. Expected: only that test instance adds the subscription; no URL is sent to an installed app. Updating it uses the local server.

- [ ] Native mutex/IPC, independent directories and cold/warm explicit-argument deep links accepted.

## 3. Managed Official/LX versions, pin and deletion

1. Open Settings → Kernel. Expected: existing Stable/Alpha controls plus Official managed versions, LX and local executable sections. Errors must be readable without a false success message.
2. Install legacy Stable once using its existing installer; leave the core stopped. This gives the initial `main` selection an executable for later rollback. Install managed Official 1.14.4 and another published Official release, and LX 1.14.4-lx.33. Expected: progress/complete status, each version in its own `sing-box/versions/<flavor>/<version>` directory, previous installations retained. LX retains `libcronet.dll` and other release files.
3. Choose installed Official/LX versions with **Use**. Expected: active selection updates; no process starts/restarts. Close/reopen and verify the selection is retained.
4. Pin the selected core. Attempt another selection. Expected: unpin-required error, selection unchanged. Unpin, then switch successfully. Pin an unused installed version from its installed-version dropdown without selecting it as active; try Delete. Expected: refusal; Unpin permits deletion if it is neither selected nor referenced for rollback.
5. Try deleting the configured selection and referenced previous version. Expected: refusal, files preserved. Install a further version never selected/pinned/referenced and delete it. Expected: only that version directory disappears; user YAML, profiles, subscriptions and the other core remain.
6. Start an installation and click Cancel. Expected: cancellation/error shown, busy/progress resets, old installations and selection remain usable. A cancellation racing with completed download must not activate a new version.
7. Network/checksum/archive failures are covered by deterministic mocks. For a manual UI network failure use a VM-only disconnected adapter before refreshing/installing, then restore the VM adapter. Never alter the host's VPN, proxy, firewall or adapter. Expected: error, no working-version loss. Do not edit GitHub metadata or a working binary to simulate corruption.

- [ ] Native release list, install/select, pin/unpin, cancellation, protected deletion and persistence accepted.

## 4. Custom executable and rollback

1. Use the ZIP's `fixtures/cores/official/1.14.4/sing-box.exe` or `fixtures/cores/lx/1.14.4-lx.33/sing-box.exe`, preserving all adjacent files. Record the exe's SHA-256. Enter its **VM absolute path** in Local executable, then Validate and Use. Expected: reported sing-box version, selected custom path; source file and hash unchanged. No copy is placed over a managed/legacy executable. For example, with extraction at `C:\VM-Acceptance`, the LX path is `C:\VM-Acceptance\fixtures\cores\lx\1.14.4-lx.33\sing-box.exe`.
2. Try a relative path, missing `.exe` and a harmless non-sing-box fixture file with an `.exe` suffix. Expected: clear refusal without changing the previous choice. Do not select unknown programs.
3. Pin the custom choice and try Previous core. Expected: unpin-required error. Unpin and use Previous core. Expected: preceding installed selection restored while stopped. The initial legacy Stable from section 3 must still exist; otherwise a missing-previous-file error is correct.
4. Select a managed exe **by its absolute custom path** and try to delete that managed version in its section. Expected: alias protection error. Pin protection and rollback references must also preserve it.
5. Close/reopen with custom selected. Expected: path and pin persist. Actual reattachment to a running custom process and failed live startup are **not part of this no-core manual procedure**; isolated lifecycle/Windows bridge tests cover their components.

- [ ] Native custom validation, immutable source, pin, rollback, alias protection and reopen accepted.

## 5. Local Xray import and metadata

1. In a VM terminal, from the extracted ZIP folder, run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\fixtures\Serve-Subscription.ps1
   ```

   It binds only `127.0.0.1` on an ephemeral port and prints two URLs. Keep the terminal open. It makes no upstream requests, starts no core and contains only anonymized fixtures. No Node installation is needed. At the printed base URL, `/sing-box.json`, `/clash.yaml` and `/base64` serve existing-format samples; `/error` deliberately returns HTTP 503. The original Node helper remains available in the repository for developer tests.
2. Add the printed `/xray.json` URL in Subscriptions as HTTP. Choose Direct/no proxy where needed. Save, then press the subscription's existing Update button. Expected: native import succeeds without a converter plugin or FastAPI; 4 unique nodes from the mixed full-config/AUTO fixture, including VLESS/REALITY/Vision, XHTTP and Hysteria2. Exact duplicates are removed; distinct connections to one endpoint remain separate.
3. Open node details and inspect the **test** cache/source sidecar: connection parameters, original source/name aliases and AUTO membership remain. GUI routing must not acquire Xray routing rules. Metadata retains the fixture title/update interval, support URL, announce and userinfo. Never export a live subscription for comparison.
4. Update twice, close/reopen and update again. Expected: node IDs, names, saved user settings and metadata persist. Update using the printed `/error` URL temporarily: expected HTTP 503 diagnostic and unchanged working node cache. Restore the good fixture URL.
5. Exercise an anonymized existing sing-box JSON subscription; exercise Clash YAML and Base64 with their **existing trusted conversion plugin** if used in the VM. Expected: plugin lifecycle remains intact. Native Xray itself requires no plugin. The automated regression suite covers these formats with mocks; skip a manual plugin case if the trusted plugin cannot safely be installed and record it as unverified.
6. Ctrl+C in **this fixture terminal** closes only the local mock server.

- [ ] Native form/update/list, metadata, exact deduplication, failure recovery and reopen accepted.
- [ ] Existing trusted plugin formats accepted, or explicitly recorded as not tested.

## 6. XHTTP availability without a core start

1. Select managed Official 1.14.4 while stopped. Open subscription nodes and the profile outbound selector. Expected: stored XHTTP node remains visible with a reason; selecting it is disabled. Other protocol nodes remain available.
2. Select LX 1.14.4-lx.33 whose binary reports `with_xhttp` and the TLS feature tags used by the fixture. Expected: XHTTP becomes available without another HTTP update. A future/unknown LX schema remaining disabled is **correct**, even with an XHTTP tag.
3. Return to Official and reopen the app. Expected: disabled state returns; the source/cache still retains all 4 fixture nodes. Generated selectors/routes must not refer to an excluded node; automated full-generator tests and isolated `sing-box check` verify this independently.

- [ ] Native disabled reason/selection protection, reversible availability and reopen accepted.

## 7. Custom Modes — no VPN start

1. Create a test profile in the isolated data directory with a valid target outbound; leave it stopped. Open Manage modes from Home. Add two named/icon modes, target a profile outbound and enter `[{"network":"tcp"}]` as one mode's conditions.
2. Reorder, rename, change an icon and Save. Close/reopen. Expected: order, icon, name, rules and chosen next-start mode persist; Rule/Global/Direct remain. Rename must not change the mode's internal ID.
3. Try invalid JSON, a reserved/duplicate name and a missing target. Expected: readable error, previous saved modes retained. Delete one mode and Save; verify after reopening.
4. Saving definitions must not start/restart a core. New/edited definitions require an explicit future config application; they must not pretend to be loaded by a running core.
5. Mode API behaviour **without a core** is covered by the automated command below, run from a developer checkout's `frontend` directory (Node/pnpm dependencies required; it is not a standalone ZIP tool). It compiles the real ModeManager SFC, switches through an injected mock Clash API and checks readback; ignored PATCH must roll back the editor with an error. No network or process operations are available to that fixture. Native switching while attached remains unverified; do not fabricate a running PID or start a VPN to expose those cards.

   ```powershell
   node --experimental-strip-types --test tests/p0Components.test.mjs tests/customModesKernel.test.mjs
   ```

- [ ] Native editor CRUD/order/icons/persistence and pending-state messaging accepted.
- [ ] Automated mock switching/readback/rejection accepted (already passes in this checkout).

Native switching cards while attached to a real process, WebView2 layout/input/accessibility, real application relaunch, TCP continuity and VPN connectivity remain **unverified**. A data directory does not make live networking safe. They require a separately approved, isolated environment; this procedure never starts a VPN/TUN.

## Automated evidence and recording results

From a developer checkout's `frontend`: `pnpm test`, `pnpm run lint`, `pnpm run build` (includes typecheck). Go: `go test -count=1 ./...` through WSL. The native Windows bridge-test exe uses only temporary directories, localhost fixtures and its own PID; 8 top-level tests pass, including data layouts, file identity and unpacking an independent LX archive with DLLs. The new Vue tests use real SFCs/hooks/stores with inert primitive controls and an in-memory host renderer; they are **not WebView2/browser tests**. A new Pinia store / remounted component verifies saved-state logic, not OS-level app relaunch. See TASKS.md for the current test count/results; the ZIP intentionally does not ship the developer toolchain or bridge-test exe.

Record VM/Windows/WebView2 versions, Git commit, exe SHA-256, data layout, exact actions, expected/actual result and sanitized diagnostic for each unchecked row. Do not capture real subscription keys. Leave failed/blocked/unexecuted scenarios unchecked in this document and in TASKS.md; attach only test-data screenshots/logs. Current release acceptance remains open.

## Check-only configuration validation (optional, VM only)

The check fixtures have no inbounds/TUN, remote rule sets, API bind or enabled cache. They use documentation IPs. They are **not** profiles to run or proof of connectivity. In the extracted VM folder:

```powershell
$bundle = (Get-Location).Path
New-Item -ItemType Directory -Force .\data\check-only | Out-Null
& .\fixtures\cores\official\1.14.4\sing-box.exe check -D "$bundle\data\check-only" -c "$bundle\fixtures\check-only-official.json"
$LASTEXITCODE
& .\fixtures\cores\lx\1.14.4-lx.33\sing-box.exe check -D "$bundle\data\check-only" -c "$bundle\fixtures\check-only-lx.json"
$LASTEXITCODE
```

Expected: exit code 0 for each. Checking `fixtures/invalid-check.json` with either binary must return nonzero and an unknown-outbound-type diagnostic. Repeat the valid check afterward: expected 0 and no modified fixture executable/hash. This tests syntax-error diagnostics/recovery without invoking `run`. Native GUI failure during `check` → `run` rollback remains a separate unexecuted scenario; its deterministic store tests already pass.

## Explicit PASS / FAIL criteria

| ID | PASS requires | FAIL / not accepted |
| --- | --- | --- |
| P01 package/start | All manifest hashes match before launch, safe flags remain off, correct VM data folder, kernel stopped | Missing DLL/runtime/settings, use of host/installed data, unsolicited core/network changes |
| P02 manager | Exact selected version visible, complete independent folders, no process start on Use | Version mismatch, overwrite/loss of earlier installation or DLL |
| P03 pin/delete | Pin blocks switching/deletion as specified; active/rollback/alias files remain unchanged; only a never-used unpinned version can be deleted | False success, removal of protected files or user data |
| P04 custom/rollback | Version/check-help succeeds in place; SHA-256 before/after identical; Previous restores an existing prior selection without starting it | Source copied/modified, wrong selected file, automatic start |
| P05 import | Exactly 4 unique mixed/AUTO nodes, same-endpoint distinct connections retained, metadata/source sidecar present | Converter plugin required for native Xray, lost parameters, imported Xray routing.rules |
| P06 error recovery | HTTP 503/cancellation shows an error, cache and prior executable SHA-256 unchanged, retry succeeds | Working cache/binary replaced after failure, selection falsely changed |
| P07 XHTTP | Official disables stored XHTTP with reason; verified LX .33 restores it without another HTTP update | Destructive removal, missing reason, unsupported node selectable |
| P08 Modes | CRUD/order/icon/rules/ID and next-start choice persist; standard modes remain; no implicit restart | Loss of stored definition/standard modes, false loaded state, automatic restart |
| P09 reopen | Native close/reopen restores selected executable/pins, subscription IDs and Modes | Defaults replace saved settings or a core starts unexpectedly |
| P10 API | Automated mock GET/PATCH/GET confirms mode; ignored/rejected PATCH reports error and restores editor | PATCH status alone treated as success. Native attached-mode switching is still NOT TESTED |

A procedure is PASS only after its native steps were actually executed and evidence recorded. Use FAIL for a reproduced deviation, BLOCKED for missing VM/runtime/network, NOT TESTED for unexecuted steps. Overall release acceptance cannot be PASS while required native items remain untested. Real TCP continuity, TUN and VPN tests are outside this no-VPN procedure.

## Collecting diagnostics — test VM only

1. Use `Start-in-test-VM.cmd` for every run. It captures Go/Wails stdout/stderr to a new `data\diagnostics\gui-<timestamp>.log`. Preserve the log for the failing run; reopening does not overwrite earlier logs. This is not a browser-console capture.
2. On a UI error, immediately take a **test-data-only** screenshot and copy the exact toast/dialog text into `ACCEPTANCE_RESULTS.md`, with step ID and time. Frontend errors may not appear in the Go log. Record whether selected version/highlight actually changed.
3. For a `check` failure, copy its command, exit code and complete console error. Do not change the test fixture into a running configuration. No `data\sing-box\sing-box.log` is expected if no core was started; do not copy a log from an installed application to fill this gap.
4. Copy only the relevant `data\diagnostics\gui-*.log`, screenshot and completed results form into a new VM report folder. Include `SOURCE.txt`, `DEPENDENCIES.json` and `MANIFEST.json`, plus the original ZIP/exe SHA-256, Windows edition/build and installed WebView2 version from VM Installed apps. If the process crashes, export only its corresponding Application Error event from the VM Event Viewer at that time.
5. Do not automatically attach `user.yaml`, complete profiles, subscription caches or source sidecars: they can become sensitive if the procedure was violated. Share only sanitized snippets from these **test** files when necessary. Review logs for Authorization, URL access keys, passwords and connection identifiers before sending them. Never collect host logs or change host settings.
