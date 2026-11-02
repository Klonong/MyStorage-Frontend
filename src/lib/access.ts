// Roles, permissions and site scopes from the PRD's users-and-roles table.
// ponytail: checked in the browser for the demo; the API repeats every check once it exists (PRD: role and site checks on every endpoint).

export type Role = "admin" | "manager" | "supervisor" | "dispatcher" | "receiver" | "picker" | "operator";

/** admin: users, integrations · approve: stock adjustments and alert rules · release: waves, counts, transfers, fleet · gate: trucks and docks · scan: handheld work. */
export type Permission = "admin" | "approve" | "release" | "gate" | "scan";

export const roles: Record<Role, { name: string; worksOn: string; can: string; grants: Permission[] }> = {
  admin: { name: "Admin", worksOn: "Whole system", can: "Manage sites, users, roles, integrations", grants: ["admin", "approve", "release", "gate", "scan"] },
  manager: { name: "Operations manager", worksOn: "One or more sites", can: "Approve stock adjustments, reassign docks and tasks", grants: ["approve", "release", "gate", "scan"] },
  supervisor: { name: "Shift supervisor", worksOn: "One site, one shift", can: "Release waves, assign tasks, resolve exceptions", grants: ["release", "gate", "scan"] },
  dispatcher: { name: "Yard dispatcher", worksOn: "Gate and yard", can: "Check trucks in and out, assign bays", grants: ["gate"] },
  receiver: { name: "Receiver / loader", worksOn: "Dock bays", can: "Scan, confirm counts, report damage", grants: ["scan"] },
  picker: { name: "Picker", worksOn: "Aisles", can: "Scan picks, report short picks", grants: ["scan"] },
  operator: { name: "Forklift operator", worksOn: "A forklift", can: "Accept and complete move tasks", grants: ["scan"] },
};

export const permissionNames: Record<Permission, string> = {
  admin: "manage users and integrations",
  approve: "approve stock adjustments and alert rules",
  release: "release waves and plan stock work",
  gate: "run the gate and docks",
  scan: "scan on the floor",
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Site ids the user may change; empty means every site. */
  sites: string[];
}

export const seedUsers: User[] = [
  { id: "u-1", name: "Dana Okafor", email: "dana@mystorage.example", role: "admin", sites: [] },
  { id: "u-2", name: "Alex Chen", email: "alex@mystorage.example", role: "manager", sites: [] },
  { id: "u-3", name: "Maya Ruiz", email: "maya@mystorage.example", role: "supervisor", sites: ["wh-01"] },
  { id: "u-4", name: "Ken Ito", email: "ken@mystorage.example", role: "dispatcher", sites: ["wh-01"] },
  { id: "u-5", name: "Rina Putri", email: "rina@mystorage.example", role: "receiver", sites: ["wh-01"] },
  { id: "u-6", name: "Joel Kim", email: "joel@mystorage.example", role: "picker", sites: ["wh-02"] },
  { id: "u-7", name: "Sam Hadded", email: "sam@mystorage.example", role: "operator", sites: ["wh-01"] },
];

/** Why the user may not do this at the site, or null when they may. */
export function denied(user: User | undefined, perm: Permission, siteId: string, siteCode: string): string | null {
  if (!user) return "Sign in first";
  if (!roles[user.role].grants.includes(perm)) return `${roles[user.role].name}s can't ${permissionNames[perm]}`;
  if (user.sites.length && !user.sites.includes(siteId)) return `${user.name} has no access to ${siteCode}`;
  return null;
}

export const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
