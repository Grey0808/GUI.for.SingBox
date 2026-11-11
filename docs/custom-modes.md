# Custom routing modes

Open **Manage modes** on the Home page for the selected profile. It is available both before startup and next to the mode cards while the core is running. Add, rename, edit, reorder or delete modes; each has an icon/emoji, target profile outbound and optional JSON routing conditions. Standard Rule, Global and Direct remain available.

An empty conditions array (`[]`) routes all traffic in that mode to its target. Otherwise each array entry is one matching rule, with normal GUI routing for traffic that does not match. Example:

```json
[
  { "domain_suffix": ["example.invalid"], "network": "tcp" },
  { "port": [80, 443] }
]
```

Supported conditions are domain, domain_suffix, domain_keyword, domain_regex, ip_cidr, port, network, protocol, process_name and process_path. The editor rejects routing actions or outbound references inside conditions: the target is selected separately. Core syntax validation remains required for values such as regular expressions and CIDRs.

Modes and order are stored with their profile. Internal API names use a stable `Custom_<id>` key, so renaming the display name or icon does not create a different core mode. Do not manually reuse this internal namespace in scripts or mixins.

Saving the editor does **not** restart the core or TUN. New or changed routing definitions take effect on the next explicit start/reconfiguration. A loaded mode whose rules differ from the saved definition is shown as pending; attempting to switch to it reports that a new configuration must first be applied. The mode chosen for the next explicit start is restored through API readback after startup. Attaching the GUI to an already running core does not automatically change its mode.

Switching a loaded mode reads `/configs`, checks `mode-list`, sends PATCH and reads the actual mode again. HTTP 204 alone is not success: the core can silently ignore unknown mode names. The GUI persists only the verified result. API failures are displayed; if current state cannot be refreshed, the active-mode highlight is cleared. Switching does not invoke process restart, TUN operations or connection-deletion endpoints.

Generated mode rules follow initial sniff/DNS-hijack/resolve rules and precede ordinary routing. Standard modes already declared by the profile retain their rules. Missing standard registrations are added with valid targets. Custom conditions cannot change DNS/TUN/core configuration. Rules are regenerated after plugins and before-start callbacks to ensure valid references in the final output.

If a target is deleted or excluded by compatibility filtering, the mode becomes unavailable. Its generated rule rejects traffic rather than referencing a missing outbound or silently choosing direct routing; the generated default falls back to Rule. Even if an older core cache restores that custom key, its reject rule remains safe. Deleting a running active custom mode switches to verified Rule as part of saving, without restarting. A failure rolls back the saved editor changes and is reported.

Verification uses pure generation tests, actual profile and kernel stores with mocked bridge/API, and an isolated `sing-box check` fixture. The active GUI, core, TUN, DNS and system proxy are never used by these tests. Interactive Windows UI and live network behaviour are not part of this verification.
