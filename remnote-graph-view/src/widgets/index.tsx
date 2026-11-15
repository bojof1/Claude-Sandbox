import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../index.css';

async function currentRemId(plugin: ReactRNPlugin): Promise<string | undefined> {
  // the Rem your cursor is in, or else the document that is open
  const focused = await plugin.focus.getFocusedRem();
  if (focused) return focused._id;
  const pane = await plugin.window.getFocusedPaneId();
  return plugin.window.getOpenPaneRemId(pane);
}

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.settings.registerBooleanSetting({
    id: 'show-tree',
    title: 'Draw lines between parents and children',
    defaultValue: true,
  });
  await plugin.settings.registerBooleanSetting({
    id: 'show-refs',
    title: 'Draw lines for references ([[links]])',
    defaultValue: true,
  });
  await plugin.settings.registerNumberSetting({
    id: 'max-nodes',
    title: 'Max dots to draw (lower = faster)',
    defaultValue: 400,
  });

  // Big graph in a pop-up window
  await plugin.app.registerWidget('graph_popup', WidgetLocation.Popup, {
    dimensions: { height: 640, width: 960 },
  });
  // Small graph in the right sidebar that follows the open page
  await plugin.app.registerWidget('graph_sidebar', WidgetLocation.RightSidebar, {
    dimensions: { height: 'auto', width: '100%' },
    widgetTabTitle: 'Graph',
    widgetTabIcon: `${plugin.rootURL}logo.svg`,
  });

  await plugin.app.registerCommand({
    id: 'open-graph-view',
    name: 'Open Graph View',
    keyboardShortcut: 'mod+shift+g',
    action: async () => {
      const remId = await currentRemId(plugin);
      await plugin.widget.openPopup('graph_popup', { remId });
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
