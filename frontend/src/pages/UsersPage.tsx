import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Role, UserRow, Warehouse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHead } from '../components/Layout';
import { EmptyState, ErrorState, Field, FormError, Modal, SkeletonRows, useToast } from '../components/ui';
import { fmt, relativeTime } from '../lib/format';
import { t } from '../i18n';

function UserForm({ user, roles, warehouses, onClose }: { user?: UserRow; roles: Role[]; warehouses: Warehouse[]; onClose: () => void }) {
  const isEdit = !!user;
  const toast = useToast();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(user?.roleId ?? roles.find((r) => !r.isSystem)?.id ?? 0);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [warehouseId, setWarehouseId] = useState<number>(user?.warehouseId ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => isEdit
      ? api.put(`/api/users/${user!.id}`, { fullName, roleId, isActive, newPassword: password || null, warehouseId: warehouseId || null })
      : api.post('/api/users', { fullName, username, password, roleId, warehouseId: warehouseId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast(isEdit ? t('usr.saved', { name: fullName }) : t('usr.created', { name: fullName }));
      onClose();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : t('common.saveFailed'));
      if (e instanceof ApiError) setErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0]])));
    },
  });

  function submit() {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = t('usr.err.fullName');
    if (!isEdit && !/^[a-zA-Z0-9._-]{3,60}$/.test(username)) e.username = t('usr.err.username');
    if ((!isEdit || password) && password.length < 8) e.password = t('usr.err.password');
    if (!roleId) e.roleId = t('usr.err.role');
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    save.mutate();
  }

  return (
    <Modal
      title={isEdit ? t('usr.editTitle', { name: user!.fullName }) : t('usr.new')}
      onClose={onClose}
      as="form"
      onSubmit={submit}
      footer={<><span className="spacer" /><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" type="submit" disabled={save.isPending}>{isEdit ? t('common.save') : t('usr.create')}</button></>}
    >
      <FormError message={error} />
      <Field label={t('usr.fullName')} error={errors.fullName}>
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} aria-invalid={!!errors.fullName} />
      </Field>
      <div className="grid-2">
        <Field label={t('usr.username')} error={errors.username} hint={isEdit ? t('usr.usernameFixed') : undefined}>
          <input className="input ltr" dir="ltr" value={username} disabled={isEdit} autoComplete="off"
            onChange={(e) => setUsername(e.target.value.toLowerCase())} aria-invalid={!!errors.username} />
        </Field>
        <Field label={isEdit ? t('usr.newPassword') : t('usr.password')} error={errors.password ?? errors.newPassword}
          hint={isEdit ? t('usr.keepPassword') : t('usr.min8')}>
          <input className="input ltr" dir="ltr" type="password" value={password} autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
        </Field>
      </div>
      <Field label={t('usr.role')} error={errors.roleId} hint={roles.find((r) => r.id === roleId)?.description ?? undefined}>
        <select className="select" value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
          <option value={0}>{t('usr.pickRole')}</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
      <Field label={t('usr.warehouse')} hint={t('usr.warehouseHint')}>
        <select className="select" value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))}>
          <option value={0}>{t('usr.allWarehouses')}</option>
          {warehouses.filter((w) => w.isActive || w.id === warehouseId)
            .map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
        </select>
      </Field>
      {isEdit && (
        <label className="switch">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {t('usr.active')}
        </label>
      )}
    </Modal>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/api/users') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<Role[]>('/api/roles') });
  const warehouses = useQuery({ queryKey: ['warehouses', 'manage', true], queryFn: () => api.get<Warehouse[]>('/api/warehouses', { includeInactive: true }) });

  return (
    <>
      <PageHead
        title={t('usr.title')}
        subtitle={t('usr.subtitle')}
        actions={<button className="btn btn-primary" onClick={() => setEditing('new')} disabled={!roles.data}><Plus size={18} /> {t('usr.new')}</button>}
      />
      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>{t('usr.col.name')}</th><th>{t('usr.col.username')}</th><th>{t('usr.col.role')}</th><th>{t('usr.col.warehouse')}</th><th>{t('usr.col.status')}</th><th>{t('usr.col.lastLogin')}</th><th>{t('usr.col.created')}</th><th /></tr>
            </thead>
            {users.isLoading ? <SkeletonRows cols={8} rows={4} /> : (
              <tbody>
                {users.data?.map((u) => (
                  <tr key={u.id} className={u.isActive ? '' : 'inactive'}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="avatar" style={{ width: 32, height: 32, fontSize: 14, background: 'var(--surface-2)', color: 'var(--ink-2)' }}>{u.fullName.charAt(0)}</span>
                        <span className="cell-title">{u.fullName}{u.id === me?.id && <span className="muted" style={{ fontWeight: 400 }}>{t('usr.you')}</span>}</span>
                      </div>
                    </td>
                    <td><span className="num">{u.username}</span></td>
                    <td>{u.roleName}</td>
                    <td className={u.warehouseName ? undefined : 'cell-sub'}>{u.warehouseName ?? t('usr.allWarehouses')}</td>
                    <td>{u.isActive ? <span className="badge badge-in">{t('usr.on')}</span> : <span className="badge badge-off">{t('usr.off')}</span>}</td>
                    <td className="cell-sub">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : t('usr.never')}</td>
                    <td className="cell-sub">{fmt.date(u.createdAt)}</td>
                    <td className="end">
                      <button className="btn btn-ghost btn-icon" onClick={() => setEditing(u)} aria-label={t('usr.editAria', { name: u.fullName })} disabled={!roles.data}>
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        {users.isError && <ErrorState error={users.error} onRetry={users.refetch} />}
        {users.data?.length === 0 && <EmptyState title={t('usr.empty')} />}
      </section>

      {editing && roles.data && (
        <UserForm user={editing === 'new' ? undefined : editing} roles={roles.data} warehouses={warehouses.data ?? []} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
