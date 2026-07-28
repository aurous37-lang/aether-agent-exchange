# Test Overseer Management Record

**Date**: 2026-03-22T17:49:24.911Z
**Total Simulations**: 100
**Simulations Passed (0 failures)**: 6
**Simulations Failed**: 94

## Aggregate Statistics

| Metric | Value |
|--------|-------|
| Total API Events | 2089 |
| Successful (OK) | 1649 |
| Unexpected Failures | 139 |
| Expected Failures (guards) | 259 |
| Avg Simulation Duration | 959ms |
| Fastest Simulation | 706ms |
| Slowest Simulation | 1540ms |

## Scenario Pass Rates

| Scenario | Pass | Fail | Skip | Rate |
|----------|------|------|------|------|
| accept_bid | 35 | 0 | 0 | 100% |
| agent_detail | 60 | 1 | 0 | 98% |
| agent_earnings | 60 | 1 | 0 | 98% |
| agent_job_history | 60 | 1 | 0 | 98% |
| agent_listing | 60 | 1 | 0 | 98% |
| agent_registration | 61 | 0 | 0 | 100% |
| agent_update | 60 | 1 | 0 | 98% |
| approve_deliverable | 35 | 0 | 0 | 100% |
| arbiter_role_guard | 32 | 0 | 0 | 100% |
| auth | 61 | 39 | 0 | 61% |
| auth_guard | 60 | 1 | 0 | 98% |
| bidding | 35 | 0 | 0 | 100% |
| dispute_evidence | 32 | 1 | 0 | 97% |
| dispute_filing | 33 | 0 | 0 | 100% |
| duplicate_bid_blocked | 35 | 0 | 0 | 100% |
| duplicate_rating_blocked | 35 | 0 | 0 | 100% |
| handler_agents | 60 | 1 | 0 | 98% |
| handler_dashboard | 60 | 1 | 0 | 98% |
| health_check | 60 | 1 | 0 | 98% |
| invalid_job_404 | 60 | 1 | 0 | 98% |
| job_cancel | 27 | 0 | 0 | 100% |
| job_detail | 35 | 0 | 0 | 100% |
| job_listing | 61 | 0 | 0 | 100% |
| job_posting | 35 | 26 | 0 | 57% |
| job_search | 61 | 0 | 0 | 100% |
| job_update | 27 | 0 | 0 | 100% |
| mark_notifications_read | 60 | 1 | 0 | 98% |
| notifications | 60 | 1 | 0 | 98% |
| rating | 35 | 0 | 0 | 100% |
| self_dealing_blocked | 35 | 0 | 0 | 100% |
| submit_deliverable | 35 | 0 | 0 | 100% |

## Simulations with Failures

| Sim | Failures | Duration | Failed Scenarios |
|-----|----------|----------|------------------|
| 1 | 1 | 1540ms |  |
| 2 | 1 | 954ms |  |
| 3 | 3 | 803ms | job_posting |
| 4 | 1 | 1297ms | job_posting |
| 6 | 1 | 1353ms |  |
| 7 | 2 | 1255ms | job_posting |
| 8 | 2 | 1263ms | job_posting |
| 9 | 2 | 839ms | job_posting |
| 10 | 2 | 899ms |  |
| 11 | 1 | 1364ms |  |
| 12 | 1 | 1364ms |  |
| 13 | 1 | 1277ms | job_posting |
| 14 | 2 | 907ms |  |
| 15 | 2 | 829ms | job_posting |
| 16 | 1 | 1275ms | job_posting |
| 17 | 1 | 940ms |  |
| 18 | 3 | 797ms | job_posting |
| 19 | 2 | 835ms | job_posting |
| 20 | 2 | 915ms |  |
| 21 | 1 | 939ms |  |
| 22 | 1 | 1287ms | job_posting |
| 23 | 1 | 1367ms |  |
| 24 | 1 | 924ms |  |
| 25 | 1 | 1366ms |  |
| 26 | 2 | 912ms |  |
| 27 | 1 | 1362ms |  |
| 28 | 2 | 1245ms | job_posting |
| 30 | 1 | 934ms |  |
| 31 | 1 | 725ms | auth |
| 32 | 1 | 708ms | auth |
| 33 | 1 | 708ms | auth |
| 34 | 1 | 709ms | auth |
| 35 | 1 | 707ms | auth |
| 36 | 1 | 707ms | auth |
| 37 | 1 | 707ms | auth |
| 38 | 1 | 706ms | auth |
| 39 | 1 | 708ms | auth |
| 40 | 1 | 707ms | auth |
| 41 | 1 | 708ms | auth |
| 42 | 1 | 706ms | auth |
| 43 | 1 | 707ms | auth |
| 44 | 1 | 707ms | auth |
| 45 | 1 | 706ms | auth |
| 46 | 1 | 707ms | auth |
| 47 | 1 | 708ms | auth |
| 48 | 1 | 707ms | auth |
| 49 | 1 | 706ms | auth |
| 50 | 1 | 707ms | auth |
| 51 | 1 | 708ms | auth |
| 52 | 1 | 706ms | auth |
| 53 | 1 | 706ms | auth |
| 54 | 1 | 708ms | auth |
| 55 | 1 | 706ms | auth |
| 56 | 1 | 708ms | auth |
| 57 | 1 | 706ms | auth |
| 58 | 1 | 709ms | auth |
| 59 | 1 | 708ms | auth |
| 60 | 1 | 708ms | auth |
| 61 | 1 | 706ms | auth |
| 62 | 1 | 708ms | auth |
| 63 | 1 | 706ms | auth |
| 64 | 1 | 707ms | auth |
| 65 | 1 | 707ms | auth |
| 66 | 1 | 707ms | auth |
| 67 | 1 | 726ms | auth |
| 68 | 3 | 786ms | job_posting |
| 69 | 2 | 905ms |  |
| 70 | 2 | 832ms | job_posting |
| 71 | 2 | 1252ms | job_posting |
| 73 | 1 | 1279ms | job_posting |
| 74 | 2 | 904ms |  |
| 75 | 2 | 1251ms | job_posting |
| 76 | 1 | 937ms |  |
| 77 | 2 | 833ms | job_posting |
| 78 | 1 | 916ms |  |
| 81 | 1 | 1290ms | job_posting |
| 82 | 2 | 1248ms | job_posting |
| 83 | 3 | 797ms | job_posting |
| 85 | 2 | 831ms | job_posting |
| 86 | 2 | 1241ms | job_posting |
| 87 | 2 | 898ms |  |
| 88 | 1 | 1282ms | job_posting |
| 89 | 1 | 1351ms |  |
| 90 | 3 | 792ms | job_posting |
| 91 | 1 | 1342ms |  |
| 92 | 1 | 1348ms |  |
| 93 | 2 | 901ms |  |
| 94 | 2 | 900ms |  |
| 95 | 1 | 1285ms | job_posting |
| 96 | 1 | 1350ms |  |
| 97 | 2 | 893ms |  |
| 98 | 13 | 1298ms | dispute_evidence, agent_listing, agent_detail, agent_update, handler_dashboard, handler_agents, notifications, mark_notifications_read, agent_job_history, agent_earnings, auth_guard, invalid_job_404, health_check |
| 99 | 1 | 707ms | auth |
| 100 | 1 | 707ms | auth |
