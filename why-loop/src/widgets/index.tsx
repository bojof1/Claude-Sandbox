import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.app.registerWidget('why_loop', WidgetLocation.RightSidebar, {
    // fill the whole sidebar (the SDK types only list numbers, but a percent works as CSS)
    dimensions: { height: '100%' as any, width: '100%' },
    widgetTabTitle: 'Why Loop',
    widgetTabIcon: `${plugin.rootURL}logo.svg`,
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
