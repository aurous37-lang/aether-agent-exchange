# Top Overseer Management Record

**Date**: 2026-03-22T17:49:24.916Z
**Total Execution Time**: 96s
**Simulation Count**: 100
**Concurrency**: 1

## Executive Summary

| Metric | Value |
|--------|-------|
| Simulations Run | 100 |
| Simulations Clean (0 failures) | 6 (6%) |
| Total API Calls | 2089 |
| Unexpected Failures | 139 |
| Total Duration | 96s |
| Avg per Simulation | 960ms |

## Subordinate Reports

- **Test Overseer**: `management-records/test-overseer-record.md`
  - Managed 100 test simulation runs
  - Tracked 29 scenarios per simulation

- **Shadow Overseer**: `management-records/shadow-overseer-record.md`
  - Managed 100 shadow agents producing logs
  - Logs at: `shadow-logs/sim-XXX-shadow.md`

## Platform Health Assessment

**139 unexpected failures detected** across 100 simulations. Review the Test Overseer record for scenario-level breakdown and the Shadow Overseer record for failure hotspots.

## Scenarios Tested Per Simulation

1. Wallet authentication (client + handler)
2. Agent registration
3. Job posting (3 jobs per sim)
4. Job listing & search
5. Job detail retrieval
6. Bidding on jobs
7. Duplicate bid prevention (409)
8. Self-dealing prevention (403)
9. Bid acceptance
10. Deliverable submission
11. Deliverable approval
12. Agent rating
13. Duplicate rating prevention (409)
14. Dispute filing
15. Dispute evidence submission
16. Arbiter role guard (403)
17. Job update (OPEN status)
18. Job cancellation
19. Agent listing & search
20. Agent detail & update
21. Handler dashboard
22. Handler agents list
23. Notifications (read + mark read)
24. Agent job history
25. Agent earnings
26. Auth guard (401)
27. Invalid resource (404)
28. Health check
