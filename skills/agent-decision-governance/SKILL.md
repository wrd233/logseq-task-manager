---
name: agent-decision-governance
description: Constrain Task Copilot's internal Agent decisions with stable rules, evidence requirements, counter-signals, and deterministic authority routing.
---

# Agent Decision Governance

Version: `1.0.0`

This is an internal Task Copilot Skill. It is not an external Agent capability and cannot grant itself authority. The Provider may recommend only one structured Decision that conforms to `agent-decision-output-v1`; unknown fields are invalid.

The Provider interprets bounded evidence. This Skill defines legal recommendations and maximum authority. The deterministic Risk Router alone combines evidence, counter-signals, impact, runtime mode, Skill validity, and local authorization. The internal Agent never writes Graph or formal business state directly.

Rules with an explicit Task marker are still Shadow by default because every new local Rule Authorization starts at `SHADOW`. A later user authorization cannot bypass revalidation, the existing Application Command chain, Audit, Undo, or Recovery. R3 and high-impact actions always require a human.

## Output Contract

Return exactly these fields: `schemaVersion`, `outcome`, `targetObjectIds`, `ruleId`, `evidenceSummary`, `evidenceRefs`, `counterSignals`, `closestAlternative`, `needsMoreContext`, and `needsHuman`. Do not emit confidence, authority, route, commit instructions, hidden reasoning, credentials, or write commands.

## Governance Manifest

```json
{
  "schemaVersion": "agent-governance-skill-v1",
  "outputSchemaVersion": "agent-decision-output-v1",
  "rules": [
    {
      "id": "EXPLICIT-TASK-01",
      "displayName": "明确任务标记",
      "shortReason": "来源根包含明确任务标记，且已排除重复与多目标。",
      "scope": ["EXPLICIT_TASK"],
      "requiredEvidence": ["SOURCE_ROOT_EXPLICIT_TASK_MARKER", "SOURCE_STILL_EXISTS", "NO_DUPLICATE", "SINGLE_OBJECT_IMPACT"],
      "counterSignals": ["MULTIPLE_TARGETS", "DUPLICATE_OBJECT", "EXPLANATORY_ONLY", "SOURCE_STALE"],
      "recommendedOutcome": "CREATE_OBJECT",
      "maxAuthority": "AUTO_APPLY",
      "riskLevel": "R1",
      "positiveExamples": ["[Task] 整理 RHCSA 容器资料"],
      "boundaryExamples": ["整理 RHCSA 容器资料"],
      "negativeExamples": ["这是一段关于 RHCSA 容器资料的说明"]
    },
    {
      "id": "ORDINARY-CONTENT-01",
      "displayName": "明确保留普通内容",
      "shortReason": "来源是明确的解释、知识或参考内容，不应污染事务系统。",
      "scope": ["ORDINARY_CONTENT"],
      "requiredEvidence": ["SOURCE_ROOT_CAPTURED", "NO_ACTION_OR_DELIVERY_EXPRESSION"],
      "counterSignals": ["EXPLICIT_TASK_MARKER", "WAITING_EXPRESSION", "DELIVERY_EXPRESSION"],
      "recommendedOutcome": "KEEP_ORDINARY",
      "maxAuthority": "AUTO_APPLY",
      "riskLevel": "R1",
      "positiveExamples": ["容器镜像由只读层和可写层组成"],
      "boundaryExamples": ["需要了解容器镜像分层"],
      "negativeExamples": ["TODO 整理容器镜像分层笔记"]
    },
    {
      "id": "CANDIDATE-DUPLICATE-01",
      "displayName": "候选事项去重",
      "shortReason": "候选事项与唯一现有正式对象表达同一个行动。",
      "scope": ["CANDIDATE_DUPLICATE"],
      "requiredEvidence": ["CANDIDATE_EXISTS", "UNIQUE_EQUIVALENT_OBJECT", "TARGET_VERSION_CURRENT"],
      "counterSignals": ["MULTIPLE_EQUIVALENT_OBJECTS", "MATERIAL_SCOPE_DIFFERENCE", "TARGET_STALE"],
      "recommendedOutcome": "UPDATE_EXISTING",
      "maxAuthority": "AUTO_APPLY",
      "riskLevel": "R1",
      "positiveExamples": ["候选“校验告警规则”与唯一开放 Task 完全等价"],
      "boundaryExamples": ["标题相似但环境范围不同"],
      "negativeExamples": ["存在两个可能的等价 Task"]
    },
    {
      "id": "CANDIDATE-DEFER-01",
      "displayName": "候选事项延后",
      "shortReason": "来源明确表达以后考虑，且当前没有可执行时机。",
      "scope": ["CANDIDATE_DEFER"],
      "requiredEvidence": ["CANDIDATE_EXISTS", "EXPLICIT_DEFER_EXPRESSION", "SOURCE_STILL_EXISTS"],
      "counterSignals": ["ACTIVE_DEADLINE", "CURRENT_COMMITMENT", "SOURCE_STALE"],
      "recommendedOutcome": "DEFER",
      "maxAuthority": "AUTO_APPLY",
      "riskLevel": "R1",
      "positiveExamples": ["以后有时间可以整理这些资料"],
      "boundaryExamples": ["下周整理这些资料"],
      "negativeExamples": ["今天必须整理这些资料"]
    },
    {
      "id": "WORKSITE-CONTEXT-01",
      "displayName": "工作现场上下文关联",
      "shortReason": "来源是已有对象工作现场中的普通记录，只建议不改正文的上下文关联。",
      "scope": ["WORKSITE_CONTEXT"],
      "requiredEvidence": ["UNIQUE_OWNING_OBJECT", "SOURCE_IN_WORKSITE", "NO_SOURCE_TEXT_WRITE"],
      "counterSignals": ["OWNERSHIP_AMBIGUOUS", "STRUCTURAL_CHANGE", "SOURCE_TEXT_WRITE"],
      "recommendedOutcome": "UPDATE_EXISTING",
      "maxAuthority": "BATCH_REVIEW",
      "riskLevel": "R1",
      "positiveExamples": ["唯一 Task 子树下记录一条调查结果"],
      "boundaryExamples": ["记录位于页面附近但不在对象子树"],
      "negativeExamples": ["需要把记录移动到另一个 Project"]
    },
    {
      "id": "REVIEW-SIGNAL-01",
      "displayName": "复盘弱信号",
      "shortReason": "当前不进入正式事务系统，但来源对今后主动复盘可能有价值。",
      "scope": ["WEAK_REVIEW_SIGNAL"],
      "requiredEvidence": ["SOURCE_ROOT_CAPTURED", "WEAK_SIGNAL_EXPRESSION"],
      "counterSignals": ["EXPLICIT_TASK_MARKER", "FORMAL_OBJECT_UPDATE", "SOURCE_MISSING"],
      "recommendedOutcome": "REVIEW_SIGNAL",
      "maxAuthority": "AUTO_APPLY",
      "riskLevel": "R0",
      "positiveExamples": ["以后可能需要复盘这类告警"],
      "boundaryExamples": ["下周复盘这类告警"],
      "negativeExamples": ["TODO 复盘这类告警"]
    }
  ]
}
```
