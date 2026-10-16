import { h, fmt, pct, download } from '../dom.js';
import { teamName, FORMATS } from '../../core/tournament.js';
import { resolvePhase } from '../../core/resolve.js';
import { poolStandings, bracketPlacements, finalStandings, ELIMINATION_FORMATS } from '../../core/standings.js';
import { standingsCsv, finalCsv } from '../../core/exporters.js';
import { phaseStatus } from './phases.js';

export function standingsView(app, phaseId) {
  const { t } = app;
  if (!t.phases.length) return h('div', { class: 'page' }, h('section', { class: 'card' }, h('p', {}, 'Standings appear once a phase is created.')));
  const showFinal = phaseId === 'final';
  const phase = showFinal ? null : t.phases.find((p) => p.id === phaseId) || t.phases[t.phases.length - 1];

  const nav = h('nav', { class: 'subtabs', 'aria-label': 'Standings' },
    t.phases.map((p) => h('a', { href: `#/t/${t.id}/standings/${p.id}`, class: phase?.id === p.id ? 'active' : '' }, p.name)),
    h('a', { href: `#/t/${t.id}/standings/final`, class: showFinal ? 'active' : '' }, 'Final standings'));

  const tools = h('div', { class: 'row tight no-print' },
    h('button', { class: 'btn', onclick: () => document.body.classList.toggle('projector') }, 'Projector view'),
    h('button', { class: 'btn', onclick: () => window.print() }, 'Print'),
    h('button', { class: 'btn', onclick: () => {
      const csv = showFinal ? finalCsv(t) : standingsCsv(t, phase);
      download(`${slug(t.name)}-${slug(showFinal ? 'final' : phase.name)}.csv`, csv, 'text/csv');
    } }, 'Download CSV'));

  return h('div', { class: 'page' }, nav,
    h('section', { class: 'card row space wrap' },
      h('div', {},
        h('h2', {}, showFinal ? 'Final standings' : phase.name),
        h('div', { class: 'muted small' }, showFinal ? `${t.teams.length} teams` : `${FORMATS[phase.format].label} · ${phaseStatus(phase).label}`)),
      tools),
    showFinal ? finalTable(app) : ELIMINATION_FORMATS.has(phase.format) ? bracketSection(app, phase) : poolSections(app, phase),
  );
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'standings';
}

function hasStats(rows) {
  return rows.some((r) => r.statGames > 0);
}

function standingsTable(app, rows, { carry = false } = {}) {
  const { t } = app;
  const stats = hasStats(rows);
  const ties = rows.some((r) => r.t > 0);
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table standings' },
    h('thead', {}, h('tr', {},
      h('th', {}, '#'), h('th', { class: 'left' }, 'Team'), h('th', {}, 'W'), h('th', {}, 'L'), ties ? h('th', {}, 'T') : null,
      h('th', {}, 'Pct'), h('th', { title: 'Points per game' }, 'PPG'), h('th', { title: 'Points allowed per game' }, 'PAPG'),
      h('th', { title: 'Point differential per game' }, 'Diff'),
      stats ? h('th', { title: 'Points per bonus' }, 'PPB') : null,
      stats ? h('th', { title: 'Powers / tens / negs' }, 'Tossups') : null)),
    h('tbody', {}, rows.map((r) => h('tr', {},
      h('td', {}, r.tied ? `T${r.rank}` : r.rank),
      h('td', { class: 'left' }, teamName(t, r.teamId)),
      h('td', {}, r.w), h('td', {}, r.l), ties ? h('td', {}, r.t) : null,
      h('td', {}, pct(r.pct)), h('td', {}, fmt(r.ppg)), h('td', {}, fmt(r.papg)),
      h('td', {}, fmt(r.ppg - r.papg)),
      stats ? h('td', {}, fmt(r.ppb, 2)) : null,
      stats ? h('td', {}, `${r.powers}/${r.tens}/${r.negs}`) : null))),
  ),
  carry ? h('p', { class: 'muted small' }, 'Includes games carried over from the previous phase.') : null,
  rows.some((r) => r.tied) ? h('p', { class: 'muted small' }, 'T = tied after every tiebreaker. Settle it with a tiebreaker game or the director\'s rule.') : null);
}

function poolSections(app, phase) {
  const { t } = app;
  if (phase.format !== 'pools') {
    return h('section', { class: 'card' }, standingsTable(app, poolStandings(t, phase, phase.pools[0]?.id ?? null), { carry: phase.config.carryover }));
  }
  return h('div', { class: 'pool-grid' }, phase.pools.map((pool) =>
    h('section', { class: 'card' }, h('h3', {}, pool.name), standingsTable(app, poolStandings(t, phase, pool.id), { carry: phase.config.carryover }))));
}

function bracketSection(app, phase) {
  const { t } = app;
  const placements = bracketPlacements(phase);
  return [
    h('section', { class: 'card' }, h('h3', {}, 'Bracket'), bracketDiagram(app, phase)),
    h('section', { class: 'card' }, h('h3', {}, 'Placements'),
      h('table', { class: 'table standings' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Place'), h('th', { class: 'left' }, 'Team'), h('th', {}, 'W'), h('th', {}, 'L'))),
        h('tbody', {}, placements.map((r) => h('tr', {},
          h('td', {}, r.alive ? '–' : r.tied ? `T${r.rank}` : r.rank),
          h('td', { class: 'left' }, teamName(t, r.teamId), r.alive ? h('span', { class: 'muted small' }, ' still playing') : null),
          h('td', {}, r.w), h('td', {}, r.l)))))),
  ];
}

export function bracketDiagram(app, phase) {
  const { t } = app;
  const resolved = resolvePhase(phase);
  const sections = [
    ['W', phase.format === 'double-elim' ? 'Winners bracket' : null],
    ['L', 'Losers bracket'],
    ['GF', 'Grand final'],
    ['3P', 'Third place'],
  ];
  return sections.map(([key, title]) => {
    const games = phase.games.filter((g) => g.bracket === key && resolved.get(g.id).status !== 'not-needed');
    if (!games.length) return null;
    const rounds = [...new Set(games.map((g) => g.round))].sort((a, b) => a - b);
    return h('div', { class: 'bracket-section' },
      title ? h('h4', {}, title) : null,
      h('div', { class: 'bracket' }, rounds.map((round) =>
        h('div', { class: 'bracket-round' }, games.filter((g) => g.round === round).map((g) => {
          const r = resolved.get(g.id);
          const line = (team, score) =>
            h('div', { class: `bracket-team ${r.winner && r.winner === team && r.status !== 'bye' ? 'winner' : ''} ${r.status === 'bye' && team === 'BYE' ? 'bye' : ''}` },
              h('span', {}, teamName(t, team)),
              r.status === 'final' ? h('span', { class: 'score' }, g.result.forfeit ? (r.winner === team ? 'W' : 'F') : score) : null);
          return h('div', { class: `bracket-game ${r.status}` },
            h('div', { class: 'bracket-label' }, g.label),
            line(r.teams[0], g.result?.scoreA), line(r.teams[1], g.result?.scoreB));
        })))));
  });
}

function finalTable(app) {
  const { t } = app;
  const rows = finalStandings(t);
  const phaseName = (id) => t.phases.find((p) => p.id === id)?.name ?? '';
  return h('section', { class: 'card' },
    h('table', { class: 'table standings' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Place'), h('th', { class: 'left' }, 'Team'), h('th', { class: 'left' }, 'Decided in'))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        h('td', {}, r.alive ? '–' : r.overall),
        h('td', { class: 'left' }, teamName(t, r.teamId)),
        h('td', { class: 'left muted' }, phaseName(r.phaseId)))))),
    h('p', { class: 'muted small' }, 'Teams are ordered by the last phase they played in. Places update as games are scored.'));
}
