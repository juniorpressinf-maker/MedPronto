import { networkInterfaces } from "node:os";

export type LocalIPv4 = {
  iface: string;
  address: string;
  netmask: string;
};

export function localIPv4s(): LocalIPv4[] {
  const out: LocalIPv4[] = [];
  const ifaces = networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) {
        out.push({
          iface: name,
          address: a.address,
          netmask: a.netmask,
        });
      }
    }
  }
  return out;
}
