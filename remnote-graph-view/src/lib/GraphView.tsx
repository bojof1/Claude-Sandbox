import { useEffect, useRef, useState } from 'react';
import { usePlugin, useTracker } from '@remnote/plugin-sdk';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { drag } from 'd3-drag';
import { loadGlobalGraph, loadLocalGraph, type GLink, type GNode, type GraphData } from './graphData';

type Mode = 'local' | 'global';

const COLORS = {
  node: '#8b93a1',
  center: '#7c5cff',
  match: '#f59e0b',
  child: 'rgba(139,147,161,0.45)',
  ref: 'rgba(124,92,255,0.55)',
  label: '#8b93a1',
};

function radius(n: GNode) {
  if (n.isCenter) return 11;
  return Math.min(4 + Math.sqrt(n.degree) * 2, 16);
}

function short(s: string, max = 28) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

interface Props {
  /** The Rem the "This page" graph is built around. */
  centerId: string | undefined;
  height: number | string;
  /** Called after a dot is clicked and its Rem is opened (e.g. to close the popup). */
  onOpened?: () => void;
}

export function GraphView({ centerId, height, onOpened }: Props) {
  const plugin = usePlugin();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const simRef = useRef<Simulation<GNode, GLink>>();
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  const [mode, setMode] = useState<Mode>('local');
  const [depth, setDepth] = useState(2);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showTree = useTracker((rp) => rp.settings.getSetting<boolean>('show-tree')) ?? true;
  const showRefs = useTracker((rp) => rp.settings.getSetting<boolean>('show-refs')) ?? true;
  const maxNodes = useTracker((rp) => rp.settings.getSetting<number>('max-nodes')) ?? 400;

  // 1) Load the dots and lines
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (mode === 'local' && !centerId) {
        setData(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const opts = { showTree, showRefs, maxNodes: Math.max(10, maxNodes) };
        const d =
          mode === 'local'
            ? await loadLocalGraph(plugin, centerId!, depth, opts)
            : await loadGlobalGraph(plugin, opts);
        if (!cancelled) setData(d);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [plugin, mode, depth, centerId, showTree, showRefs, maxNodes]);

  // 2) Draw them with a force layout (dots push apart, lines pull together)
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !data) return;
    const svg = select(svgEl);
    svg.selectAll('*').remove();

    const { width, height: h } = svgEl.getBoundingClientRect();
    const nodes: GNode[] = data.nodes.map((n) => ({ ...n }));
    const links: GLink[] = data.links.map((l) => ({ ...l }));

    const root = svg.append('g');
    const linkSel = root
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (l) => (l.kind === 'ref' ? COLORS.ref : COLORS.child))
      .attr('stroke-width', (l) => (l.kind === 'ref' ? 1.4 : 1));

    const nodeSel = root
      .append('g')
      .selectAll<SVGGElement, GNode>('g')
      .data(nodes)
      .join('g')
      .attr('class', 'gv-node')
      .style('cursor', 'pointer');

    nodeSel
      .append('circle')
      .attr('r', radius)
      .attr('fill', (n) => (n.isCenter ? COLORS.center : COLORS.node))
      .attr('stroke', 'rgba(255,255,255,0.6)')
      .attr('stroke-width', 1);

    nodeSel
      .append('text')
      .text((n) => short(n.label))
      .attr('x', 0)
      .attr('y', (n) => radius(n) + 11)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', COLORS.label)
      .attr('pointer-events', 'none');

    nodeSel.append('title').text((n) => n.label);

    // which Rems touch each other (for hover highlighting)
    const neighbors = new Map<string, Set<string>>();
    for (const l of links) {
      const a = l.source as string;
      const b = l.target as string;
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }

    let k = 1;
    const labelVisible = (n: GNode) => n.isCenter || n.degree >= 4 || k > 1.6 || nodes.length < 40;
    const updateLabels = () => nodeSel.select('text').attr('opacity', (n) => (labelVisible(n) ? 1 : 0));
    updateLabels();

    nodeSel
      .on('mouseenter', (_e, n) => {
        const near = neighbors.get(n.id) || new Set();
        nodeSel.attr('opacity', (m) => (m.id === n.id || near.has(m.id) ? 1 : 0.2));
        nodeSel.select('text').attr('opacity', (m) => (m.id === n.id || near.has(m.id) ? 1 : 0));
        linkSel.attr('opacity', (l) =>
          (l.source as GNode).id === n.id || (l.target as GNode).id === n.id ? 1 : 0.08
        );
      })
      .on('mouseleave', () => {
        nodeSel.attr('opacity', 1);
        linkSel.attr('opacity', 1);
        updateLabels();
      })
      .on('click', async (e, n) => {
        if ((e as any).defaultPrevented) return; // was a drag
        const rem = await plugin.rem.findOne(n.id);
        if (rem) {
          await plugin.window.openRem(rem);
          onOpenedRef.current?.();
        }
      });

    const sim = forceSimulation<GNode>(nodes)
      .force(
        'link',
        forceLink<GNode, GLink>(links)
          .id((n) => n.id)
          .distance((l) => (l.kind === 'ref' ? 70 : 45))
          .strength(0.6)
      )
      .force('charge', forceManyBody().strength(nodes.length > 300 ? -40 : -140))
      .force('center', forceCenter(width / 2, h / 2))
      .force('collide', forceCollide<GNode>().radius((n) => radius(n) + 3));
    simRef.current = sim;

    sim.on('tick', () => {
      linkSel
        .attr('x1', (l) => (l.source as GNode).x!)
        .attr('y1', (l) => (l.source as GNode).y!)
        .attr('x2', (l) => (l.target as GNode).x!)
        .attr('y2', (l) => (l.target as GNode).y!);
      nodeSel.attr('transform', (n) => `translate(${n.x},${n.y})`);
    });

    nodeSel.call(
      drag<SVGGElement, GNode>()
        .on('start', (e, n) => {
          if (!e.active) sim.alphaTarget(0.3).restart();
          n.fx = n.x;
          n.fy = n.y;
        })
        .on('drag', (e, n) => {
          n.fx = e.x;
          n.fy = e.y;
        })
        .on('end', (e, n) => {
          if (!e.active) sim.alphaTarget(0);
          n.fx = null;
          n.fy = null;
        })
    );

    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on('zoom', (e) => {
        k = e.transform.k;
        root.attr('transform', e.transform.toString());
        updateLabels();
      });
    zoomRef.current = z;
    svg.call(z).on('dblclick.zoom', null);
    svg.call(z.transform, zoomIdentity);

    return () => {
      sim.stop();
    };
  }, [data, plugin]);

  // 3) Search: light up dots whose text matches
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const q = search.trim().toLowerCase();
    select(svgEl)
      .selectAll<SVGCircleElement, GNode>('g.gv-node circle')
      .attr('fill', (n) =>
        q && n.label.toLowerCase().includes(q) ? COLORS.match : n.isCenter ? COLORS.center : COLORS.node
      )
      .attr('r', (n) => (q && n.label.toLowerCase().includes(q) ? radius(n) + 3 : radius(n)));
  }, [search, data]);

  const fit = () => {
    const svgEl = svgRef.current;
    if (svgEl && zoomRef.current) select(svgEl).call(zoomRef.current.transform, zoomIdentity);
    simRef.current?.alpha(0.6).restart();
  };

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '2px 8px',
    borderRadius: 6,
    border: '1px solid rgba(139,147,161,0.5)',
    background: active ? COLORS.center : 'transparent',
    color: active ? 'white' : 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: 6 }}>
        <button style={btn(mode === 'local')} onClick={() => setMode('local')}>
          This page
        </button>
        <button style={btn(mode === 'global')} onClick={() => setMode('global')}>
          Everything
        </button>
        {mode === 'local' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Steps
            <button style={btn(false)} onClick={() => setDepth((d) => Math.max(1, d - 1))}>
              −
            </button>
            {depth}
            <button style={btn(false)} onClick={() => setDepth((d) => Math.min(4, d + 1))}>
              +
            </button>
          </span>
        )}
        <input
          placeholder="Find…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 80px',
            minWidth: 60,
            padding: '2px 6px',
            borderRadius: 6,
            border: '1px solid rgba(139,147,161,0.5)',
            background: 'transparent',
            color: 'inherit',
          }}
        />
        <button style={btn(false)} onClick={fit}>
          Re-center
        </button>
      </div>
      <div style={{ padding: '0 8px', opacity: 0.7 }}>
        {loading
          ? 'Building graph…'
          : error
          ? `Something went wrong: ${error}`
          : mode === 'local' && !centerId
          ? 'Open a document (or click into a Rem) to see its graph.'
          : data
          ? `${data.nodes.length} dots, ${data.links.length} lines${
              data.truncated ? ' (showing the most connected ones; raise "Max dots" in settings)' : ''
            }. Purple lines = references, gray = parent-child.`
          : ''}
      </div>
      <svg ref={svgRef} style={{ flex: 1, width: '100%', minHeight: 200 }} />
    </div>
  );
}
