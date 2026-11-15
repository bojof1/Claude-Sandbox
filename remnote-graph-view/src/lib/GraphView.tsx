import { useEffect, useMemo, useRef, useState } from 'react';
import { AppEvents, useAPIEventListener, usePlugin, useTrackerPlugin } from '@remnote/plugin-sdk';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { drag } from 'd3-drag';
import {
  addChild,
  addReference,
  loadGlobalGraph,
  loadLocalGraph,
  loadStudy,
  removeReference,
  type Study,
  type GLink,
  type GNode,
  type GraphData,
  type LinkKind,
} from './graphData';

type Mode = 'local' | 'global';

/** One color per branch. Index 0 is the center bubble. */
const BRANCH = ['#F2B705', '#4C9AFF', '#F2784B', '#36B37E', '#E5559B', '#00B8D9', '#8777D9', '#C9A227', '#FF8F73'];
const INK = '#8A93A3';
const MATCH = '#FF3B6B';
const LABEL_PX = 11;
const LABEL_MAX = 26;

const STUDY: Record<Study, [string, string]> = {
  due: ['#FF5A5F', 'due now'],
  weak: ['#F2994A', 'missed last time'],
  new: ['#4C9AFF', 'new'],
  strong: ['#36B37E', 'going well'],
};
const NOT_A_CARD = '#59616E';

function colorOf(n: GNode) {
  if (n.isCenter) return BRANCH[0];
  return BRANCH[1 + ((Math.max(n.group, 1) - 1) % (BRANCH.length - 1))];
}

function radius(n: GNode) {
  if (n.isCenter) return 13;
  const r = Math.min(5 + Math.sqrt(n.degree) * 1.8, 15);
  return n.folded ? Math.max(r, 10) : r;
}

function short(s: string, max = LABEL_MAX) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

interface Props {
  /** The Rem the "This page" map is built around. */
  centerId: string | undefined;
  height: number | string;
  /** Called after a bubble is clicked and its Rem is opened (e.g. to close the popup). */
  onOpened?: () => void;
}

export function GraphView({ centerId, height, onOpened }: Props) {
  const plugin = usePlugin();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const simRef = useRef<Simulation<GNode, GLink>>();
  const fitRef = useRef<() => void>(() => {});
  const relabelRef = useRef<() => void>(() => {});
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;
  /** Where each bubble was last drawn, so a refresh does not shuffle the map. */
  const posRef = useRef(new Map<string, { x: number; y: number }>());
  const tfRef = useRef<ZoomTransform>(zoomIdentity);
  const drawnKeyRef = useRef('');

  const [mode, setMode] = useState<Mode>('local');
  const [depth, setDepth] = useState(1);
  const [search, setSearch] = useState('');
  const [hideAnswers, setHideAnswers] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [peek, setPeek] = useState('');
  const [note, setNote] = useState('');
  const [kinds, setKinds] = useState<Record<LinkKind, boolean>>({ child: true, ref: true, tag: true });
  const [cardsOnly, setCardsOnly] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<{ id: string; label: string } | null>(null);
  /** The bubble whose little info card is open. */
  const [sel, setSel] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [studyOn, setStudyOn] = useState(false);
  const [study, setStudy] = useState<Map<string, Study>>(new Map());
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // live values the drawing code reads without redrawing everything
  const live = useRef({ hideAnswers, search, linkMode, linkFrom, studyOn, study, mode, centerId });
  live.current = { hideAnswers, search, linkMode, linkFrom, studyOn, study, mode, centerId };

  const fillOf = (n: GNode) => {
    const { studyOn: on, study: st } = live.current;
    if (!on) return colorOf(n);
    const s = st.get(n.id);
    return s ? STUDY[s][0] : NOT_A_CARD;
  };

  const showTree = useTrackerPlugin((rp) => rp.settings.getSetting<boolean>('show-tree')) ?? true;
  const showRefs = useTrackerPlugin((rp) => rp.settings.getSetting<boolean>('show-refs')) ?? true;
  const showTags = useTrackerPlugin((rp) => rp.settings.getSetting<boolean>('show-tags')) ?? true;
  const maxNodes = useTrackerPlugin((rp) => rp.settings.getSetting<number>('max-nodes')) ?? 600;

  // Redraw shortly after anything in the notes changes (waits for a pause in typing)
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const bump = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRefresh((n) => n + 1), 1200);
  };
  useAPIEventListener(AppEvents.GlobalRemChanged, undefined, bump);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(''), 3500);
  };

  const openRem = async (id: string) => {
    const rem = await plugin.rem.findOne(id);
    if (rem) {
      await plugin.window.openRem(rem);
      onOpenedRef.current?.();
    }
  };

  /** What a click on a bubble does: show its card, or (in link mode) pick the two ends of a new link. */
  const onBubble = async (n: GNode) => {
    const { linkMode: on, linkFrom: from } = live.current;
    if (!on) {
      setSel(n.id);
      setReveal(false);
      setAdding(false);
      return;
    }
    if (!from) return setLinkFrom({ id: n.id, label: n.label });
    setLinkFrom(null);
    setLinkMode(false);
    try {
      const result = await addReference(plugin, from.id, n.id);
      flash(
        result === 'added'
          ? `Linked "${short(from.label, 20)}" to "${short(n.label, 20)}".`
          : result === 'exists'
          ? 'Those two are already linked.'
          : 'Pick two different bubbles.'
      );
      setRefresh((r) => r + 1);
    } catch (e: any) {
      flash(`Could not add the link: ${String(e?.message || e)}`);
    }
  };
  const onBubbleRef = useRef(onBubble);
  onBubbleRef.current = onBubble;

  /** Double-click on empty space: start a new bubble under the page. */
  const onEmpty = () => {
    const { mode: m, centerId: c } = live.current;
    if (m !== 'local' || !c) return flash('Switch to "This page" to add bubbles.');
    setSel(c);
    setAdding(true);
    setAddText('');
  };
  const onEmptyRef = useRef(onEmpty);
  onEmptyRef.current = onEmpty;
  const openRef = useRef(openRem);
  openRef.current = openRem;

  const submitAdd = async () => {
    const text = addText.trim();
    if (!text || !sel) return;
    setAddText('');
    try {
      await addChild(plugin, sel, text);
      setCollapsed((c) => {
        const next = new Set(c);
        next.delete(sel);
        return next;
      });
      flash(`Added "${short(text, 24)}".`);
      setRefresh((r) => r + 1);
    } catch (e: any) {
      flash(`Could not add it: ${String(e?.message || e)}`);
    }
  };

  const unlink = async (fromId: string, toId: string) => {
    try {
      const ok = await removeReference(plugin, fromId, toId);
      flash(ok ? 'Link removed.' : 'That link is not in this bubble\'s own text.');
      setRefresh((r) => r + 1);
    } catch (e: any) {
      flash(`Could not remove the link: ${String(e?.message || e)}`);
    }
  };

  const toggleFold = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Save what you see as a PNG picture. */
  const savePicture = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    try {
      const box = svgEl.getBoundingClientRect();
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      const copy = svgEl.cloneNode(true) as SVGSVGElement;
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      copy.setAttribute('width', String(w));
      copy.setAttribute('height', String(h));
      copy.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', '100%');
      bg.setAttribute('height', '100%');
      bg.setAttribute('fill', '#1b1f27');
      copy.insertBefore(bg, copy.firstChild);
      const src =
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(new XMLSerializer().serializeToString(copy));
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = w * 2;
        canvas.height = h * 2;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) return flash('Could not make the picture.');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'bubble-map.png';
          document.body.appendChild(a);
          a.click();
          a.remove();
          flash('Picture saved to your downloads as bubble-map.png.');
        }, 'image/png');
      };
      img.onerror = () => flash('Could not make the picture.');
      img.src = src;
    } catch (e: any) {
      flash(`Could not make the picture: ${String(e?.message || e)}`);
    }
  };

  // Study colors: ask RemNote how each card is doing
  useEffect(() => {
    if (!studyOn || !data) return;
    let cancelled = false;
    loadStudy(
      plugin,
      data.nodes.filter((n) => n.isCard).map((n) => n.id)
    )
      .then((m) => !cancelled && setStudy(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [studyOn, data, plugin]);

  // 1) Load the bubbles and lines
  const loadingRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (mode === 'local' && !centerId) {
        setData(null);
        return;
      }
      if (loadingRef.current) return bump(); // one load at a time; try again in a moment
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const opts = { showTree, showRefs, showTags, maxNodes: Math.max(10, maxNodes) };
        const d =
          mode === 'local'
            ? await loadLocalGraph(plugin, centerId!, depth, opts)
            : await loadGlobalGraph(plugin, opts);
        if (!cancelled) setData(d);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        loadingRef.current = false;
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [plugin, mode, depth, centerId, showTree, showRefs, showTags, maxNodes, refresh]);

  // 1b) Apply the on-screen switches (line types, cards only) without reloading
  const view = useMemo<GraphData | null>(() => {
    if (!data) return null;
    // folded branches: hide everything under a folded bubble
    const kidsOf = new Map<string, string[]>();
    for (const n of data.nodes) {
      if (!n.parentId) continue;
      if (!kidsOf.has(n.parentId)) kidsOf.set(n.parentId, []);
      kidsOf.get(n.parentId)!.push(n.id);
    }
    const hidden = new Set<string>();
    const foldCount = new Map<string, number>();
    for (const id of collapsed) {
      let count = 0;
      let queue = kidsOf.get(id) || [];
      while (queue.length) {
        const after: string[] = [];
        for (const k of queue) {
          if (hidden.has(k)) continue;
          hidden.add(k);
          count++;
          after.push(...(kidsOf.get(k) || []));
        }
        queue = after;
      }
      if (count) foldCount.set(id, count);
    }
    
    let links = data.links.filter(
      (l) => kinds[l.kind] && !hidden.has(l.source as string) && !hidden.has(l.target as string)
    );
    let keep = new Set(data.nodes.filter((n) => !hidden.has(n.id)).map((n) => n.id));
    if (cardsOnly) {
      const byId = new Map(data.nodes.map((n) => [n.id, n]));
      keep = new Set(
        data.nodes.filter((n) => !hidden.has(n.id) && (n.isCard || n.isCenter)).map((n) => n.id)
      );
      // also keep the ideas that cards point at with a [[link]] or a tag
      for (const l of links) {
        if (l.kind === 'child') continue;
        const a = l.source as string;
        const b = l.target as string;
        if (byId.get(a)?.isCard) keep.add(b);
        if (byId.get(b)?.isCard) keep.add(a);
      }
      links = links.filter((l) => keep.has(l.source as string) && keep.has(l.target as string));
    }
    const degree = new Map<string, number>();
    for (const l of links) {
      degree.set(l.source as string, (degree.get(l.source as string) || 0) + 1);
      degree.set(l.target as string, (degree.get(l.target as string) || 0) + 1);
    }
    const nodes = data.nodes
      .filter(
        (n) =>
          keep.has(n.id) &&
          (n.isCenter || degree.has(n.id) || foldCount.has(n.id) || (cardsOnly && n.isCard))
      )
      .map((n) => ({ ...n, degree: degree.get(n.id) || 0, folded: foldCount.get(n.id) }));
    return { nodes, links, truncated: data.truncated };
  }, [data, kinds, cardsOnly, collapsed]);

  // 2) Draw them (bubbles push apart, lines pull together)
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !view) return;
    const svg = select(svgEl);
    svg.selectAll('*').remove();

    const box = svgEl.getBoundingClientRect();
    const width = box.width || 600;
    const h = box.height || 400;

    // same page as last time = a refresh: keep bubbles where they were and keep the zoom
    const key = `${mode}|${centerId}`;
    const isRefresh = drawnKeyRef.current === key && posRef.current.size > 0;
    drawnKeyRef.current = key;
    if (!isRefresh) posRef.current = new Map();
    const old = isRefresh ? posRef.current : new Map<string, { x: number; y: number }>();

    const links: GLink[] = view.links.map((l) => ({ ...l }));
    const nodes: GNode[] = view.nodes.map((n) => ({ ...n, ...(old.get(n.id) || {}) }));
    if (isRefresh) {
      // new bubbles start next to something they are joined to, then drift into place
      const byId = new Map(nodes.map((n) => [n.id, n]));
      for (const l of links) {
        const a = byId.get(l.source as string);
        const b = byId.get(l.target as string);
        if (!a || !b) continue;
        const [fresh, anchor] = a.x === undefined ? [a, b] : [b, a];
        if (fresh.x === undefined && anchor.x !== undefined) {
          fresh.x = anchor.x + (Math.random() - 0.5) * 40;
          fresh.y = anchor.y! + (Math.random() - 0.5) * 40;
        }
      }
    }
    const big = nodes.length > 150;

    const root = svg.append('g');
    const linkSel = root
      .append('g')
      .attr('fill', 'none')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('stroke-linecap', 'round')
      .attr('stroke-width', (l) => (l.kind === 'child' ? 1.6 : 1.3))
      .attr('stroke-dasharray', (l) => (l.kind === 'ref' ? '6 4' : l.kind === 'tag' ? '2 5' : null))
      .attr('stroke-opacity', (l) => (l.kind === 'child' ? 0.4 : 0.75));

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
      .attr('fill', fillOf)
      .attr('fill-opacity', (n) => (n.isCenter ? 1 : 0.9))
      .attr('stroke', (n) => (n.isCenter ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)'))
      .attr('stroke-width', (n) => (n.isCenter ? 2.5 : 1));

    // a folded bubble shows how many bubbles are tucked inside it
    nodeSel
      .filter((n) => !!n.folded)
      .append('text')
      .attr('class', 'gv-fold')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#fff')
      .attr('font-size', 9)
      .attr('font-weight', 700)
      .attr('pointer-events', 'none')
      .text((n) => `+${n.folded}`);

    const textSel = nodeSel
      .append('text')
      .attr('class', 'gv-name')
      .attr('text-anchor', 'middle')
      .attr('fill', INK)
      .attr('font-weight', (n) => (n.isCenter ? 700 : 400))
      .attr('pointer-events', 'none')
      .style('display', 'none');

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

    const sim = forceSimulation<GNode>(nodes)
      .force(
        'link',
        forceLink<GNode, GLink>(links)
          .id((n) => n.id)
          .distance((l) => (l.kind === 'child' ? (big ? 55 : 80) : big ? 90 : 130))
          .strength((l) => (l.kind === 'child' ? 0.7 : 0.15))
      )
      .force('charge', forceManyBody().strength(big ? -160 : -420))
      .force('x', forceX(width / 2).strength(0.04))
      .force('y', forceY(h / 2).strength(0.04))
      .force('collide', forceCollide<GNode>().radius((n) => radius(n) + (big ? 8 : 16)))
      .velocityDecay(0.3)
      .stop();
    simRef.current = sim;
    // A new map gets a head start, then you watch it finish settling.
    // A refresh skips the head start so the bubbles you know stay put.
    if (!isRefresh) sim.tick(big ? 90 : 60);

    // line colors follow the bubble farther from the center
    linkSel.attr('stroke', (l) => {
      if (l.kind !== 'child') return INK;
      const s = l.source as GNode;
      const t = l.target as GNode;
      return colorOf(s.isCenter ? t : s.group ? s : t);
    });

    let tf: ZoomTransform = zoomIdentity;
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    let hovered: string | null = null;

    const labelText = (n: GNode) => short(live.current.hideAnswers ? n.hiddenLabel : n.label);
    const isMatch = (n: GNode) => {
      const q = live.current.search.trim().toLowerCase();
      return !!q && n.label.toLowerCase().includes(q);
    };

    /** Show as many names as fit without sitting on top of each other. */
    const relabel = () => {
      const k = tf.k;
      const near = hovered ? neighbors.get(hovered) || new Set<string>() : null;
      const rank = (n: GNode) =>
        (n.id === hovered ? 1e6 : 0) +
        (near?.has(n.id) ? 1e5 : 0) +
        (isMatch(n) ? 1e4 : 0) +
        (n.isCenter ? 1e3 : 0) +
        n.degree;
      const order = [...nodes].sort((a, b) => rank(b) - rank(a));
      const placed: [number, number, number, number][] = [];
      const show = new Set<string>();
      // bubbles count as taken space too, so names do not sit on other bubbles
      const bubbles = nodes.map((m) => {
        const r = radius(m) * k + 2;
        return [m.id, m.x! * k + tf.x - r, m.y! * k + tf.y - r, r * 2] as const;
      });
      for (const n of order) {
        if (near && n.id !== hovered && !near.has(n.id)) continue;
        const sx = n.x! * k + tf.x;
        const sy = n.y! * k + tf.y;
        if (sx < -40 || sx > width + 40 || sy < -20 || sy > h + 20) continue;
        const w = labelText(n).length * 6.6 + 12;
        const x0 = sx - w / 2;
        const y0 = sy + radius(n) * k + 2;
        const hit =
          placed.some(
            ([px, py, pw, ph]) => x0 < px + pw && x0 + w > px && y0 < py + ph && y0 + 16 > py
          ) ||
          bubbles.some(
            ([id, bx, by, bd]) =>
              id !== n.id && x0 < bx + bd && x0 + w > bx && y0 < by + bd && y0 + 16 > by
          );
        if (hit && n.id !== hovered && !n.isCenter) continue;
        placed.push([x0, y0, w, 15]);
        show.add(n.id);
      }
      textSel
        .style('display', (n) => (show.has(n.id) ? null : 'none'))
        .text(labelText)
        .attr('font-size', LABEL_PX / k)
        .attr('y', (n) => radius(n) + (LABEL_PX + 2) / k);
    };
    relabelRef.current = relabel;

    const place = () => {
      linkSel.attr('d', (l) => {
        const s = l.source as GNode;
        const t = l.target as GNode;
        const dx = t.x! - s.x!;
        const dy = t.y! - s.y!;
        // a gentle bend, like a hand-drawn branch
        const mx = (s.x! + t.x!) / 2 - dy * 0.12;
        const my = (s.y! + t.y!) / 2 + dx * 0.12;
        return `M${s.x},${s.y}Q${mx},${my} ${t.x},${t.y}`;
      });
      nodeSel.attr('transform', (n) => `translate(${n.x},${n.y})`);
      for (const n of nodes) posRef.current.set(n.id, { x: n.x!, y: n.y! });
    };

    let ticks = 0;
    sim.on('tick', () => {
      place();
      if (++ticks % 8 === 0) relabel();
    });
    let userZoomed = false;
    sim.on('end', () => {
      // once it has settled, frame the whole map (unless you already zoomed yourself)
      if (!isRefresh && !userZoomed) fit();
      relabel();
    });

    nodeSel
      .on('mouseenter', (_e, n) => {
        hovered = n.id;
        const near = neighbors.get(n.id) || new Set();
        nodeSel.attr('opacity', (m) => (m.id === n.id || near.has(m.id) ? 1 : 0.15));
        linkSel.attr('opacity', (l) =>
          (l.source as GNode).id === n.id || (l.target as GNode).id === n.id ? 1 : 0.06
        );
        setPeek(live.current.hideAnswers ? n.hiddenLabel : n.label);
        relabel();
      })
      .on('mouseleave', () => {
        hovered = null;
        nodeSel.attr('opacity', 1);
        linkSel.attr('opacity', 1);
        setPeek('');
        relabel();
      })
      .on('click', (e, n) => {
        if ((e as any).defaultPrevented) return; // was a drag
        // wait a beat, so a double-click can open the Rem before the card pops up
        clearTimeout(clickTimer);
        if (live.current.linkMode) onBubbleRef.current(n);
        else clickTimer = setTimeout(() => onBubbleRef.current(n), 260);
      })
      .on('dblclick', (e, n) => {
        e.stopPropagation();
        clearTimeout(clickTimer);
        if (!live.current.linkMode) openRef.current(n.id);
      });

    nodeSel.call(
      drag<SVGGElement, GNode>()
        .on('start', (e, n) => {
          if (!e.active) sim.alphaTarget(0.25).restart();
          n.fx = n.x;
          n.fy = n.y;
        })
        .on('drag', (e, n) => {
          n.fx = e.x;
          n.fy = e.y;
        })
        .on('end', (e, n) => {
          if (!e.active) sim.alphaTarget(0);
          // let go: the bubble springs back and its neighbors sway with it
          n.fx = null;
          n.fy = null;
        })
    );

    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 8])
      .on('zoom', (e) => {
        if (e.sourceEvent) userZoomed = true;
        tf = e.transform;
        tfRef.current = tf;
        root.attr('transform', tf.toString());
        relabel();
      });
    zoomRef.current = z;
    svg.call(z).on('dblclick.zoom', null);
    svg.on('dblclick', () => onEmptyRef.current());

    /** Zoom so the whole map fits in the window. */
    const fit = () => {
      if (!nodes.length) return;
      const xs = nodes.map((n) => n.x!);
      const ys = nodes.map((n) => n.y!);
      const x0 = Math.min(...xs) - 40;
      const x1 = Math.max(...xs) + 40;
      const y0 = Math.min(...ys) - 30;
      const y1 = Math.max(...ys) + 40;
      const k = Math.min(width / (x1 - x0), h / (y1 - y0), 1.6);
      const t = zoomIdentity
        .translate(width / 2 - (k * (x0 + x1)) / 2, h / 2 - (k * (y0 + y1)) / 2)
        .scale(k);
      svg.call(z.transform, t);
    };
    fitRef.current = fit;

    place();
    if (isRefresh) svg.call(z.transform, tfRef.current);
    else fit();
    // the motion: let the map finish settling on screen
    sim.alpha(isRefresh ? 0.25 : 0.5).restart();

    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, plugin]);

  // 3) Find: light up bubbles whose text matches. Also refresh names when answers are hidden or shown.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const q = search.trim().toLowerCase();
    const hit = (n: GNode) => !!q && n.label.toLowerCase().includes(q);
    select(svgEl)
      .selectAll<SVGCircleElement, GNode>('g.gv-node circle')
      .attr('fill', (n) => (hit(n) ? MATCH : fillOf(n)))
      .attr('r', (n) => (hit(n) ? radius(n) + 4 : radius(n)))
      .attr('stroke', (n) =>
        linkFrom?.id === n.id || sel === n.id
          ? '#ffffff'
          : n.isCenter
          ? 'rgba(255,255,255,0.9)'
          : 'rgba(255,255,255,0.35)'
      )
      .attr('stroke-dasharray', (n) => (n.folded ? '3 2' : null))
      .attr('stroke-width', (n) =>
        linkFrom?.id === n.id ? 4 : sel === n.id ? 3 : n.folded ? 2 : n.isCenter ? 2.5 : 1
      );
    relabelRef.current();
  }, [search, hideAnswers, view, linkFrom, sel, studyOn, study]);

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px',
    borderRadius: 999,
    border: '1px solid rgba(138,147,163,0.5)',
    background: active ? '#4C9AFF' : 'transparent',
    color: active ? 'white' : 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  const selNode = sel ? data?.nodes.find((n) => n.id === sel) : undefined;
  const selKids = selNode ? data!.nodes.filter((n) => n.parentId === selNode.id) : [];
  const nameOf = (id: string) => data?.nodes.find((n) => n.id === id)?.label || 'a note not on this map';
  const anyCloze = !!data?.nodes.some((n) => n.hasCloze);
  const anyCard = !!data?.nodes.some((n) => n.isCard);
  const status = note
    ? note
    : linkMode
    ? linkFrom
      ? `Now click the bubble to link "${short(linkFrom.label, 24)}" to.`
      : 'Link mode: click the bubble the link starts from.'
    : loading && !data
    ? 'Building your map…'
    : error
    ? `Something went wrong: ${error}`
    : mode === 'local' && !centerId
    ? 'Open a page (or click into a Rem) to see its map.'
    : view && view.nodes.length <= 1
    ? 'Nothing is connected here yet. Add bullets under this page, or [[links]] and tags, and they will show up.'
    : view
    ? `${view.nodes.length} bubbles, ${view.links.length} lines${
        view.truncated ? '. Some are left out to keep it fast (raise "Most bubbles" in settings to see all)' : ''
      }`
    : '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height,
        minHeight: 420,
        fontSize: 12,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: 6 }}>
        <button style={btn(mode === 'local')} onClick={() => setMode('local')}>
          This page
        </button>
        <button style={btn(mode === 'global')} onClick={() => setMode('global')}>
          Everything
        </button>
        {mode === 'local' && (
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            title="How many steps to follow links and tags away from this page"
          >
            Reach
            <button style={btn(false)} onClick={() => setDepth((d) => Math.max(0, d - 1))}>
              −
            </button>
            {depth}
            <button style={btn(false)} onClick={() => setDepth((d) => Math.min(3, d + 1))}>
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
            padding: '5px 10px',
            borderRadius: 999,
            border: '1px solid rgba(138,147,163,0.5)',
            background: 'transparent',
            color: 'inherit',
          }}
        />
        <button
          style={btn(linkMode)}
          onClick={() => {
            setLinkMode((v) => !v);
            setLinkFrom(null);
          }}
          title="Link two bubbles: click one, then the other"
        >
          {linkMode ? 'Cancel link' : 'Link bubbles'}
        </button>
        {anyCloze && (
          <button
            style={btn(hideAnswers)}
            onClick={() => setHideAnswers((v) => !v)}
            title="Hide or show the answers of cloze cards"
          >
            {hideAnswers ? 'Answers hidden' : 'Answers shown'}
          </button>
        )}
        {anyCard && (
          <button
            style={btn(cardsOnly)}
            onClick={() => setCardsOnly((v) => !v)}
            title="Show only flashcards and the ideas they link to"
          >
            Cards only
          </button>
        )}
        {anyCard && (
          <button
            style={btn(studyOn)}
            onClick={() => setStudyOn((v) => !v)}
            title="Color flashcards by how you are doing: due, missed, new, going well"
          >
            Study colors
          </button>
        )}
        {collapsed.size > 0 && (
          <button style={btn(false)} onClick={() => setCollapsed(new Set())} title="Open every folded branch">
            Unfold all
          </button>
        )}
        <button style={btn(false)} onClick={savePicture} title="Save the map you see as a picture">
          Save picture
        </button>
        <button style={btn(false)} onClick={() => fitRef.current()} title="Zoom to fit the whole map">
          Fit
        </button>
        <button style={btn(false)} onClick={() => setRefresh((n) => n + 1)} title="Redraw the map now">
          ↻
        </button>
        <button style={btn(showHelp)} onClick={() => setShowHelp((v) => !v)} title="How this works">
          ?
        </button>
      </div>
      <div
        style={{
          padding: '0 8px',
          opacity: note || linkMode ? 1 : 0.7,
          minHeight: 20,
          fontWeight: note || linkMode ? 600 : 400,
        }}
      >
        {peek || status}
      </div>
      <svg ref={svgRef} style={{ flex: 1, width: '100%', minHeight: 200, touchAction: 'none' }} />
      <div style={{ display: 'flex', gap: 14, padding: '4px 8px', opacity: 0.75, flexWrap: 'wrap' }}>
        <span style={{ opacity: 0.8 }}>Lines (click to hide):</span>
        {(
          [
            ['child', null, 'outline'],
            ['ref', '6 4', '[[link]]'],
            ['tag', '2 5', 'tag'],
          ] as [LinkKind, string | null, string][]
        ).map(([kind, dash, text]) => (
          <button
            key={kind}
            onClick={() => setKinds((k) => ({ ...k, [kind]: !k[kind] }))}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              padding: 0,
              cursor: 'pointer',
              fontSize: 12,
              opacity: kinds[kind] ? 1 : 0.35,
              textDecoration: kinds[kind] ? 'none' : 'line-through',
            }}
          >
            <Key dash={dash} text={text} />
          </button>
        ))}
        {studyOn ? (
          (Object.keys(STUDY) as Study[]).map((k) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: STUDY[k][0] }} />
              {STUDY[k][1]}
            </span>
          ))
        ) : (
          <span>Colors = branches</span>
        )}
      </div>
      {selNode && (
        <div
          style={{
            position: 'absolute',
            left: 8,
            bottom: 34,
            width: 320,
            maxWidth: 'calc(100% - 16px)',
            maxHeight: '55%',
            overflowY: 'auto',
            padding: 10,
            borderRadius: 10,
            background: '#1f2430',
            color: '#e8ebf0',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            lineHeight: 1.45,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <b style={{ flex: 1, fontSize: 13 }}>
              {hideAnswers && !reveal ? selNode.hiddenLabel : selNode.label}
            </b>
            <button style={{ ...btn(false), padding: '1px 7px' }} onClick={() => setSel(null)} title="Close">
              ✕
            </button>
          </div>
          {selNode.back && (
            <div style={{ marginTop: 4 }}>
              <span style={{ opacity: 0.6 }}>Answer: </span>
              {hideAnswers && !reveal ? '[…]' : selNode.back}
            </div>
          )}
          {hideAnswers && !reveal && (selNode.back || selNode.hasCloze) && (
            <button style={{ ...btn(false), marginTop: 4, padding: '2px 8px' }} onClick={() => setReveal(true)}>
              Show answer
            </button>
          )}
          {studyOn && study.get(selNode.id) && (
            <div style={{ marginTop: 4, color: STUDY[study.get(selNode.id)!][0] }}>
              Card: {STUDY[study.get(selNode.id)!][1]}
            </div>
          )}
          {selKids.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <span style={{ opacity: 0.6 }}>Under it:</span>
              <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
                {selKids.slice(0, 8).map((k) => (
                  <li key={k.id} style={{ cursor: 'pointer' }} onClick={() => setSel(k.id)}>
                    {short(hideAnswers && !reveal ? k.hiddenLabel : k.label, 60)}
                  </li>
                ))}
              </ul>
              {selKids.length > 8 && <span style={{ opacity: 0.6 }}>and {selKids.length - 8} more</span>}
            </div>
          )}
          {selNode.refs.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <span style={{ opacity: 0.6 }}>Links to:</span>
              {selNode.refs.map((id) => (
                <div key={id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                  <span style={{ flex: 1 }}>{short(nameOf(id), 40)}</span>
                  <button
                    style={{ ...btn(false), padding: '1px 8px' }}
                    onClick={() => unlink(selNode.id, id)}
                    title="Remove this link from the note"
                  >
                    Unlink
                  </button>
                </div>
              ))}
            </div>
          )}
          {selNode.mentions.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <span style={{ opacity: 0.6 }}>Linked from:</span>
              {selNode.mentions.map((m) => (
                <div key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                  <span style={{ flex: 1 }}>{short(m.parentId ? nameOf(m.parentId) : 'a bullet', 40)}</span>
                  <button
                    style={{ ...btn(false), padding: '1px 8px' }}
                    onClick={() => unlink(m.id, selNode.id)}
                    title="Turn that link back into a plain word"
                  >
                    Unlink
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <button style={btn(true)} onClick={() => openRem(selNode.id)}>
              Open
            </button>
            <button style={btn(adding)} onClick={() => setAdding((v) => !v)}>
              Add bubble
            </button>
            <button
              style={btn(false)}
              onClick={() => {
                setLinkMode(true);
                setLinkFrom({ id: selNode.id, label: selNode.label });
                setSel(null);
              }}
            >
              Link to…
            </button>
            {(selKids.length > 0 || collapsed.has(selNode.id)) && (
              <button style={btn(false)} onClick={() => toggleFold(selNode.id)}>
                {collapsed.has(selNode.id) ? 'Unfold' : 'Fold'}
              </button>
            )}
          </div>
          {adding && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                autoFocus
                placeholder="New bubble under this one…"
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAdd();
                  if (e.key === 'Escape') setAdding(false);
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(138,147,163,0.6)',
                  background: 'transparent',
                  color: 'inherit',
                }}
              />
              <button style={btn(true)} onClick={submitAdd}>
                Add
              </button>
            </div>
          )}
        </div>
      )}
      {showHelp && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            right: 8,
            width: 300,
            maxWidth: '90%',
            padding: 12,
            borderRadius: 10,
            background: '#1f2430',
            color: '#e8ebf0',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            lineHeight: 1.5,
          }}
        >
          <b>How this works</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
            <li>Each bubble is one Rem (one bullet). The gold bubble is the page you are on.</li>
            <li>Solid lines follow your outline. Each branch has its own color.</li>
            <li>Dashed lines are [[links]]. Dotted lines are tags.</li>
            <li>Click a bubble to peek at it: its notes, its answer, and what it links to.</li>
            <li>Double-click a bubble (or press Open) to go to it. The map follows you there.</li>
            <li>Double-click empty space to add a new bubble to the page. "Add bubble" on a card adds one under that bubble.</li>
            <li>"Link bubbles" or "Link to…": pick two bubbles to add a [[link]]. "Unlink" on a card removes one.</li>
            <li>"Fold" tucks a branch away. The bubble shows how many are inside.</li>
            <li>"Study colors" paints your flashcards: due, missed, new, going well.</li>
            <li>"Save picture" saves the map you see as an image.</li>
            <li>The map updates by itself a moment after you stop typing.</li>
            <li>Drag a bubble and let go to watch it spring back. Scroll or pinch to zoom.</li>
            <li>Point at a bubble to read it in full and see what it touches.</li>
            <li>Names hide when they would overlap. Zoom in to see more.</li>
            <li>"Answers hidden" blanks out cloze answers so you can quiz yourself.</li>
            <li>"Cards only" keeps your flashcards and the ideas they link to.</li>
            <li>"Reach" is how many steps to follow links and tags away from this page.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function Key({ dash, text }: { dash: string | null; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <svg width="26" height="6">
        <line
          x1="1"
          y1="3"
          x2="25"
          y2="3"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={dash ?? undefined}
        />
      </svg>
      {text}
    </span>
  );
}
