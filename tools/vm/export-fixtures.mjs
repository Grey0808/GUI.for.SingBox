import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { mixedXray } from "../../frontend/tests/fixtures/xrayMixed.ts";
import { applyCustomModes } from "../../frontend/src/utils/customModes.ts";

const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
const write = (name, value) => writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n");
await write("xray-mixed.json", mixedXray);
await write("sing-box-existing.json", {
  outbounds: [
    { type: "socks", tag: "Existing SOCKS fixture", server: "192.0.2.2", server_port: 1080 },
  ],
});
await write("invalid-check.json", {
  outbounds: [{ type: "__fixture_invalid__", tag: "Deliberately invalid" }],
});
await writeFile(
  join(output, "clash.yaml"),
  "proxies:\n  - name: Existing Clash fixture\n    type: socks5\n    server: 192.0.2.2\n    port: 1080\n",
);
await writeFile(
  join(output, "base64.txt"),
  Buffer.from("socks5://192.0.2.2:1080#ExistingBase64Fixture").toString("base64") + "\n",
);
for (const lx of [false, true]) {
  const config = applyCustomModes(
    {
      log: { disabled: true },
      inbounds: [],
      outbounds: [
        { type: "selector", tag: "Fixture", outbounds: lx ? ["XHTTP", "Direct"] : ["Direct"] },
        { type: "direct", tag: "Direct" },
        ...(lx
          ? [
              {
                type: "vless",
                tag: "XHTTP",
                server: "192.0.2.1",
                server_port: 443,
                uuid: "00000000-0000-4000-8000-000000000001",
                transport: { type: "xhttp", path: "/" },
              },
            ]
          : []),
      ],
      route: { final: "Fixture", auto_detect_interface: false, rules: [], rule_set: [] },
      dns: { servers: [], rules: [] },
      experimental: { clash_api: {}, cache_file: { enabled: false } },
    },
    [
      {
        id: "vm-work",
        name: "VM work",
        icon: "⚙",
        outbound: "fixture",
        rules: [{ network: "tcp" }],
      },
    ],
    [{ id: "fixture", tag: "Fixture" }],
    "Rule",
  );
  await write(lx ? "check-only-lx.json" : "check-only-official.json", config);
}
