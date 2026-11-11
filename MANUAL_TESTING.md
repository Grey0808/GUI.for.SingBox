# Windows GUI acceptance — P0

Status: **native Windows GUI acceptance is NOT completed**. Automated component, store and bridge results do not establish WebView2 layout, native window input, real application relaunch or live TCP behaviour. Record results below; unchecked items remain unverified.

## Safety and environment

1. Use a disposable Windows x64 VM or an idle dedicated test machine with a snapshot. Do **not** run this GUI on the current computer while its original GUI/sing-box VPN is active. Do not copy live profiles, subscriptions, tokens or binaries into the test data directory.
2. Copy the complete acceptance bundle into a new directory. Verify `SHA256SUMS.txt` against its exe using `Get-FileHash -Algorithm SHA256`. Use its supplied `data/user.yaml`: auto-start/restart, auto-proxy/DNS, close-core-on-exit and rolling updates are disabled; request proxy is `none`. Leave them disabled throughout this procedure.
3. The supplied `Start-in-test-VM.cmd` passes the bundle's own `--data-dir`. Do not launch an installed shortcut, invoke a registered URI scheme, use `--restart-from`, enable multiple-instance bypass, elevate privileges, install a service or change autostart.
4. Do not press Start/TUN/system proxy/system DNS, run latency/speed/IP tests or connect to VPN servers. Installation, selection, custom `version`/`check --help`, import and Mode CRUD can be tested with the core stopped. API switching is tested with mocks by the automated suite, separately from the native window.
5. If data paths are unexpected, a core appears running, startup requests elevation, or settings differ from the supplied fixture, stop the procedure. On this host do not attempt to correct the environment by stopping the working VPN or editing its settings. In the disposable VM, discard the snapshot and investigate the test instance only.

Data-directory separation alone is insufficient: Wails 2.17.0 initializes Windows notification COM/AUMID registry entries by **executable basename**, independently of data-dir. Its Windows single-instance mutex/message window uses the application's data-dir-derived ID and sends `WM_COPYDATA` launch arguments to the existing instance; the application then focuses that instance and handles deep links. See [startup audit](docs/windows-startup-audit.md). These are why the test GUI was deliberately not launched on the active-VPN host.

Prerequisites for the fixture tools: Node 22+ with `--experimental-strip-types`, the repository's `frontend` directory and its tests. GUI operation additionally requires Windows WebView2. Do not spend repeated attempts repairing inaccessible WebView2 automation; record the exact limitation and continue the automated component/bridge suite.

## 1. First launch and data-directory isolation

1. In the VM, launch `Start-in-test-VM.cmd`. Expected: one window, stopped kernel, no profiles/subscriptions, automation switches disabled. Inspect the test bundle's data directory; all new files belong there.
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
2. With a second fresh, safely seeded test data directory, open that test copy. Expected: independent window/settings; neither window modifies the other's files. Close both normally.
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

1. Extract a checksum-verified public release into a new VM fixture folder, preserving support files. Record the exe's SHA-256. Enter its absolute path in Local executable, then Validate and Use. Expected: reported sing-box version, selected custom path; source file and hash unchanged. No copy is placed over a managed/legacy executable.
2. Try a relative path, missing `.exe` and a harmless non-sing-box fixture file with an `.exe` suffix. Expected: clear refusal without changing the previous choice. Do not select unknown programs.
3. Pin the custom choice and try Previous core. Expected: unpin-required error. Unpin and use Previous core. Expected: preceding installed selection restored while stopped. The initial legacy Stable from section 3 must still exist; otherwise a missing-previous-file error is correct.
4. Select a managed exe **by its absolute custom path** and try to delete that managed version in its section. Expected: alias protection error. Pin protection and rollback references must also preserve it.
5. Close/reopen with custom selected. Expected: path and pin persist. Actual reattachment to a running custom process and failed live startup are **not part of this no-core manual procedure**; isolated lifecycle/Windows bridge tests cover their components.

- [ ] Native custom validation, immutable source, pin, rollback, alias protection and reopen accepted.

## 5. Local Xray import and metadata

1. In a VM terminal, from `frontend`, run:

   ```powershell
   node --experimental-strip-types tests/fixtures/serveAcceptance.mjs
   ```

   It binds only `127.0.0.1` on an ephemeral port and prints two URLs. Keep the terminal open. It makes no upstream requests, starts no core and contains only anonymized fixtures.
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
5. Verify mode API behaviour **without a core** using the automated command below. It compiles the real ModeManager SFC, switches through an injected mock Clash API and checks readback; ignored PATCH must roll back the editor with an error. No network or process operations are available to that fixture.

   ```powershell
   node --experimental-strip-types --test tests/p0Components.test.mjs tests/customModesKernel.test.mjs
   ```

- [ ] Native editor CRUD/order/icons/persistence and pending-state messaging accepted.
- [ ] Automated mock switching/readback/rejection accepted (already passes in this checkout).

Native switching cards while attached to a real process, WebView2 layout/input/accessibility, real application relaunch, TCP continuity and VPN connectivity remain **unverified**. A data directory does not make live networking safe. They require a separately approved, isolated environment; this procedure never starts a VPN/TUN.

## Automated evidence and recording results

From `frontend`: `pnpm test` (52 tests), `pnpm run lint`, `pnpm run build` (includes typecheck). Go: `go test -count=1 ./...` through WSL. The native Windows bridge-test exe uses only temporary directories, localhost fixtures and its own PID; 8 top-level tests pass, including data layouts, file identity and unpacking an independent LX archive with DLLs. The new Vue tests use real SFCs/hooks/stores with inert primitive controls and an in-memory host renderer; they are **not WebView2/browser tests**. A new Pinia store / remounted component verifies saved-state logic, not OS-level app relaunch.

Record VM/Windows/WebView2 versions, Git commit, exe SHA-256, data layout, exact actions, expected/actual result and sanitized diagnostic for each unchecked row. Do not capture real subscription keys. Leave failed/blocked/unexecuted scenarios unchecked in this document and in TASKS.md; attach only test-data screenshots/logs. Current release acceptance remains open.
