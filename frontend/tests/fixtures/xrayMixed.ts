const vless = (tag: string, id: string, transport = false) => ({
  tag,
  protocol: 'vless',
  settings: {
    vnext: [
      {
        address: 'edge.example.invalid',
        port: 443,
        users: [{ id, encryption: 'none', ...(transport ? {} : { flow: 'xtls-rprx-vision' }) }],
      },
    ],
  },
  streamSettings: {
    network: transport ? 'xhttp' : 'tcp',
    security: 'reality',
    realitySettings: {
      serverName: 'www.example.invalid',
      fingerprint: 'chrome',
      publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      shortId: '0123abcd',
    },
    ...(transport
      ? {
          xhttpSettings: {
            path: '/upload',
            mode: 'packet-up',
            extra: {
              xPaddingBytes: [100, 1000],
              sessionIDTable: 'Base62',
              sessionIDLength: '16-32',
              xmux: { maxConcurrency: '4-8', hKeepAlivePeriod: 45 },
            },
          },
        }
      : {}),
  },
})
export const mixedXray = [
  {
    remarks: 'Example subscription',
    routing: {
      rules: [{ balancerTag: 'AUTO', network: 'tcp' }],
      balancers: [{ tag: 'AUTO', selector: ['EU-'], strategy: { type: 'leastLoad' } }],
    },
    outbounds: [
      vless('EU-Vision', '00000000-0000-4000-8000-000000000001'),
      vless('EU-XHTTP', '00000000-0000-4000-8000-000000000002', true),
      { tag: 'direct', protocol: 'freedom' },
      { tag: 'AUTO', protocol: 'loopback', settings: { inboundTag: 'balance' } },
    ],
  },
  {
    outbounds: [
      vless('Duplicate alias', '00000000-0000-4000-8000-000000000001'),
      vless('Other exit same endpoint', '00000000-0000-4000-8000-000000000003'),
      {
        tag: 'HY2',
        protocol: 'hysteria',
        settings: { version: 2, address: 'hy.example.invalid', port: 443 },
        streamSettings: {
          network: 'hysteria',
          security: 'tls',
          tlsSettings: { serverName: 'hy.example.invalid', alpn: ['h3'] },
          hysteriaSettings: { version: 2, auth: 'fixture-password' },
        },
      },
    ],
  },
]
