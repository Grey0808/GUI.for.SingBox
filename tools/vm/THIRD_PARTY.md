# Included binaries and provenance

- GUI.for.SingBox Custom: GPL-3.0, see root `LICENSE`. Corresponding application source/build instructions: [Grey0808/GUI.for.SingBox](https://github.com/Grey0808/GUI.for.SingBox), branch `codex/sing-box-lx`; exact source and unchanged product baseline are recorded in `SOURCE.txt`. Upstream: [GUI-for-Cores/GUI.for.SingBox](https://github.com/GUI-for-Cores/GUI.for.SingBox).
- Official sing-box 1.14.4: public [SagerNet release/source](https://github.com/SagerNet/sing-box/releases/tag/v1.14.4). Original release license is retained under `fixtures/cores/official/1.14.4/LICENSE`.
- sing-box-lx 1.14.4-lx.33: public [Leadaxe release/source](https://github.com/Leadaxe/sing-box-lx/releases/tag/v1.14.4-lx.33). Original license and complete release contents, including `libcronet.dll`, are retained under `fixtures/cores/lx/1.14.4-lx.33`.
- Microsoft Edge WebView2 Evergreen Standalone Installer x64: downloaded from Microsoft's public `https://go.microsoft.com/fwlink/?linkid=2124701` endpoint; original Microsoft Authenticode-signed file is unmodified. Signature/digest details are in `DEPENDENCIES.json`. It is distributed as a separate prerequisite, not installed or executed by packaging/launcher. Its Microsoft license terms apply; install only inside the disposable VM if needed. [Distribution instructions](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution), [official download page](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

The GUI uses the compiled-in Go loader implementation from go-webview2 v1.0.23 through Wails 2.17.0;
neither a separate WebView2Loader DLL nor a Node/Go runtime is required to run this
application. Windows 11 supplies the native system DLL/API-set dependencies.
No Windows system DLLs were copied from the host into this package. The WebView2
Runtime itself must be present in the VM; a normal Edge browser alone is not the
runtime prerequisite. This is an unsigned application test build, not a signed
or fully accepted VPN release.
