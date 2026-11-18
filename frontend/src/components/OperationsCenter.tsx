'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FlaskConical,
  History,
  RefreshCw,
  ShieldAlert,
  UserRound,
  Wallet,
  Wrench,
} from 'lucide-react';
import { HUBS } from '@/constants/hubs';
import {
  EVENT_TYPE_META,
  INCIDENT_CATEGORY_LABEL,
  INCIDENT_SEVERITY_META,
  INCIDENT_STATUS_META,
  OPS_SOURCE_LABEL,
} from '@/constants/operations';
import { useAuth } from '@/lib/auth';
import { useNow } from '@/lib/useNow';
import { computeNetworkPerformance } from '@/lib/networkMetrics';
import {
  formatCompactMoney,
  formatNumber,
  formatOpsDateTime,
  formatOpsRelative,
  formatOpsTime,
  sortIncidents,
} from '@/lib/operationsFormat';
import { updateIncident, useOperations } from '@/lib/operationsStore';
import { fetchAiAudit, type AiAuditEntry } from '@/lib/opsApi';
import type { Incident, IncidentStatus, OpsEventType } from '@/types/operations';

type CenterTab = 'incidents' | 'history' | 'analytics';
type HistoryFilter = 'all' | 'ops' | 'incident' | 'task' | 'ai' | 'warehouse';

const CENTER_TABS: Array<{ id: CenterTab; label: string; Icon: typeof ShieldAlert }> = [
  { id: 'incidents', label: 'Инциденты', Icon: ShieldAlert },
  { id: 'history', label: 'История', Icon: History },
  { id: 'analytics', label: 'Аналитика', Icon: BarChart3 },
];

const HISTORY_FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'ops', label: 'Рейсы и РЦ' },
  { id: 'incident', label: 'Инциденты' },
  { id: 'task', label: 'Задачи' },
  { id: 'ai', label: 'AI' },
  { id: 'warehouse', label: 'Склад' },
];

function matchesHistory(eventType: OpsEventType, filter: HistoryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'ops') return eventType === 'trip' || eventType === 'hub';
  if (filter === 'incident') return eventType === 'incident';
  if (filter === 'task') return eventType === 'task';
  if (filter === 'ai') return eventType === 'ai';
  return eventType === 'employee' || eventType === 'equipment';
}

function SeverityBadge({ severity }: { severity: Incident['severity'] }) {
  const meta = INCIDENT_SEVERITY_META[severity];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium"
      style={{
        color: meta.color,
        borderColor: `color-mix(in srgb, ${meta.color} 34%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${meta.color} 9%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

function IncidentCard({ incident, now }: { incident: Incident; now: number }) {
  const { session, isAdmin } = useAuth();
  const hub = HUBS.find((item) => item.id === incident.hubId);
  const statusMeta = INCIDENT_STATUS_META[incident.status];
  const nextStatus: IncidentStatus | null =
    incident.status === 'new' ? 'in_progress' : incident.status === 'in_progress' ? 'resolved' : 'new';

  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <SeverityBadge severity={incident.severity} />
          <span className="rounded border border-[var(--line)] bg-[var(--surface-soft)] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.08em] text-[var(--muted)]">
            {INCIDENT_CATEGORY_LABEL[incident.category]}
          </span>
          <span className="text-[9px] text-[var(--muted-soft)]">{formatOpsRelative(incident.updatedAt, now)}</span>
        </div>
        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${statusMeta.className}`}>
          {statusMeta.label}
        </span>
      </div>

      <h3 className="mt-2 text-[12px] font-semibold leading-snug text-[var(--text)]">{incident.title}</h3>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--muted)]">{incident.description}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1">
          <UserRound className="h-3 w-3 text-[var(--muted-soft)]" />
          {incident.owner}
        </span>
        {hub ? (
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: INCIDENT_SEVERITY_META[incident.severity].color }} />
            {hub.name} · {hub.load}%
          </span>
        ) : null}
        {incident.zoneId ? <span>зона: {incident.zoneId}</span> : null}
      </div>

      {incident.recommendation ? (
        <p className="mt-2 rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-1.5 text-[9px] leading-relaxed text-[var(--muted)]">
          <span className="font-medium text-[var(--accent)]">Рекомендация: </span>
          {incident.recommendation}
        </p>
      ) : null}

      {isAdmin && nextStatus ? (
        <div className="mt-2 flex gap-1.5 border-t border-[var(--line-soft)] pt-2">
          <button
            type="button"
            onClick={() => {
              const actor = session?.username ?? 'Администратор';
              updateIncident(
                incident.id,
                {
                  status: nextStatus,
                  ...(nextStatus === 'in_progress' ? { owner: actor } : {}),
                },
                actor,
              );
            }}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--accent-line-2)] bg-[var(--accent-soft)] text-[9px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft-2)]"
          >
            {nextStatus === 'in_progress' ? (
              <>
                <Wrench className="h-3 w-3" /> Взять в работу
              </>
            ) : nextStatus === 'resolved' ? (
              <>
                <CheckCircle2 className="h-3 w-3" /> Закрыть инцидент
              </>
            ) : (
              <>
                <Clock3 className="h-3 w-3" /> Вернуть в работу
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="mt-2 border-t border-[var(--line-soft)] pt-1.5 text-[8px] text-[var(--muted-soft)]">
          Изменение статуса доступно администратору
        </div>
      )}
    </article>
  );
}

function IncidentsView({ now }: { now: number }) {
  const { incidents } = useOperations();
  const [filter, setFilter] = useState<'all' | 'open' | 'critical' | 'resolved'>('all');
  const filtered = useMemo(() => {
    const list = sortIncidents(incidents).filter((incident) => {
      if (filter === 'open') return incident.status !== 'resolved';
      if (filter === 'critical') return incident.severity === 'critical' && incident.status !== 'resolved';
      if (filter === 'resolved') return incident.status === 'resolved';
      return true;
    });
    return list;
  }, [incidents, filter]);
  const open = incidents.filter((incident) => incident.status !== 'resolved').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-[var(--muted)]">
          Открыто: <span className="font-semibold text-[var(--text)]">{open}</span> · всего{' '}
          <span className="font-semibold text-[var(--text)]">{incidents.length}</span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[8px] text-rose-700">
          <CircleAlert className="h-2.5 w-2.5" />
          демо-данные
        </span>
      </div>

      <div className="no-scrollbar flex gap-1 overflow-x-auto pb-0.5">
        {[
          { id: 'all' as const, label: 'Все' },
          { id: 'open' as const, label: 'Открытые' },
          { id: 'critical' as const, label: 'Критические' },
          { id: 'resolved' as const, label: 'Решённые' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] transition ${
              filter === item.id
                ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] px-3 py-6 text-center text-[10px] text-[var(--muted-soft)]">
          По выбранному фильтру инцидентов нет.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function AiAuditSection() {
  const { session, isAdmin } = useAuth();
  const [entries, setEntries] = useState<AiAuditEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin || !session) return null;

  const load = () => {
    if (!session.token || busy) return;
    setBusy(true);
    setError(null);
    void fetchAiAudit(session.token, 20).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEntries(result.entries);
    });
  };

  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[9.5px] font-semibold text-[var(--text)]">AI-аудит на сервере</h3>
          <p className="mt-0.5 text-[8px] text-[var(--muted-soft)]">
            Только подтверждённые администратором действия
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={busy || session.demo}
          className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[var(--line)] px-2 text-[8px] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
          {entries ? 'Обновить' : 'Показать'}
        </button>
      </div>

      {session.demo ? (
        <p className="mt-1.5 text-[8px] leading-snug text-amber-700">
          Демо-сессия не подтверждена сервером: журнал доступен после входа с серверным паролем.
        </p>
      ) : null}
      {error ? (
        <p className="mt-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[8px] leading-snug text-rose-700">
          {error}
        </p>
      ) : null}
      {entries ? (
        entries.length === 0 ? (
          <p className="mt-1.5 text-[8px] text-[var(--muted-soft)]">Записей пока нет.</p>
        ) : (
          <div className="mt-1.5 max-h-44 space-y-1 overflow-y-auto">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] px-2 py-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-[8.5px] font-medium text-[var(--text)]">{entry.title}</span>
                  <span className="shrink-0 font-mono text-[7.5px] text-[var(--muted-soft)]">
                    {formatOpsDateTime(entry.at)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[7.5px] text-[var(--muted-soft)]">
                  <span>{entry.kind}</span>
                  <span>·</span>
                  <span>{entry.actor}</span>
                  <span>·</span>
                  <span className="font-mono">audit {entry.id.slice(0, 8)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}

function HistoryView({ now }: { now: number }) {
  const { events } = useOperations();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [limit, setLimit] = useState(16);
  const filtered = useMemo(
    () => events.filter((event) => matchesHistory(event.type, filter)),
    [events, filter],
  );
  const visible = filtered.slice(0, limit);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-[var(--muted)]">
          Событий: <span className="font-semibold text-[var(--text)]">{filtered.length}</span>
        </div>
        <span className="text-[8px] text-[var(--muted-soft)]">localStorage · демо</span>
      </div>

      <div className="no-scrollbar flex gap-1 overflow-x-auto pb-0.5">
        {HISTORY_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setFilter(item.id);
              setLimit(16);
            }}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] transition ${
              filter === item.id
                ? 'border-[var(--accent-line-2)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] px-3 py-6 text-center text-[10px] text-[var(--muted-soft)]">
          Событий по фильтру пока нет. Они появятся после действий в системе.
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((event) => {
            const meta = EVENT_TYPE_META[event.type];
            return (
              <article
                key={event.id}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] px-2.5 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-medium ${meta.className}`}>
                      {meta.label}
                    </span>
                    <span className="truncate text-[10.5px] font-medium text-[var(--text)]">{event.title}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[8px] text-[var(--muted-soft)]">
                    {formatOpsTime(event.at)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-[var(--muted)]">{event.detail}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[8px] text-[var(--muted-soft)]">
                  <span>{formatOpsRelative(event.at, now)}</span>
                  <span>·</span>
                  <span>{OPS_SOURCE_LABEL[event.source]}</span>
                  {event.auditId ? (
                    <>
                      <span>·</span>
                      <span className="font-mono">audit {event.auditId.slice(0, 8)}</span>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {filtered.length > visible.length ? (
        <button
          type="button"
          onClick={() => setLimit((value) => value + 20)}
          className="flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-[var(--line)] text-[9px] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--text)]"
        >
          Показать ещё
          <ChevronRight className="h-3 w-3 rotate-90" />
        </button>
      ) : null}

      <AiAuditSection />
    </div>
  );
}

function AnalyticsView() {
  const { incidents } = useOperations();
  const metrics = useMemo(() => computeNetworkPerformance(incidents), [incidents]);
  const worst = useMemo(
    () => [...metrics.hubs].sort((a, b) => a.sla - b.sla).slice(0, 3),
    [metrics.hubs],
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-[var(--muted)]">Сеть из {metrics.hubs.length} РЦ</div>
        <span className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-1.5 py-0.5 text-[8px] text-[var(--accent)]">
          демо-расчёт
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">Пропускная</div>
          <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-[var(--text)]">
            {formatNumber(metrics.throughput)}
          </div>
          <div className="text-[8px] text-[var(--muted)]">паллет/ч по сети</div>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">SLA сети</div>
          <div className={`mt-0.5 text-[16px] font-semibold tabular-nums ${metrics.sla >= 94 ? 'text-emerald-700' : metrics.sla >= 90 ? 'text-amber-700' : 'text-rose-700'}`}>
            {formatNumber(metrics.sla, 1)}%
          </div>
          <div className="text-[8px] text-[var(--muted)]">средневзвешенный</div>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">Расходы</div>
          <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-[var(--text)]">
            {formatCompactMoney(metrics.dailyCost)}
          </div>
          <div className="text-[8px] text-[var(--muted)]">в сутки · демо</div>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">Инциденты</div>
          <div className={`mt-0.5 text-[16px] font-semibold tabular-nums ${metrics.openIncidents > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {metrics.openIncidents}
          </div>
          <div className="text-[8px] text-[var(--muted)]">открыто · {metrics.criticalHubs} крит. РЦ</div>
        </div>
      </div>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold text-[var(--text)]">Производительность РЦ</h3>
          <span className="text-[8px] text-[var(--muted-soft)]">стоимость / SLA</span>
        </div>
        <div className="mt-2 space-y-2">
          {metrics.hubs.map((item) => (
            <div key={item.hub.id}>
              <div className="flex items-center justify-between gap-2 text-[9px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.hub.status === 'critical' ? 'bg-rose-500' : item.hub.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="truncate font-medium text-[var(--text)]">{item.hub.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-[var(--muted)]">
                  {item.load}% · SLA {formatNumber(item.sla, 1)}% · {formatCompactMoney(item.dailyCost)}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                <div
                  className={`h-full rounded-full ${item.load >= 90 ? 'bg-rose-500' : item.load >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, item.load)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {worst.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold text-amber-800">
            <AlertTriangle className="h-3 w-3" />
            Требуют внимания
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-amber-900/80">
            {worst.map((item) => `${item.hub.name} (SLA ${formatNumber(item.sla, 1)}%)`).join(', ')}. Подробный расчёт — в разделе «Экономика».
          </p>
        </section>
      ) : null}

      <details className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-2.5 py-2">
        <summary className="cursor-pointer text-[9px] font-medium text-[var(--muted)]">Как считаем</summary>
        <p className="mt-1.5 text-[9px] leading-relaxed text-[var(--muted)]">
          Пропускная способность зависит от числа доков и загрузки. SLA снижается при загрузке выше 55% и
          критическом статусе. Расходы включают рейсы, простой, обработку заказов, накладные и потери от
          инцидентов. Все тарифы — демонстрационные.
        </p>
      </details>

      <div className="grid grid-cols-2 gap-1.5">
        <Link
          href="/simulator"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] py-2 text-[9px] font-medium text-[var(--muted)] transition hover:border-[var(--accent-line-2)] hover:text-[var(--accent)]"
        >
          <FlaskConical className="h-3 w-3" />
          Симулятор
        </Link>
        <Link
          href="/economics"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] py-2 text-[9px] font-medium text-[var(--muted)] transition hover:border-[var(--accent-line-2)] hover:text-[var(--accent)]"
        >
          <Wallet className="h-3 w-3" />
          Экономика
        </Link>
      </div>
    </div>
  );
}

export function OperationsCenter() {
  const now = useNow();
  const { incidents } = useOperations();
  const [tab, setTab] = useState<CenterTab>('incidents');
  const open = incidents.filter((incident) => incident.status !== 'resolved').length;
  const critical = incidents.filter(
    (incident) => incident.severity === 'critical' && incident.status !== 'resolved',
  ).length;

  return (
    <section className="flex min-h-[260px] flex-1 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]">
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--line)] p-1">
        {CENTER_TABS.map(({ id, label, Icon }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[10px] font-medium transition ${
                selected
                  ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--accent-line)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
              {id === 'incidents' && open > 0 ? (
                <span className={`rounded-full px-1 text-[8px] font-semibold ${critical > 0 ? 'bg-rose-100 text-rose-700' : 'bg-[var(--accent-soft-2)] text-[var(--accent)]'}`}>
                  {open}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === 'incidents' ? <IncidentsView now={now} /> : null}
        {tab === 'history' ? <HistoryView now={now} /> : null}
        {tab === 'analytics' ? <AnalyticsView /> : null}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] px-2.5 py-1.5 text-[8px] text-[var(--muted-soft)]">
        Демо-данные · изменения хранятся в этом браузере
      </div>
    </section>
  );
}
