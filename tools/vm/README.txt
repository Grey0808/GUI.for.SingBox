GUI.for.SingBox Custom - Windows 11 x64 manual acceptance ZIP

Use a fresh disposable Windows 11 x64 VM with a snapshot.
DO NOT LAUNCH THIS GUI OR INSTALL PREREQUISITES ON THE ACTIVE-VPN HOST.
No GUI, core run/TUN session, installer or notification registration was started
during packaging. Core binaries were used only for check-only syntax validation.

1. Extract ALL files to a new VM-local directory, e.g. C:\VM-Acceptance.
2. In that directory verify the unmodified package:
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Verify-Package.ps1
3. If Microsoft Edge WebView2 Runtime is absent in the VM, install the bundled
   prerequisites\MicrosoftEdgeWebView2RuntimeInstallerX64.exe IN THE VM ONLY.
   It is a Microsoft-signed full offline installer. It is never invoked by the
   launcher. Windows system DLLs are supplied by Windows 11 itself.
4. Double-click Start-in-test-VM.cmd. Do not launch the exe directly initially.
   It sets the working directory, uses this package's data folder via --data-dir
   and captures a timestamped startup log in data\diagnostics.
5. Follow MANUAL_TESTING.md in order and fill ACCEPTANCE_RESULTS.md.
   Do not start a kernel/TUN, change proxy/DNS/services/autostart or connect VPNs.

No Node, pnpm, Go, Python or installed original GUI is required for manual steps.
To serve anonymized subscriptions, open another VM terminal in this folder:
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\fixtures\Serve-Subscription.ps1
The printed URL is 127.0.0.1 only; /error returns HTTP 503. Ctrl+C closes only
this fixture listener. No external requests, system changes or kernel launches.

Public GitHub release-list/install UI tests require direct VM internet access.
For offline custom-path/check tests, use complete fixture release directories:
   fixtures\cores\official\1.14.4
   fixtures\cores\lx\1.14.4-lx.33   (keep libcronet.dll beside sing-box.exe)
These are not active installations. Never invoke their run command here.

Safe data/user.yaml: auto-start/restart, auto-proxy/DNS, close-core-on-exit,
rolling updates and multiple-instance bypass OFF; request proxy = none.
No PID, profiles, subscriptions, plugins, tasks or host absolute paths are seeded.
Runtime config paths use $APP_DATA_PATH. Never copy production data into this ZIP.
The unchanged Wails browser profile is separate VM-local storage at
%APPDATA%\GUI.for.SingBox.Custom.Acceptance.exe; notification registry entries
also use the test exe basename, not data-dir. These are not host GUI settings.

MANIFEST.json lists every payload file's size/SHA-256 except itself. Verify before
first launch; test data/results legitimately change afterward. Verify the entire
ZIP against the separately supplied SHA-256 to protect the manifest too.
DEPENDENCIES.json records static PE imports/embedded-resource verification and
the Microsoft installer signature. Static inspection is not a clean-VM launch.
SOURCE.txt records source/binary provenance. LICENSE/THIRD_PARTY.md cover notices.

Native GUI, WebView2 layout, actual close/reopen/IPC/deep links and live TCP/VPN
acceptance remain unverified. Do not mark them passed using automated/mock results.
