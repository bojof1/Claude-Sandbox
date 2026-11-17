import { useState } from 'react';
import ReactDOM from 'react-dom';
import { FeynmanCoach } from '../../src/lib/FeynmanCoach';
import { mock } from './mock-sdk';

function App() {
  const [ids, setIds] = useState<{ page?: string; line?: string }>({});
  (window as any).setPage = (page?: string, line?: string) => setIds({ page, line });
  return <div style={{ height: '100vh' }}><FeynmanCoach pageId={ids.page} lineId={ids.line} /></div>;
}
(window as any).mock = mock;
ReactDOM.render(<App />, document.getElementById('root'));
