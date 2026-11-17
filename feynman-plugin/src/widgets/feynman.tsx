import { useRef } from 'react';
import { renderWidget, useTrackerPlugin } from '@remnote/plugin-sdk';
import { FeynmanCoach } from '../lib/FeynmanCoach';

export const FeynmanSidebar = () => {
  // the page that is open
  const pageId = useTrackerPlugin(async (rp) => {
    const pane = await rp.window.getFocusedPaneId();
    return rp.window.getOpenPaneRemId(pane);
  });
  // the line the cursor is on; keep the last one, since clicking into the sidebar clears it
  const focused = useTrackerPlugin(async (rp) => (await rp.focus.getFocusedRem())?._id);
  const lastLine = useRef<string | undefined>(undefined);
  if (focused) lastLine.current = focused;
  return (
    <div style={{ height: '100vh' }}>
      <FeynmanCoach pageId={pageId} lineId={lastLine.current} />
    </div>
  );
};

renderWidget(FeynmanSidebar);
