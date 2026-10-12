// Kept as a fail-closed compatibility entrypoint. The old cloud seeder contained
// a privileged credential and could reset existing accounts. Never restore it.
console.error("Cloud seeding is disabled. Use npm run local:provision for the isolated local test environment. See docs/production-readiness-audit.md.");
process.exitCode = 1;
