import { renderWidget, useTrackerPlugin } from '@remnote/plugin-sdk';
import { WhyLoop } from '../WhyLoop';

/** Right sidebar panel. Follows whichever page is open. */
function WhyLoopWidget() {
  const pageId = useTrackerPlugin(async (plugin) => {
    const pane = await plugin.window.getFocusedPaneId();
    return plugin.window.getOpenPaneRemId(pane);
  });
  return (
    <div style={{ height: '100vh' }}>
      <WhyLoop pageId={pageId} />
    </div>
  );
}

renderWidget(WhyLoopWidget);
