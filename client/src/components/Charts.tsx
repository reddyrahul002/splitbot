import { useState, type ReactNode } from 'react';
import { ChartColumn, ChartPie, CircleCheck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCents, type Account, type Person, type SpendingSummary } from '@splitbot/shared';
import { axisLabel, balanceDomain, balanceRows, categoryRows, monthRows, shortName, spendTotal, type ChartRow, type SpendMode } from '../chartData';
import { useOpenChat } from '../chatOpener';
import { debtText, signedCents } from '../display';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

// Tokens, so a theme switch needs no re-render. The pair passed scripts/validate_palette.js from the dataviz skill in both themes.
const OWES_ME = 'var(--chart-owes)';
const I_OWE = 'var(--chart-owe)';
// One neutral hue for spending, so it never reads as money owed.
const SPEND = 'var(--chart-spend)';
const AXIS_INK = 'var(--text-muted)';
const LABEL_INK = 'var(--text)';
const GRID = 'var(--chart-grid)';
const BASELINE = 'var(--chart-baseline)';
const HOVER = 'var(--chart-hover)';

const BAR_SIZE = 24;
const ROW_HEIGHT = 40;
const TICK = { fill: AXIS_INK, fontSize: 13 };
const LABEL = { fill: LABEL_INK, fontSize: 13 };
const horizontalHeight = (rows: ChartRow[]) => rows.length * ROW_HEIGHT + 16;

/** Value first, then what it is. Text is rendered by React, so names can't inject markup. */
function ChartTip(props: { active?: boolean; payload?: readonly { payload?: ChartRow }[]; format: (row: ChartRow) => string }) {
  const row = props.payload?.[0]?.payload;
  if (!props.active || !row) return null;
  return (
    <div className="chart-tip">
      <strong>{props.format(row)}</strong>
      <span>{row.label}</span>
    </div>
  );
}

const centsTip = (row: ChartRow) => formatCents(row.cents);

function CategoryChart({ rows }: { rows: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={horizontalHeight(rows)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 100, bottom: 8, left: 0 }}>
        <XAxis type="number" hide domain={[0, 'auto']} />
        <YAxis type="category" dataKey="label" width={140} tick={TICK} tickLine={false} axisLine={{ stroke: BASELINE }} />
        <Tooltip cursor={{ fill: HOVER }} content={(tip) => <ChartTip active={tip.active} payload={tip.payload} format={centsTip} />} />
        <Bar dataKey="cents" fill={SPEND} barSize={BAR_SIZE} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList dataKey="cents" position="right" style={LABEL} formatter={(v) => formatCents(Number(v))} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function MonthChart({ rows }: { rows: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: BASELINE }} />
        <YAxis width={64} allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} tickFormatter={axisLabel} />
        <Tooltip cursor={{ fill: HOVER }} content={(tip) => <ChartTip active={tip.active} payload={tip.payload} format={centsTip} />} />
        <Bar dataKey="cents" fill={SPEND} barSize={BAR_SIZE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function BalanceChart({ rows }: { rows: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={horizontalHeight(rows)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <XAxis type="number" hide domain={balanceDomain(rows)} />
        <YAxis type="category" dataKey="label" width={110} tick={TICK} tickLine={false} axisLine={false} tickFormatter={shortName} />
        <ReferenceLine x={0} stroke={BASELINE} />
        <Tooltip cursor={{ fill: HOVER }} content={(tip) => <ChartTip active={tip.active} payload={tip.payload} format={(row) => debtText(row.cents)} />} />
        <Bar dataKey="cents" barSize={BAR_SIZE} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell key={row.label} fill={row.cents > 0 ? OWES_ME : I_OWE} />
          ))}
          <LabelList dataKey="cents" position="right" style={LABEL} formatter={(v) => signedCents(Number(v))} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartBlock(props: { title: string; note?: string; headers: [string, string]; table: [string, string][]; children: ReactNode }) {
  const { title, note, headers, table, children } = props;
  return (
    <section className="chart-block">
      <h2>{title}</h2>
      {note && <p className="hint">{note}</p>}
      {children}
      <details className="chart-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th>{headers[0]}</th>
              <th>{headers[1]}</th>
            </tr>
          </thead>
          <tbody>
            {table.map(([label, amount]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

const MODES: { mode: SpendMode; label: string }[] = [
  { mode: 'mine', label: 'My share' },
  { mode: 'group', label: 'Group total' },
];

const spendTable = (rows: ChartRow[]): [string, string][] => rows.map((row) => [row.label, formatCents(row.cents)]);

export function Charts(props: {
  summary: SpendingSummary | null;
  account: Account | null;
  people: Person[];
  error: string | null;
  initialMode?: SpendMode;
}) {
  const { summary, account, people, error, initialMode = 'mine' } = props;
  const [mode, setMode] = useState<SpendMode>(initialMode);
  const openChat = useOpenChat();

  if (!summary || !account) {
    return error ? (
      <p className="panel-error" role="alert">
        {error}
      </p>
    ) : (
      <Skeleton variant="chart" />
    );
  }

  const categories = categoryRows(summary, mode);
  const months = monthRows(summary, mode);
  const balances = balanceRows(account, people);
  const anySpending = summary.totalCents !== 0;

  return (
    <div className="charts">
      <div className="chart-toolbar">
        <div className="toggle" role="group" aria-label="Spending view">
          {MODES.map(({ mode: option, label }) => (
            <button key={option} type="button" className={option === mode ? 'active' : undefined} aria-pressed={option === mode} onClick={() => setMode(option)}>
              {label}
            </button>
          ))}
        </div>
        <span>
          Total <strong>{formatCents(spendTotal(summary, mode))}</strong>
        </span>
      </div>

      {!anySpending && <EmptyState icon={ChartColumn} title="No spending yet." body="Add an expense in the chat." action={{ label: 'Add an expense', onClick: openChat }} />}
      {anySpending && categories.length === 0 && (
        <EmptyState icon={ChartPie} title="You have no share of this spending." body="Switch to Group total to see it." action={{ label: 'Show Group total', onClick: () => setMode('group') }} />
      )}
      {categories.length > 0 && (
        <>
          <ChartBlock title="Spending by category" headers={['Category', 'Amount']} table={spendTable(categories)}>
            <CategoryChart rows={categories} />
          </ChartBlock>
          <ChartBlock title="Spending by month" headers={['Month', 'Amount']} table={spendTable(months)}>
            <MonthChart rows={months} />
          </ChartBlock>
        </>
      )}

      {balances.length === 0 ? (
        <section className="chart-block">
          <h2>Balance per person</h2>
          <EmptyState icon={CircleCheck} title="Everyone is settled up." />
        </section>
      ) : (
        <ChartBlock
          title="Balance per person"
          note="Right of the line owes you; left of the line you owe. The toggle above doesn't apply here."
          headers={['Person', 'Balance']}
          table={balances.map((row) => [row.label, debtText(row.cents)])}
        >
          <BalanceChart rows={balances} />
        </ChartBlock>
      )}
    </div>
  );
}
