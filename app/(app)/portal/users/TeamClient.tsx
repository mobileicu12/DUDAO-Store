"use client";

import { useCallback, useEffect, useState } from "react";
import { PERMISSIONS, type PermKey } from "@/lib/permissions";
import type { PublicUser } from "@/lib/portal-users";
import { money } from "@/lib/business";
import { refreshMe, useMe } from "@/lib/use-me";

type StaffRow = {
  email: string;
  name: string;
  count: number;
  total: number;
  paid: number;
  open: number;
};
import {
  Alert,
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SectionLabel,
  Skeleton,
} from "@/components/ui/primitives";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export default function TeamClient() {
  const toast = useToast();
  const { me } = useMe();

  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<PublicUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [byStaff, setByStaff] = useState<StaffRow[]>([]);

  // Owner-only: how much each member has taken. A member never sees this.
  useEffect(() => {
    if (me?.role !== "owner") return;
    fetch("/api/reports/team", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { byStaff: [] }))
      .then((d: { byStaff: StaffRow[] }) => setByStaff(d.byStaff))
      .catch(() => {});
  }, [me?.role]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load your team.");
      const d = (await res.json()) as { users: PublicUser[] };
      setUsers(d.users);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/users?email=${encodeURIComponent(removing.email)}`,
        { method: "DELETE" },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That member was not removed.");
      toast.success(`${removing.name} removed.`);
      setRemoving(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Who can sign in, and what each person can do."
        actions={
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            Invite a member
          </Button>
        }
      />

      <Alert tone="info" title="Owners are set outside this screen">
        Owner accounts come from the PORTAL_OWNER_EMAIL environment variable and
        always have every permission. They cannot be edited or removed here.
      </Alert>

      <div className="mt-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))
        ) : users.length === 0 ? (
          <Card>
            <EmptyState
              title="No one on the team yet"
              message="Invite your first staff member and choose what they can access."
              action={
                <Button variant="primary" onClick={() => setInviteOpen(true)}>
                  Invite a member
                </Button>
              }
            />
          </Card>
        ) : (
          users.map((u) => (
            <Card key={u.email}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accentfg">
                    {u.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink">{u.name}</p>
                      <Badge tone={u.role === "owner" ? "accent" : "neutral"}>
                        {u.role === "owner" ? "Owner" : "Staff"}
                      </Badge>
                      {u.email === me?.email && <Badge tone="info">You</Badge>}
                      {!u.hasPassword && u.role !== "owner" && (
                        <Badge tone="warning">No password set</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted">{u.email}</p>
                    {u.role !== "owner" && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {u.permissions.length === 0 ? (
                          <span className="text-xs text-faint">No access yet</span>
                        ) : (
                          u.permissions.map((p) => (
                            <span
                              key={p}
                              className="rounded-md bg-subtle px-1.5 py-0.5 text-[0.65rem] font-medium text-muted"
                            >
                              {PERMISSIONS.find((x) => x.key === p)?.label ?? p}
                            </span>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {u.role !== "owner" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setEditing(u)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRemoving(u)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Owner-only: how much each member has taken. */}
      {me?.role === "owner" && byStaff.length > 0 && (
        <div className="mt-8">
          <SectionLabel>Sales by staff</SectionLabel>
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-subtle text-left text-xs font-semibold text-ink-2">
                <tr>
                  <th className="px-4 py-2.5">Staff</th>
                  <th className="px-4 py-2.5 text-right">Invoices</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Paid</th>
                  <th className="px-4 py-2.5 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byStaff.map((s) => (
                  <tr key={s.email}>
                    <td className="px-4 py-2.5 font-medium text-ink">{s.name}</td>
                    <td className="tnum px-4 py-2.5 text-right text-muted">{s.count}</td>
                    <td className="tnum px-4 py-2.5 text-right text-ink">{money(s.total)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-success">{money(s.paid)}</td>
                    <td className="tnum px-4 py-2.5 text-right">
                      <span className={s.open > 0 ? "font-medium text-warning" : "text-muted"}>
                        {money(s.open)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <MemberModal
        open={inviteOpen || editing !== null}
        member={editing}
        onClose={() => {
          setInviteOpen(false);
          setEditing(null);
        }}
        onSaved={async (email) => {
          setInviteOpen(false);
          setEditing(null);
          await load();
          // If the owner just changed their own permissions, refresh the JWT.
          if (email === me?.email) refreshMe();
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        busy={busy}
        title={`Remove ${removing?.name}?`}
        confirmLabel="Remove"
        message="They will no longer be able to sign in. Their past sales and the invoices they raised are kept."
      />
    </div>
  );
}

function MemberModal({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean;
  member: PublicUser | null;
  onClose: () => void;
  onSaved: (email: string) => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [perms, setPerms] = useState<Set<PermKey>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(member?.email ?? "");
    setName(member?.name ?? "");
    setPhone(member?.phone ?? "");
    setPassword("");
    setPerms(new Set(member?.permissions ?? []));
  }, [open, member]);

  const toggle = (key: PermKey) => {
    const next = new Set(perms);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPerms(next);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          phone,
          // Blank on edit means "keep the existing password".
          password: password || undefined,
          permissions: Array.from(perms),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That member was not saved.");
      toast.success(member ? "Member updated." : `${name || email} invited.`);
      onSaved(email);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? `Edit ${member.name}` : "Invite a team member"}
      size="md"
      dismissable={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!email.trim()}
            onClick={submit}
          >
            {member ? "Save" : "Invite"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" required>
            <Input
              type="email"
              value={email}
              disabled={!!member}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="them@example.com"
            />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field
            label={member ? "Reset password" : "Password"}
            hint={member ? "Leave blank to keep the current one." : "At least 8 characters."}
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={member ? "Unchanged" : "••••••••"}
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-ink-2">
            What they can access
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PERMISSIONS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => toggle(p.key)}
                aria-pressed={perms.has(p.key)}
                className={cx(
                  "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                  perms.has(p.key)
                    ? "border-accent bg-accent-subtle"
                    : "border-line hover:bg-subtle",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "mt-0.5 flex h-[1.15rem] w-[1.15rem] shrink-0 items-center justify-center rounded border transition-colors",
                    perms.has(p.key)
                      ? "border-accent bg-accent text-accentfg"
                      : "border-line-strong bg-surface",
                  )}
                >
                  {perms.has(p.key) && (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    {p.label}
                  </span>
                  <span className="block text-xs text-muted">{p.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
