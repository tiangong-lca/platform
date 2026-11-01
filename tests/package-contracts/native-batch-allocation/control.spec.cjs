// Explicitly selected by the native worker; never discovered by the canonical config.
const { check } = require('../../../scripts/e2e/batch-allocation-native-policy.cjs');
const config = require('./config.cjs');

async function waitForDialogReady(dialog, expect) {
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate(async (node) => {
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const preparingOrMoving = Array.from(node.classList).some((name) =>
          /-(?:appear|enter|leave)(?:-|$)/.test(name),
        );
        return (
          !preparingOrMoving &&
          node.getAnimations().every((animation) => {
            const endTime = animation.effect?.getComputedTiming().endTime;
            return (
              !Number.isFinite(endTime) || (!animation.pending && animation.playState !== 'running')
            );
          })
        );
      }),
    )
    .toBe(true);
}
async function runControl({
  page: nativePage,
  control,
  expect,
  observer,
  contract,
  binding,
  beforePublish = async () => {},
  afterPublish = async () => {},
  onOwner = () => {},
}) {
  check(config.controls.includes(control), 'invalid_control');
  const counters = { pageErrorCount: 0, consoleErrorCount: 0, counterOverflow: false };
  const increment = (key) => {
    if (counters[key] === 255) counters.counterOverflow = true;
    else counters[key]++;
  };
  const onPageError = () => increment('pageErrorCount');
  const onConsole = (item) => {
    if (item.type() === 'error') increment('consoleErrorCount');
  };
  let storedRoot,
    ownerToken,
    capture,
    originalThrew = false,
    originalError,
    observerFailed = false,
    diagnosticFailed = false;
  try {
    nativePage.on('pageerror', onPageError);
  } catch {
    observerFailed = true;
  }
  try {
    nativePage.on('console', onConsole);
  } catch {
    observerFailed = true;
  }
  const batch = nativePage.getByRole('dialog', {
    name: 'Batch allocation',
    exact: true,
    includeHidden: true,
  });
  try {
    await nativePage.getByRole('button', { name: 'Batch allocation', exact: true }).click();
    await waitForDialogReady(batch, expect);
    // Separately labeled deterministic lookup setup; no added canonical readiness.
    await expect(
      batch.getByRole('button', { name: 'Add product allocation', exact: true }),
    ).toBeEnabled();
    try {
      storedRoot = await batch.elementHandle();
      check(storedRoot, 'stored_root_missing');
      ownerToken = await storedRoot.evaluate(observer.installBatchAllocationObserver);
      onOwner(ownerToken);
    } catch {
      observerFailed = true;
    }
    try {
      await batch
        .getByRole('row')
        .filter({ hasText: 'Raw material' })
        .getByRole('checkbox')
        .check();
      await batch.getByRole('button', { name: 'Add product allocation', exact: true }).click();
      await batch.getByRole('combobox', { name: 'Target product' }).click();
      await nativePage.getByText('Product B (#2)', { exact: true }).last().click();
      if (control !== 'missing-share')
        await batch.getByRole('spinbutton').fill(control === 'total-99' ? '99' : '100');
      if (control === 'cancel') {
        await batch.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(batch).toBeHidden();
      } else {
        // Explicit native negative-control gate, not a canonical wait or force.
        if (control !== 'valid')
          await expect(batch.getByRole('button', { name: 'OK', exact: true })).toBeEnabled();
        await batch.getByRole('button', { name: 'OK', exact: true }).click();
        if (control === 'valid') await expect(batch).toBeHidden();
        else {
          await expect(batch.getByRole('alert')).toBeVisible();
          await expect(batch).toBeVisible();
        }
      }
      const result = await nativePage.evaluate(() => window.batchAllocationControl.snapshot());
      check(
        result.callbackCount === (control === 'valid' ? 1 : 0) &&
          (control !== 'valid' || result.vectorsMatch),
        'callback_vector_control_failed',
      );
    } catch (error) {
      originalThrew = true;
      originalError = error;
    }
  } catch (error) {
    originalThrew = true;
    originalError = error;
  } finally {
    try {
      capture = await nativePage.evaluate(observer.finishBatchAllocationObserver, ownerToken);
      contract.assertCapture(capture);
    } catch {
      diagnosticFailed = true;
    }
    try {
      await beforePublish();
      const report = contract.buildReport(
        binding.source,
        capture,
        counters,
        originalThrew ? 'failed' : 'passed',
        binding.identity,
        observerFailed || diagnosticFailed,
      );
      contract.writeReport(binding, report);
      await afterPublish();
      check(report.captureStatus === 'complete', 'native_witness_incomplete');
      // First planned trajectories supply the bounded rendered-shape checkpoints.
      const initial = capture.slots.initial.snapshot;
      check(
        initial?.counts.rawRow === 1 &&
          initial.counts.rawCheckbox === 1 &&
          initial.counts.target === 0 &&
          initial.counts.share === 0,
        'native_initial_shape',
      );
      if (control !== 'cancel')
        check(capture.slots['first-ok-capture'].status === 'observed', 'native_ok_delivery');
      if (control === 'missing-share')
        check(
          capture.slots['first-share-input-capture'].status === 'not-observed',
          'native_omitted_share',
        );
      if (control === 'total-99')
        check(
          capture.slots['first-share-input-capture'].snapshot?.shareMatches100 === 'false',
          'native_99_comparison',
        );
      if (control === 'missing-share' || control === 'total-99')
        check(
          capture.slots.final.snapshot?.alertVisibility.invalid === 1,
          'native_rejection_alert_shape',
        );
      if (control === 'cancel')
        check(
          capture.slots['first-ok-capture'].status === 'not-observed' &&
            capture.slots['first-ok-bubble'].status === 'not-observed',
          'native_cancel_slots',
        );
    } catch {
      diagnosticFailed = true;
    }
    try {
      await nativePage.evaluate(observer.finishBatchAllocationObserver, ownerToken);
    } catch {
      diagnosticFailed = true;
    }
    try {
      await storedRoot?.dispose();
    } catch {
      diagnosticFailed = true;
    }
    try {
      nativePage.off('pageerror', onPageError);
    } catch {
      diagnosticFailed = true;
    }
    try {
      nativePage.off('console', onConsole);
    } catch {
      diagnosticFailed = true;
    }
  }
  if (originalThrew) throw originalError;
  check(!diagnosticFailed && !observerFailed, 'native_diagnostic_failed');
  return { outcome: 'passed', callbackAndVectorVerified: true, boundedShapeCheckpoint: true };
}
module.exports = { runControl, waitForDialogReady };
