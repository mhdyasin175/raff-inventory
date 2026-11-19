import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { PermissionInfo, Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { permGroupKey, t, type TKey } from '../i18n';
import { PageHead } from '../components/Layout';
import { ConfirmDialog, ErrorState, Field, FormError, Modal, useToast } from '../components/ui';

function NewRoleForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => api.post<Role>('/api/roles', { name: name.trim(), description: description.trim() || null, permissions: ['dashboard.view', 'products.view'] }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['roles'] }); toast(t('role.added', { name: r.name })); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : t('common.saveFailed')),
  });
  return (
    <Modal size="sm" title={t('role.new')} onClose={onClose} as="form"
      onSubmit={() => (name.trim() ? save.mutate() : setError(t('role.err.name')))}
      footer={<><span className="spacer" /><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" type="submit" disabled={save.isPending}>{t('role.add')}</button></>}>
      <FormError message={error} />
      <Field label={t('role.name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t('role.namePlaceholder')} /></Field>
      <Field label={t('role.desc')} hint={t('role.descHint')}>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
      </Field>
    </Modal>
  );
}

export default function RolesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<Role[]>('/api/roles') });
  const perms = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<PermissionInfo[]>('/api/roles/permissions') });

  // Local, editable copy of each role's permission set.
  const [draft, setDraft] = useState<Record<number, Set<string>>>({});
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

  useEffect(() => {
    if (roles.data) setDraft(Object.fromEntries(roles.data.map((r) => [r.id, new Set(r.permissions)])));
  }, [roles.data]);

  const groups = useMemo(() => {
    const g = new Map<TKey, PermissionInfo[]>();
    perms.data?.forEach((p) => { const k = permGroupKey(p.key); g.set(k, [...(g.get(k) ?? []), p]); });
    return [...g.entries()];
  }, [perms.data]);

  const dirty = (roles.data ?? []).filter((r) => {
    const d = draft[r.id];
    return d && (d.size !== r.permissions.length || r.permissions.some((p) => !d.has(p)));
  });

  const toggle = (roleId: number, key: string) => setDraft((d) => {
    const next = new Set(d[roleId]);
    if (next.has(key)) next.delete(key); else next.add(key);
    return { ...d, [roleId]: next };
  });

  const save = useMutation({
    mutationFn: async () => {
      for (const r of dirty) {
        await api.put(`/api/roles/${r.id}`, { name: r.name, description: r.description, permissions: [...draft[r.id]] });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast(t('role.saved'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : t('common.saveFailed'), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/roles/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast(t('role.deleted')); setDeleting(null); },
    onError: (e) => { toast(e instanceof Error ? e.message : t('common.deleteFailed'), 'error'); setDeleting(null); },
  });

  return (
    <>
      <PageHead
        title={t('role.title')}
        subtitle={t('role.subtitle', { role: user?.role ?? '' })}
        actions={
          <>
            <button className="btn" onClick={() => setAdding(true)}><Plus size={18} /> {t('role.new')}</button>
            <button className="btn btn-primary" disabled={dirty.length === 0 || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t('common.saving') : dirty.length ? t('role.saveChanges', { n: dirty.length }) : t('role.noChanges')}
            </button>
          </>
        }
      />

      <section className="panel">
        {roles.isError || perms.isError ? <ErrorState error={roles.error ?? perms.error} onRetry={() => { roles.refetch(); perms.refetch(); }} /> : (
          <div className="table-wrap">
            <table className="data matrix">
              <thead>
                <tr>
                  <th>{t('role.permission')}</th>
                  {roles.data?.map((r) => (
                    <th key={r.id} className="role-col" scope="col">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--ink)', fontWeight: 600 }}>
                        {r.isSystem && <Lock size={13} aria-label={t('role.system')} />}
                        {r.name}
                        {!r.isSystem && (
                          <button className="btn btn-ghost btn-icon" style={{ width: 26, height: 26 }}
                            onClick={() => setDeleting(r)} aria-label={t('role.deleteAria', { name: r.name })}><Trash2 size={13} /></button>
                        )}
                      </div>
                      <div style={{ fontWeight: 400, fontSize: 12 }}>{t('role.users', { n: r.userCount })}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(([group, items]) => (
                  <GroupRows key={group} group={group} items={items} roles={roles.data ?? []} draft={draft} toggle={toggle} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adding && <NewRoleForm onClose={() => setAdding(false)} />}
      {deleting && (
        <ConfirmDialog
          title={t('role.deleteTitle')}
          text={deleting.userCount > 0
            ? t('role.deleteHasUsers', { name: deleting.name, n: deleting.userCount })
            : t('role.deleteText', { name: deleting.name })}
          confirmLabel={t('role.deleteConfirm')}
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function GroupRows({ group, items, roles, draft, toggle }: {
  group: TKey; items: PermissionInfo[]; roles: Role[]; draft: Record<number, Set<string>>; toggle: (r: number, k: string) => void;
}) {
  return (
    <>
      <tr className="group"><td colSpan={roles.length + 1}>{t(group)}</td></tr>
      {items.map((p) => (
        <tr key={p.key}>
          <td>{t(`perm.${p.key}` as TKey)}</td>
          {roles.map((r) => (
            <td key={r.id} className="check">
              <input
                type="checkbox"
                checked={draft[r.id]?.has(p.key) ?? false}
                disabled={r.isSystem}
                onChange={() => toggle(r.id, p.key)}
                aria-label={`${t(`perm.${p.key}` as TKey)}: ${r.name}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
