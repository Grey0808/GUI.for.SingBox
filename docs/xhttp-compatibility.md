# XHTTP availability

Availability is derived from the selected binary, not stored as a destructive subscription filter. The application reads its SHA-256 and `version` output and verifies that the file did not change during detection. Detection failures remain unknown and do not enable XHTTP.

The verified profile is currently sing-box-lx **1.14.4-lx.33** with `with_xhttp`. Other versions remain unavailable until a schema profile is verified. A build tag alone does not establish support for every transport option. HTTP/3 additionally requires `with_quic`; REALITY requires `with_utls`. The file hash identifies the inspected file; it is not a signature or proof that arbitrary custom builds match a published release.

Unavailable nodes stay in subscription storage. Their reason appears in subscription details and profile outbound selection; selection is disabled. Runtime selection handlers also reject unavailable saved nodes before touching Clash API or connections. Switching the selected core refreshes availability; compatible nodes return without importing the subscription again.

The final generated configuration excludes unavailable XHTTP nodes, including nodes injected by scripts/plugins. Empty selector/urltest groups are removed recursively. Group defaults, nested route rules, final outbound and outbound detours in DNS/HTTP clients are repaired using a remaining concrete proxy. If no safe proxy exists, generation fails before writing a new config. It does not silently add a direct route. Explicitly configured direct members remain explicit user choices. Original subscription/profile data is preserved so the compatible configuration can be regenerated later.

The upstream selector implementation ignores a cached selection that is not in its current outbound set and uses the configured default or first member. This prevents a removed XHTTP tag from remaining the active cached choice after startup.

Checks use mock binary reports, an in-memory subscription store and the actual config generator. A separate LX .33 copy passed `check` for a fixture without inbounds, TUN or remote rule sets. No active VPN process or configuration was used; GUI/live kernel switching is not covered by this verification.
