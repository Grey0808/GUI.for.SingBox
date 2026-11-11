// Emits an isolated syntax-check fixture. No process or network operations.
import { applyCustomModes } from '../../src/utils/customModes.ts'
const config = {
  log: { disabled: true },
  inbounds: [],
  outbounds: [{ type: 'socks', tag: 'proxy', server: '192.0.2.1', server_port: 1080 }],
  route: { final: 'proxy', rules: [{ action: 'hijack-dns', protocol: 'dns' }] },
  experimental: { cache_file: { enabled: false }, clash_api: {} },
}
const modes = [
  {
    id: 'work',
    name: 'Work',
    icon: '💼',
    outbound: 'proxy-id',
    rules: [{ domain_suffix: ['example.invalid'], network: 'tcp' }],
  },
  { id: 'all', name: 'All traffic', icon: '↗', outbound: 'proxy-id', rules: [] },
  { id: 'missing', name: 'Unavailable target', icon: '!', outbound: 'deleted-id', rules: [] },
]
process.stdout.write(
  JSON.stringify(
    applyCustomModes(config, modes, [{ id: 'proxy-id', tag: 'proxy' }], 'Custom_work'),
    null,
    2,
  ),
)
