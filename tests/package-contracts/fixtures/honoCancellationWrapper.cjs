// Disposable parent for the abrupt ownership-loss regression.
const { fork } = require('node:child_process');
const path = require('node:path');
const child = fork(path.join(__dirname, 'honoUtooChild.cjs'), process.argv.slice(2), {
  silent: true,
});
child.stdout.resume();
child.stderr.resume();
child.on('message', (message) => process.send({ ...message, ownedChildPid: child.pid }));
child.on('exit', (code) => {
  process.exitCode = code;
  if (process.connected) process.disconnect();
});
process.on('disconnect', () => {
  if (child.connected) child.disconnect();
});
