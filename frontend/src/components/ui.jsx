import { useEffect } from 'react';
import Icon from './Icon';
import { initials, avatarColor, moneyShort, num } from '../utils/format';

/* ---------- feedback ---------- */
export function Alert({ type = 'info', children, onClose }) {
  if (!children) return null;
  const icon = type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info';
  return (
    <div className={`alert alert-${type}`}>
      <Icon name={icon} />
      <span style={{ flex: 1 }}>{children}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 15.5, lineHeight: 1 }}
          aria-label="Dismiss"
        >
          &times;
        </button>
      )}
    </div>
  );
}

/** One shimmer block. Width/height are inline so callers can shape a row freely. */
export function Skel({ w, h, className = '', style }) {
  return (
    <span
      className={`skel ${className}`}
      style={{ display: 'block', width: w, height: h, ...style }}
    />
  );
}

const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

/** A list row: avatar, two lines, a trailing value. */
function SkelRow({ thumb = true }) {
  return (
    <div className="skel-row">
      {thumb && <Skel w={34} h={34} className="skel-block" />}
      <span className="grow">
        <Skel w="46%" h={11} />
        <Skel w="28%" h={9} className="skel-line sm" />
      </span>
      <Skel w={64} h={11} />
    </div>
  );
}

function SkelTable({ rows = 6 }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <Skel w={150} h={13} />
      </div>
      <div className="panel-body tight">{repeat(rows, (i) => <SkelRow key={i} />)}</div>
    </div>
  );
}

function SkelGrid({ cards = 6 }) {
  return (
    <div className="skel-grid">
      {repeat(cards, (i) => (
        <div className="skel-card" key={i}>
          <Skel w="100%" h={130} className="skel-block" />
          <Skel w="72%" h={13} />
          <Skel w="45%" h={10} className="skel-line sm" />
          <Skel w="34%" h={16} />
        </div>
      ))}
    </div>
  );
}

function SkelKpis({ tiles = 4 }) {
  return (
    <div className="skel-kpis">
      {repeat(tiles, (i) => (
        <div className="skel-card" key={i}>
          <Skel w={34} h={34} className="skel-block" />
          <Skel w="52%" h={19} />
          <Skel w="38%" h={9} className="skel-line sm" />
        </div>
      ))}
    </div>
  );
}

function SkelDetail() {
  return (
    <div className="skel-two">
      <div className="skel-card">
        <Skel w="100%" h={280} className="skel-block" />
        <Skel w="60%" h={17} />
        <Skel w="90%" h={11} />
        <Skel w="80%" h={11} />
      </div>
      <div className="skel-card">
        <Skel w="45%" h={26} />
        <Skel w="70%" h={11} />
        <Skel w="100%" h={40} className="skel-block" />
        <Skel w="100%" h={40} className="skel-block" />
      </div>
    </div>
  );
}

function SkelPanel({ rows = 4 }) {
  return (
    <div className="panel">
      <div className="panel-body">
        <div className="skel-page">
          <Skel w="38%" h={15} />
          {repeat(rows, (i) => <Skel key={i} w={i % 2 ? '78%' : '92%'} h={11} />)}
        </div>
      </div>
    </div>
  );
}

/**
 * Loading placeholder.
 *
 * Renders a shimmer in roughly the shape of what is arriving. The name and default
 * are unchanged so every existing <Loading /> keeps working; pass `variant` where the
 * page has a distinctive shape.
 *
 * variants: table (default) · grid · kpis · dashboard · detail · panel
 */
export function Loading({ variant = 'table', rows, cards, label = 'Loading' }) {
  let body;
  if (variant === 'grid') body = <SkelGrid cards={cards} />;
  else if (variant === 'kpis') body = <SkelKpis tiles={cards} />;
  else if (variant === 'detail') body = <SkelDetail />;
  else if (variant === 'panel') body = <SkelPanel rows={rows} />;
  else if (variant === 'dashboard') {
    body = (
      <div className="skel-page">
        <SkelKpis />
        <div className="skel-two">
          <SkelTable rows={4} />
          <SkelTable rows={4} />
        </div>
      </div>
    );
  } else if (variant === 'gate') {
    // shown before any layout exists, while the session is being checked
    body = (
      <div className="skel-gate">
        <Skel w={54} h={54} className="skel-block" />
        <Skel w={190} h={13} />
        <Skel w={130} h={10} className="skel-line sm" />
      </div>
    );
  } else body = <SkelTable rows={rows} />;

  // decorative: announce the state once, and hide the shapes from assistive tech
  return (
    <div className="skel-page" role="status" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{body}</span>
    </div>
  );
}

export function Empty({ icon = 'box', children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <p>{children}</p>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function Avatar({ name, email, size = 'md', title }) {
  return (
    <span
      className={`avatar ${size === 'sm' ? 'avatar-sm' : ''}`}
      style={{ background: avatarColor(email || name) }}
      title={title || [name, email].filter(Boolean).join(' - ') || undefined}
    >
      {initials(name)}
    </span>
  );
}

export function Stars({ rating = 0, count }) {
  const full = Math.round(Number(rating));
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name={n <= full ? 'star' : 'starOutline'} />
      ))}
      <span style={{ marginLeft: 4 }}>
        {Number(rating).toFixed(1)}
        {count !== undefined && ` (${num(count)} reviews)`}
      </span>
    </span>
  );
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-lg' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- pagination ---------- */
/**
 * `compact` drops the numbered buttons for a "Page 3 of 627" label and just the arrows.
 * A narrow panel cannot hold seven buttons plus two arrows once the page count reaches
 * three digits - the next-page arrow ends up pushed outside the panel, where it cannot
 * be clicked at all.
 */
export function Pager({ page, pages, total, perPage, onPage, compact = false }) {
  if (!total) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  let start = Math.max(1, page - 2);
  let end = Math.min(pages, page + 2);
  if (end - start < 4) {
    start = Math.max(1, end - 4);
    end = Math.min(pages, start + 4);
  }

  const nums = [];
  for (let p = start; p <= end; p++) nums.push(p);

  return (
    <div className="pager">
      <div className="info">
        Showing {from}&ndash;{to} of {num(total)}
      </div>
      {pages > 1 && compact && (
        <div className="links">
          <button onClick={() => onPage(page - 1)} disabled={page <= 1}>&larr;</button>
          <span className="pager-at">Page {num(page)} of {num(pages)}</span>
          <button onClick={() => onPage(page + 1)} disabled={page >= pages}>&rarr;</button>
        </div>
      )}

      {pages > 1 && !compact && (
        <div className="links">
          <button onClick={() => onPage(page - 1)} disabled={page <= 1}>&larr;</button>
          {start > 1 && <button onClick={() => onPage(1)}>1</button>}
          {start > 2 && <button disabled>&hellip;</button>}
          {nums.map((p) => (
            <button key={p} className={p === page ? 'on' : ''} onClick={() => onPage(p)}>
              {p}
            </button>
          ))}
          {end < pages - 1 && <button disabled>&hellip;</button>}
          {end < pages && <button onClick={() => onPage(pages)}>{pages}</button>}
          <button onClick={() => onPage(page + 1)} disabled={page >= pages}>&rarr;</button>
        </div>
      )}
    </div>
  );
}

/* ---------- KPI card ---------- */
export function Kpi({ label, value, icon, accent = 'blue', delta, deltaLabel }) {
  const dir = delta === undefined ? null : delta >= 0 ? 'up' : 'down';
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className={`kpi-ic ic-${accent}`}>
          <Icon name={icon} />
        </span>
      </div>
      <div className="kpi-value">{value}</div>
      {dir ? (
        <div className={`kpi-delta ${dir}`}>
          <Icon name={dir === 'up' ? 'arrowUp' : 'arrowDown'} />
          {Math.abs(delta)}% from last month
        </div>
      ) : (
        deltaLabel && <div className="kpi-delta flat">{deltaLabel}</div>
      )}
    </div>
  );
}

/* ---------- line chart ----------
   Rendered as plain SVG so there is no charting dependency to pull in. */
export function LineChart({ series = [], money: isMoney = true, color = '#2563eb', id = 'chart' }) {
  const W = 700;
  const H = 210;
  const padL = 46;
  const padR = 8;
  const padT = 10;
  const padB = 8;

  const values = series.map((d) => Number(d.value) || 0);
  const rawMax = Math.max(...values, 0);

  const niceMax = (n) => {
    if (n <= 0) return 10;
    const mag = Math.pow(10, Math.floor(Math.log10(n)));
    const step = [1, 2, 2.5, 5, 10].find((s) => n <= s * mag) || 10;
    return step * mag;
  };
  const max = niceMax(rawMax);

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = series.length > 1 ? innerW / (series.length - 1) : innerW;
  const x = (i) => padL + i * stepX;
  const y = (v) => padT + innerH - (max ? (v / max) * innerH : 0);

  const points = series.map((d, i) => `${x(i).toFixed(1)},${y(Number(d.value) || 0).toFixed(1)}`);
  const line = points.join(' ');
  const area = series.length
    ? `${padL},${padT + innerH} ${line} ${x(series.length - 1).toFixed(1)},${padT + innerH}`
    : '';

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const fmt = (v) => (isMoney ? moneyShort(v) : Math.round(v).toLocaleString('en-US'));

  return (
    <>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Trend over time">
          <defs>
            <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity=".22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((f) => (
            <g key={f}>
              <line
                x1={padL}
                x2={W - padR}
                y1={(padT + innerH - f * innerH).toFixed(1)}
                y2={(padT + innerH - f * innerH).toFixed(1)}
                stroke="#eef2f7"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={padL - 8}
                y={(padT + innerH - f * innerH + 3.5).toFixed(1)}
                textAnchor="end"
                fontSize="10"
                fill="#94a3b8"
                fontFamily="'Plus Jakarta Sans', sans-serif"
              >
                {fmt(max * f)}
              </text>
            </g>
          ))}

          {series.length > 0 && (
            <>
              <polygon points={area} fill={`url(#${id}-grad)`} />
              <polyline
                points={line}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {series.map((d, i) => (
                <circle
                  key={i}
                  cx={x(i).toFixed(1)}
                  cy={y(Number(d.value) || 0).toFixed(1)}
                  r="3"
                  fill="#fff"
                  stroke={color}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{`${d.label}: ${fmt(d.value)}`}</title>
                </circle>
              ))}
            </>
          )}
        </svg>
      </div>
      <div className="chart-months">
        {series.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </>
  );
}

/* ---------- bar chart (vertical columns, as on the Reports page) ---------- */
export function BarChart({ series = [], money: isMoney = true, color = '#2563eb' }) {
  const max = Math.max(...series.map((d) => Number(d.value) || 0), 1);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, paddingLeft: 4 }}>
        {series.map((d, i) => {
          const h = Math.max(2, ((Number(d.value) || 0) / max) * 100);
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div
                title={`${d.label}: ${isMoney ? moneyShort(d.value) : num(d.value)}`}
                style={{
                  height: `${h}%`,
                  background: color,
                  borderRadius: '5px 5px 2px 2px',
                  opacity: 0.85,
                  transition: 'height .3s',
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="chart-months" style={{ paddingLeft: 4 }}>
        {series.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </>
  );
}

/* ---------- horizontal bar list ---------- */
export function BarList({ rows = [], formatValue = (v) => v }) {
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  return (
    <div className="bar-list">
      {rows.map((r, i) => (
        <div className="bar-row" key={i}>
          <div className="bar-top">
            <span>
              {r.label} {r.hint && <span className="cell-sub">{r.hint}</span>}
            </span>
            <b>{formatValue(r.value)}</b>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.round(((Number(r.value) || 0) / max) * 100)}%`, background: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
