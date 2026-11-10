# Native Xray subscription import

Add an HTTP(S) subscription through the existing Subscriptions screen and update it. A full Xray JSON object or an array of full configurations is detected before sing-box JSON, Clash YAML and Base64 handling. The native converter runs before the existing subscription plugins and script. Plugins are optional for native Xray imports and retain their lifecycle for existing formats.

Supported native mappings:

- VLESS with `vnext`/`users` or flat settings, TCP/RAW, TLS, REALITY and `xtls-rprx-vision`.
- VLESS XHTTP/splithttp to the LX transport schema, including `extra`, XMUX, session ID fields and explicit string range conversion.
- Xray Hysteria version 2 with Hysteria transport, TLS and transport authentication, emitted as sing-box `hysteria2`.

Balancer selectors use Xray tag-prefix matching. Their concrete proxy outbounds become individual nodes; Xray routing rules and load-balancer behaviour are not imported into GUI routing. Original group membership is retained as source metadata.

Deduplication compares the complete generated connection definition except its display tag. Different credentials, ports, TLS or transport options on the same endpoint remain separate. The first name is retained for exact duplicates; all original names and group memberships remain in the source record. Conflicting display names get deterministic numeric suffixes.

The normal subscription cache contains sing-box outbounds. An adjacent `.xray.json` file preserves the original document, normalized source nodes and name aliases. Treat both files as sensitive subscription data. File subscriptions whose input and cache paths coincide get an application-owned output cache so the source file is preserved.

Unknown fields, unsupported transports, VLESS encryption variants, enabled Xray mux, nonempty REALITY spiderX, XHTTP downloadSettings and incompatible option combinations produce an explicit import error. They are not silently dropped. Account `email` and zero `level` are retained as source metadata; nonzero policy levels and nonempty global `policy`/`transport` configurations are rejected. GUI continues to own inbound, DNS and routing configuration. Vision over XHTTP requires VLESS encryption and is rejected by this converter. Advanced Hysteria QUIC tuning not covered by the mapping is rejected.

XHTTP output targets the field layout inspected in `Leadaxe/sing-box-lx` v1.14.4-lx.33 (`option/v2ray_xhttp.go`); import does not imply that every installed LX build supports those fields. Capability-dependent exclusion and UI for unavailable nodes are tracked separately in TASKS.md. The selected core's configuration check remains the final validation before startup.

Validation: `pnpm test` exercises conversion and the actual subscription store using an in-memory bridge, mock HTTP responses, plugins and scripts. No core process, TUN, DNS or system proxy is used. Runtime connectivity and GUI execution are not verified by these tests.

References: [Xray VLESS](https://xtls.github.io/en/config/outbounds/vless.html), [Xray Hysteria](https://xtls.github.io/config/outbounds/hysteria.html), [LX XHTTP schema](https://github.com/Leadaxe/sing-box-lx/blob/v1.14.4-lx.33/option/v2ray_xhttp.go).
