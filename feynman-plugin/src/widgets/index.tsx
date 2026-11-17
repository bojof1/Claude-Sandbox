import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../index.css';

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.app.registerWidget('feynman', WidgetLocation.RightSidebar, {
    // fill the whole sidebar (the SDK types only list numbers, but a percent works as CSS)
    dimensions: { height: '100%' as any, width: '100%' },
    widgetTabTitle: 'Feynman Coach',
    widgetTabIcon: `${plugin.rootURL}logo.svg`,
  });
  await plugin.app.registerCommand({
    id: 'feynman-open',
    name: 'Feynman Coach: teach this page',
    action: async () => {
      await plugin.window.openWidgetInRightSidebar('feynman');
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
