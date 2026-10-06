export type ReadinessCheck = {
  check_key: string;
  status: "pass" | "warn" | "fail" | "pending";
  detail: string;
};

export type LaunchReadiness = {
  database_checks?: ReadinessCheck[];
  database_gate?: string;
  environment_mode?: string;
  production_lock?: boolean;
  operations_enabled?: boolean;
  go_live_setup?: { setup_completed?: boolean };
};

// These checks control launch authorization; they do not test database integrity.
const launchControlKeys = new Set(["go_live_setup", "production_lock", "production_operations"]);

export function splitReadinessChecks(checks: ReadinessCheck[]) {
  return {
    integrityChecks: checks.filter(check => !launchControlKeys.has(check.check_key)),
    launchControls: checks.filter(check => launchControlKeys.has(check.check_key)),
  };
}

export function getReadinessDisplay(launch: LaunchReadiness, unavailable = false) {
  const checks = Array.isArray(launch.database_checks) ? launch.database_checks : [];
  const { integrityChecks, launchControls } = splitReadinessChecks(checks);
  const integrityFailures = integrityChecks.filter(check => check.status === "fail").length;
  const integrityWarnings = integrityChecks.filter(check => check.status === "warn").length;
  const missingChecks = integrityChecks.length === 0 || integrityChecks.some(check => !["pass", "warn", "fail"].includes(check.status));
  const integrityLabel = unavailable ? "UNAVAILABLE" : integrityFailures ? "FAIL" : missingChecks ? "PENDING" : integrityWarnings ? "WARN" : "PASS";
  const production = launch.environment_mode === "production";
  const unexpectedControlFailure = launchControls.some(check => check.status === "fail" && check.check_key === "production_lock");
  let launchLabel = "PENDING";
  let detail = "Readiness checks have not completed. Live operations remain subject to the existing launch controls.";

  if (unavailable) {
    launchLabel = "UNAVAILABLE";
    detail = "Readiness checks could not be loaded. Launch authorization has not been verified.";
  } else if (integrityFailures || unexpectedControlFailure || (production && launch.production_lock === false)) {
    launchLabel = "BLOCKED";
    detail = "A database or safety check needs attention. Review Production Validation for the failing checks.";
  } else if (production && launch.operations_enabled === false) {
    launchLabel = "LOCKED";
    detail = "Live business operations are disabled. Go-live setup and explicit Owner approval are required before launch.";
  } else if (production && launch.database_gate === "pass" && integrityLabel === "PASS" && launchControls.length === 3 && launchControls.every(check => check.status === "pass") && launch.production_lock === true && launch.operations_enabled === true && launch.go_live_setup?.setup_completed === true) {
    launchLabel = "READY";
    detail = "Database checks and production launch controls pass.";
  } else if (launch.environment_mode === "staging") {
    launchLabel = "STAGING";
    detail = "Staging is available for testing. This status does not authorize production operations.";
  }

  return { integrityLabel, integrityFailures, integrityWarnings, launchLabel, detail, integrityChecks, launchControls };
}

export function launchControlLabel(check: ReadinessCheck, launch: LaunchReadiness) {
  if (launch.environment_mode === "production" && check.status === "fail") {
    if (check.check_key === "production_operations" && launch.operations_enabled === false) return "DISABLED";
    if (check.check_key === "go_live_setup" && launch.go_live_setup?.setup_completed === false) return "INCOMPLETE";
  }
  return check.status.toUpperCase();
}
