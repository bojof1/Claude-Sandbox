import { renderWidget, useTracker } from '@remnote/plugin-sdk';
import { GraphView } from '../lib/GraphView';

export const GraphSidebar = () => {
  // follow whatever document is open in the main pane
  const centerId = useTracker(async (rp) => {
    const pane = await rp.window.getFocusedPaneId();
    return rp.window.getOpenPaneRemId(pane);
  });

  return <GraphView centerId={centerId} height={520} />;
};

renderWidget(GraphSidebar);
