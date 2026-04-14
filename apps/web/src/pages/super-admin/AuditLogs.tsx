import React, { useEffect, useState } from 'react'
import { Table, Card, Badge, Skeleton } from '../../components/ui'
import api from '../../lib/api'
import type { AuditLog } from '../../types'
import { formatDateTime } from '../../lib/utils'

export default function SuperAdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

  useEffect(() => {
    setLoading(true)
    api.get(`/admin/audit?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`)
      .then(r => { setLogs(r.data.data); setTotal(r.data.total) })
      .finally(() => setLoading(false))
  }, [page])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-[var(--text-muted)] text-sm">{total} total entries</p>
      </div>

      <Table
        loading={loading}
        columns={[
          { key: 'actor', label: 'User' },
          { key: 'action', label: 'Action' },
          { key: 'entity', label: 'Entity' },
          { key: 'time', label: 'Time' },
        ]}
        data={logs.map(log => ({
          actor: <span className="font-medium">{(log.actor as any)?.full_name ?? 'System'}</span>,
          action: <code className="text-xs bg-[var(--surface-elevated)] px-2 py-0.5 rounded">{log.action}</code>,
          entity: <Badge size="sm">{log.entity_type}</Badge>,
          time: <span className="text-xs text-[var(--text-muted)]">{formatDateTime(log.created_at)}</span>,
        }))}
        emptyMessage="No audit logs found"
      />

      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-4 py-2 rounded text-sm disabled:opacity-50">← Prev</button>
          <span className="px-4 py-2 text-sm text-[var(--text-muted)]">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="px-4 py-2 rounded text-sm disabled:opacity-50">Next →</button>
        </div>
      )}
    </div>
  )
}
