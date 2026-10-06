import {runCloudRecovery,recoveryFailureMessage} from './run.mjs';

// This explicit entry point reads production and restores only to the reviewed
// separate target. It never changes production locks, operations or cutover.
try {
  const result=await runCloudRecovery(process.env,'production');
  if(result.status!=='passed') process.exitCode=1;
} catch(error) {
  console.error(recoveryFailureMessage(error,'production'));
  process.exitCode=1;
}
