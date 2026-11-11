# P0 validation and test build

Implementation includes the Official/LX manager, native Xray URL import, capability-gated XHTTP and custom routing modes. User-facing Windows acceptance remains open: do not use this build to replace a working installation until those scenarios have been verified in a disposable Windows environment.

Use [MANUAL_TESTING.md](../MANUAL_TESTING.md) for the current no-VPN acceptance procedure, expected results and unchecked native scenarios. The [Windows startup audit](windows-startup-audit.md) explains why the native GUI was not started on the active-VPN host. Component tests compile actual Vue SFCs/templates with an inert host and adapted primitive widgets; they do not establish WebView2 layout or native lifecycle behaviour.

Run automated checks from `frontend`:

```
pnpm test
pnpm run lint
pnpm run type-check
pnpm run build
```

Run `go test -count=1 ./...` from the repository using Go in WSL. Tests use temporary directories, their own test-process PID and localhost fixture servers. No installed GUI/core or live subscription is required.

For a reproducible check-only integration pass, export full config fixtures by setting `SING_BOX_CHECK_DIRECTORY` to a newly created isolated directory and running `node --experimental-strip-types --test tests/xhttpGenerator.test.mjs`. Verify the downloaded Windows archives against their GitHub release digests before extracting. Run the corresponding binary with `check -D <isolated-directory> -c <absolute-fixture-file>`. The exported fixtures have no inbounds, TUN, remote rule sets, active cache or API controller, and use documentation IPs. Do not substitute a production profile or invoke `run` for this pass.

To build a separate Windows executable, first build the frontend, create a new directory below `build/bin`, then use Wails 2.17.0 in WSL:

```
wails build -platform windows/amd64 -s -skipbindings -m -nosyncgomod -o <new-directory>/GUI.for.SingBox.Custom.exe
```

Do not pass `-clean` or reuse an existing installation's output filename. Ship a fresh, independent data directory with the test executable and supply its absolute path through `--data-dir`. Keep auto-start, auto-proxy, auto-DNS and kernel auto-restart disabled for UI-only testing. A separate data directory alone does not isolate Windows networking: real starts and live mode/connection tests require an idle VM or dedicated machine.

Manual acceptance checklist for that environment:

1. Install Official and LX releases in the GUI, inspect complete files/DLLs and select each; confirm selected version and `check`/`run` paths in diagnostics.
2. Cancel and fail a download/checksum; verify the working installation and choice remain recoverable. Pin/unpin, rollback, custom executable and protected deletion must show correct errors.
3. Close and reopen with the same test data directory; verify selection, pins, subscription caches/metadata and custom Modes persist. Repeat for fresh standard, portable and explicit data-directory layouts.
4. Import anonymized Xray mixed/AUTO fixtures by HTTP URL; update them, retain distinct same-endpoint connections and exercise existing sing-box/Clash/Base64 formats with their existing plugins.
5. Switch compatible/incompatible binaries; XHTTP nodes must remain stored, disabled with a reason when incompatible and available again without reimport. Confirm selector/routing references remain valid.
6. Create/edit/reorder/delete Modes; explicitly load changed definitions, then switch loaded modes with API readback. Confirm no restart and no forced TCP-session deletion; test API rejection/offline behaviour.
7. In the dedicated environment only, launch an existing anonymized profile and check TCP continuity and real connectivity to an authorized test server. Record separately from JSON syntax and build results.

For upstream updates, keep this published feature branch and integrate a reviewed upstream release by merge, retaining a backup ref. Review data-directory resolution, bridge bindings, runtime arguments, subscription/plugin hook order and generated config schema, then repeat the automated suite and manual checklist. Do not rewrite published history.
