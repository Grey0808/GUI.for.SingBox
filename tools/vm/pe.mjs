// Read PE metadata only. Never load or execute a Windows binary.
export function inspectPE(bytes) {
  if (bytes.toString("ascii", 0, 2) !== "MZ") throw Error("Not a PE executable");
  const pe = bytes.readUInt32LE(60);
  if (bytes.toString("ascii", pe, pe + 4) !== "PE\0\0") throw Error("Invalid PE header");
  const optional = pe + 24;
  const size = bytes.readUInt16LE(pe + 20);
  const is64 = bytes.readUInt16LE(optional) === 0x20b;
  const sections = Array.from({ length: bytes.readUInt16LE(pe + 6) }, (_, i) => {
    const at = optional + size + i * 40;
    return {
      rva: bytes.readUInt32LE(at + 12),
      size: Math.max(bytes.readUInt32LE(at + 8), bytes.readUInt32LE(at + 16)),
      raw: bytes.readUInt32LE(at + 20),
    };
  });
  const offset = (rva) => {
    const section = sections.find(
      (section) => rva >= section.rva && rva < section.rva + section.size,
    );
    if (!section) throw Error("Invalid PE address");
    return section.raw + rva - section.rva;
  };
  const name = (rva) => {
    const start = offset(rva);
    return bytes.toString("ascii", start, bytes.indexOf(0, start));
  };
  const directories = optional + (is64 ? 112 : 96);
  const imports = [];
  const importRva = bytes.readUInt32LE(directories + 8);
  if (importRva) {
    let at = offset(importRva);
    while (bytes.readUInt32LE(at + 12)) {
      imports.push(name(bytes.readUInt32LE(at + 12)));
      at += 20;
    }
  }
  const delayRva = bytes.readUInt32LE(directories + 13 * 8);
  if (delayRva) {
    let at = offset(delayRva);
    while (bytes.readUInt32LE(at + 4)) {
      if (!(bytes.readUInt32LE(at) & 1)) throw Error("Unsupported absolute delay import");
      imports.push(name(bytes.readUInt32LE(at + 4)));
      at += 32;
    }
  }
  return {
    machine: bytes.readUInt16LE(pe + 4).toString(16),
    subsystem: bytes.readUInt16LE(optional + 68),
    imports: [...new Set(imports)].sort(),
  };
}
