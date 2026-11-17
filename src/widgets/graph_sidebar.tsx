import { renderWidget, useTrackerPlugin } from '@remnote/plugin-sdk';
import { GraphView } from '../lib/GraphView';

export const GraphSidebar = () => {
  // follow whatever document is open in the main pane
  const centerId = useTrackerPlugin(async (rp) => {
    const pane = await rp.window.getFocusedPaneId();
    return rp.window.getOpenPaneRemId(pane);
  });
  return <GraphView centerId={centerId} height="100vh" />;
};

renderWidget(GraphSidebar);
