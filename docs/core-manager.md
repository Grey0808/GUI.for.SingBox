# Core manager (Windows AMD64)

In **Settings → Kernel**, the managed Official and sing-box-lx sections list available GitHub releases and installed versions. Choose a release, install it, then select the installed version with **Use**. Refreshing or installing never switches the selected executable or restarts the core. Use the normal explicit Stop/Start controls when you intend to change cores; selection and deletion refuse running or transitional states.

Each installation keeps the complete release directory, including DLLs and support files:

```
<data-directory>/sing-box/versions/official/<version>/sing-box.exe
<data-directory>/sing-box/versions/lx/<version>/sing-box.exe
```

The existing Stable/Alpha installations and their runtime arguments remain available. Managed Official, LX and custom executables use the stable runtime arguments/environment. Before launch, the selected executable runs `check` against the same generated configuration and environment used for `run`. A check failure prevents process launch and reports diagnostics.

The bridge resolves all `data/...` paths through v1.29.0's data directory: the normal per-user directory, `--portable`, or `--data-dir`. No core-manager migration moves existing user data. Configuration, subscriptions, plugin files and caches are separate from managed version directories.

Downloads come from SagerNet/sing-box or Leadaxe/sing-box-lx. Installation requires an exact published SHA-256 digest or an unambiguous SHA256SUMS entry; it refuses unverifiable releases. The executable must report the selected version before its complete directory is moved from staging into a new, previously absent version directory. Download, checksum, archive, cancellation and rename failures leave previous installations intact. There is no overwrite/update-in-place for managed versions: install the newer release separately and explicitly select it.

**Pin** protects an installed version from deletion. Pinning the currently selected executable also prevents switching until **Unpin** is used. Pinning legacy Stable/Alpha blocks its updater and rollback; pinned custom aliases of those files are protected too. Pin does not prevent an external program or the owner of a custom file from changing it. Selection, pins and rollback choices persist in the existing user settings. During an installation/removal operation, selection, startup and pin changes wait for that operation to finish or be cancelled.

**Previous core** selects the saved preceding choice while stopped. A failed configuration check/start restores the pending previous selection without automatically starting it. A successful start retains the preceding choice for explicit rollback. Referenced rollback versions are protected from deletion.

**Delete** removes only the selected managed version directory. It refuses the configured active version, pending and saved rollback versions, pins and versions referenced through selected/pinned custom-path aliases. It never deletes a custom source file, legacy installation or user configuration. Deletion is conservatively disabled while any core is running or changing state.

For a **local executable**, enter an absolute Windows `.exe` path, then validate or use it. Validation reads the file's hash before and after `version`, checks that `check --help` exists and preserves the original file in place. It does not copy or modify the executable. Capabilities and XHTTP availability are refreshed from the same selected file; an unknown version or missing build tags do not establish XHTTP support. See [XHTTP compatibility](xhttp-compatibility.md). On reconnect, saved process identity is checked against the actual executable, including renamed custom files. An unverified PID blocks automatic startup and process stop, with a diagnostic requiring manual verification.

Automated verification covers actual installer hooks, settings YAML save/reload and migration, selection/pin/delete races, custom-path inspection, kernel store `check` → mock `run`, PID identity and rollback; Go tests use temporary files and localhost HTTP fixtures. Complete generated configurations are separately checked by downloaded, checksum-verified Official and LX Windows binaries. GUI installation/cancellation/relaunch and real VPN connectivity require manual testing on an idle machine or isolated Windows VM; they are not established by a successful build.
