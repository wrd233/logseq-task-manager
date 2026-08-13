# Phase 6 Failure Injection

Automated gates:

| Fault | Required result |
| --- | --- |
| Graph worker offline | `GRAPH_ADAPTER_OFFLINE`; no new Commit |
| Evidence block changed | Proposal invalidated before Commit |
| Target version changed | run fails closed |
| Missing Evidence | start rejected |
| Wrong purpose/Skill or invalid result | rejected or durable FAILED receipt |
| PARKED / unsupported operation | closed parser rejects |
| Graph apply throws | Commit remains resumable; retry converges |
| Graph race | existing exact projection verification fails closed |
| Response lost after delivery | same request ID is leased and redelivered |
| Kernel restart | durable pending Commit resumes from SQLite |
| Plugin worker reload | broker heartbeat returns and the same proposal completes |

The service and CLI tests additionally prove mode-`0600` descriptor handling, Graph capability separation, loopback authentication, and secret-free public JSON. Real Desktop reload/offline checks are local evidence only.
