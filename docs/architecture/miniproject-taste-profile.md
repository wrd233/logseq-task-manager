# MiniProject Taste Profile

Taste is separate from the governance Skill. `miniproject-governance-taste@0.1.0` is immutable, hashed, explicitly selected by `taste/registry.json`, and deliberately `PROVISIONAL`. It contains only high-confidence sparse/preserve-source/one-question preferences.

Priority is: safety and explicit user intent, evidence/reality, governance Skill, Taste, writing preference. Taste cannot authorize an operation or override a structural boundary.

Feedback uses the existing FeedbackEvent with two small provenance additions: `signalStrength` and optional `governanceCorrelationId`. Applied changes yield weak acceptance; the Logseq command “认可最近一次 Agent 调整” records explicit strong positive; revise/reject/Undo are corrective. Silence never becomes strong positive.

Candidate workflow is manual and reviewable. The synthetic `0.1.1` candidate demonstrates the full path: sanitized candidate preference, regression cases, pairwise cases, spot-check, and an explicit `KEEP_0.1.0_ACTIVE` decision. `npm run taste:eval` validates lineage, immutable hashes, regression/pairwise coverage, the spot-check record, and the fact that the active registry remains distinct. The candidate was deliberately not activated because one synthetic preference is not repeated case feedback. No runtime automatically edits or activates Skill/Taste.
