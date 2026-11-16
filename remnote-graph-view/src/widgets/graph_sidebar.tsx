import { useState } from 'react';
import { renderWidget, useTrackerPlugin } from '@remnote/plugin-sdk';
import { GraphView } from '../lib/GraphView';
import { WhyLoop } from '../lib/WhyLoop';

export const GraphSidebar = () => {
  // follow whatever document is open in the main pane
  const centerId = useTrackerPlugin(async (rp) => {
    const pane = await rp.window.getFocusedPaneId();
    return rp.window.getOpenPaneRemId(pane);
  });
  const [tab, setTab] = useState<'map' | 'loop'>('map');

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '6px 0',
    border: 'none',
    borderBottom: `2px solid ${active ? '#4C9AFF' : 'rgba(138,147,163,0.25)'}`,
    background: 'transparent',
    color: 'inherit',
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex' }}>
        <button style={tabStyle(tab === 'map')} onClick={() => setTab('map')}>
          Map
        </button>
        <button style={tabStyle(tab === 'loop')} onClick={() => setTab('loop')}>
          Why Loop
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {/* the map stays mounted so it keeps its place when you switch tabs */}
        <div style={{ display: tab === 'map' ? 'block' : 'none', height: '100%' }}>
          <GraphView centerId={centerId} height="100%" />
        </div>
        {tab === 'loop' && <WhyLoop pageId={centerId} />}
      </div>
    </div>
  );
};

renderWidget(GraphSidebar);
