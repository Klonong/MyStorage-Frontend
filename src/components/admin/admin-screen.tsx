"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/base/app-shell";
import { Panel } from "@/components/operations/panel";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDenied, useWarehouse } from "@/hooks/useWarehouse";
import { permissionNames, roles, type Role, type User } from "@/lib/access";
import { cn } from "@/lib/utils";

const roleItems = Object.fromEntries(Object.entries(roles).map(([k, r]) => [k, r.name])) as Record<Role, string>;

function RolePick({ value, onChange, disabled, label }: { value: Role; onChange: (r: Role) => void; disabled?: boolean; label: string }) {
  return (
    <Select items={roleItems} value={value} onValueChange={(v) => v && onChange(v as Role)} disabled={disabled}>
      <SelectTrigger size="sm" className="w-44 bg-white" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(roleItems).map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Users({ refused }: { refused: string | null }) {
  const users = useWarehouse((s) => s.users);
  const sites = useWarehouse((s) => s.sites);
  const save = useWarehouse((s) => s.saveUser);
  const update = (user: User) => {
    const err = save(user);
    if (err) toast.error(err);
  };
  return (
    <Panel className="space-y-3 p-4">
      <div className="leading-tight">
        <h2 className="font-semibold">Users</h2>
        <p className="text-xs text-muted-foreground">Role sets what someone can do; sites set where. No site ticked means every site.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1 font-medium">User</th>
              <th className="pb-1 font-medium">Role</th>
              <th className="pb-1 font-medium">Sites</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-2 leading-tight">
                  <span className="block font-medium">{u.name}</span>
                  <span className="block text-xs text-muted-foreground">{u.email}</span>
                </td>
                <td className="py-2">
                  <RolePick label={`Role for ${u.name}`} value={u.role} disabled={refused !== null} onChange={(role) => update({ ...u, role })} />
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {Object.values(sites).map(({ site }) => (
                      <label key={site.id} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          disabled={refused !== null}
                          checked={u.sites.includes(site.id)}
                          onChange={(e) => update({ ...u, sites: e.target.checked ? [...u.sites, site.id] : u.sites.filter((x) => x !== site.id) })}
                        />
                        {site.code}
                      </label>
                    ))}
                    {!u.sites.length && <span className="text-xs text-muted-foreground">All sites</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NewUser refused={refused} />
    </Panel>
  );
}

function NewUser({ refused }: { refused: string | null }) {
  const save = useWarehouse((s) => s.saveUser);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("picker");
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const err = save({ id: `u-${Date.now()}`, name: name.trim(), email: email.trim(), role, sites: [] });
        if (err) return void toast.error(err);
        setName("");
        setEmail("");
        toast.success(`${name.trim()} added`);
      }}
    >
      <Input aria-label="Name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-40 bg-white" disabled={refused !== null} />
      <Input aria-label="Email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 w-56 bg-white" disabled={refused !== null} />
      <RolePick label="Role for new user" value={role} onChange={setRole} disabled={refused !== null} />
      <button type="submit" disabled={refused !== null} className={cn(buttonVariants({ size: "sm" }), "h-8 gap-1.5")}>
        <UserPlus className="size-3.5" />
        Add user
      </button>
    </form>
  );
}

function Roles() {
  return (
    <Panel className="space-y-3 p-4">
      <h2 className="font-semibold">Roles</h2>
      <ul className="divide-y divide-slate-100 text-sm">
        {Object.values(roles).map((r) => (
          <li key={r.name} className="py-2 leading-tight">
            <span className="block font-medium">
              {r.name} <span className="font-normal text-muted-foreground">· {r.worksOn}</span>
            </span>
            <span className="block text-xs text-muted-foreground">{r.grants.map((g) => permissionNames[g]).join(", ")}</span>
          </li>
        ))}
        <li className="py-2 text-xs text-muted-foreground">Drivers use the driver link and customers the tracking page; neither signs in.</li>
      </ul>
    </Panel>
  );
}

function AuditLog() {
  const audit = useWarehouse((s) => s.audit);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = needle ? audit.filter((a) => [a.user, a.role, a.site, a.action, a.detail].some((f) => f.toLowerCase().includes(needle))) : audit;
  return (
    <Panel className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="leading-tight">
          <h2 className="font-semibold">Audit log</h2>
          <p className="text-xs text-muted-foreground">Every change: who, what, where and when, with before and after values</p>
        </div>
        <Input aria-label="Filter the audit log" placeholder="Filter by user, site, action…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-64 bg-white" />
      </div>
      {rows.length ? (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-1 font-medium">Time</th>
                <th className="pb-1 font-medium">User</th>
                <th className="pb-1 font-medium">Site</th>
                <th className="pb-1 font-medium">Action</th>
                <th className="pb-1 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="py-1.5 text-xs whitespace-nowrap tabular-nums">{new Date(a.at).toLocaleTimeString("en-GB")}</td>
                  <td className="py-1.5 leading-tight">
                    <span className="block text-xs font-medium">{a.user}</span>
                    <span className="block text-[11px] text-muted-foreground">{a.role}</span>
                  </td>
                  <td className="py-1.5 text-xs">{a.site}</td>
                  <td className="py-1.5 text-xs font-medium">{a.action}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">{needle ? "Nothing matches." : "No changes yet. Approvals, scans, check-ins and settings land here as they happen."}</p>
      )}
    </Panel>
  );
}

export function AdminScreen() {
  const refused = useDenied("admin");
  return (
    <AppShell title="Admin" subtitle={refused ? `View only: ${refused}` : "Users, roles, site access and the audit log"}>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Users refused={refused} />
        <Roles />
      </div>
      <AuditLog />
    </AppShell>
  );
}
