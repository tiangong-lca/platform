// Controlled post-deletion fixture. No Process drawer, auth, router, save or service bootstrap.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ConfigProvider } from 'antd';
import AllocationBatch from '../../../src/pages/Processes/Components/Exchange/allocationBatch';
import 'antd/dist/reset.css';

const split = [
  { '@internalReferenceToCoProduct': '1', '@allocatedFraction': '70' },
  { '@internalReferenceToCoProduct': '2', '@allocatedFraction': '30' },
];
export function fixtureExchanges() {
  return ['Product A', 'Product B', 'Electricity', 'Raw material'].map((name, index) => {
    const id = String(index + 1);
    return {
      '@dataSetInternalID': id,
      exchangeDirection: index < 2 ? 'Output' : 'Input',
      referenceToFlowDataSet: {
        '@refObjectId': `11360000-0000-4000-8000-${id.padStart(12, '0')}`,
        '@version': '01.00.000',
        '@type': 'flow data set',
        'common:shortDescription': [{ '@xml:lang': 'en', '#text': name }],
      },
      meanAmount: '100',
      resultingAmount: '100',
      ...(id === '1' ? { quantitativeReference: true } : {}),
      ...(id === '3' ? { allocations: { allocation: split.map((entry) => ({ ...entry })) } } : {}),
    };
  });
}
const root = createRoot(document.getElementById('root'));
let callbackCount = 0,
  vectorsMatch = false,
  disposed = false;
const onData = (data) => {
  callbackCount = Math.min(2, callbackCount + 1);
  // Only fixed booleans and the bounded count cross the harness boundary.
  vectorsMatch =
    JSON.stringify(data.map((row) => row['@dataSetInternalID'])) === '["1","2","3","4"]' &&
    JSON.stringify(data[2].allocations.allocation) === JSON.stringify(split) &&
    JSON.stringify(data[3].allocations.allocation) ===
      '[{"@internalReferenceToCoProduct":"2","@allocatedFraction":"100"}]';
};
flushSync(() =>
  root.render(
    React.createElement(
      ConfigProvider,
      null,
      React.createElement(AllocationBatch, { exchanges: fixtureExchanges(), lang: 'en', onData }),
    ),
  ),
);
window.batchAllocationControl = Object.freeze({
  snapshot: () => ({ callbackCount, vectorsMatch, disposed }),
  dispose: () => {
    if (!disposed) {
      flushSync(() => root.unmount());
      disposed = true;
    }
    return { callbackCount, vectorsMatch, disposed };
  },
});
