import { renderWidget, usePlugin, useTrackerPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import { GraphView } from '../lib/GraphView';

export const GraphPopup = () => {
  const plugin = usePlugin();
  const ctx = useTrackerPlugin(() => plugin.widget.getWidgetContext<WidgetLocation.Popup>());
  const centerId: string | undefined = ctx?.contextData?.remId ?? ctx?.focusedRemId;

  return (
    <div style={{ width: '100%', height: 800 }}>
      <GraphView centerId={centerId} height={800} onOpened={() => plugin.widget.closePopup()} />
    </div>
  );
};

renderWidget(GraphPopup);
