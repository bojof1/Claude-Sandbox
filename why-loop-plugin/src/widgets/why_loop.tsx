import { renderWidget, useTrackerPlugin } from '@remnote/plugin-sdk';
import { WhyLoop } from '../lib/WhyLoop';

export const WhyLoopSidebar = () => {
  // the page that is open, so a new lecture can be linked to it
  const pageId = useTrackerPlugin(async (rp) => {
    const pane = await rp.window.getFocusedPaneId();
    return rp.window.getOpenPaneRemId(pane);
  });
  return (
    <div style={{ height: '100vh' }}>
      <WhyLoop pageId={pageId} />
    </div>
  );
};

renderWidget(WhyLoopSidebar);
