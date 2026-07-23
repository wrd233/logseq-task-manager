# Logs

本目录只保存脱敏、结构化、可复核的 Slice 证据摘要，不保存：

- API Key、Authorization 或 descriptor token；
- 默认完整 Block/Page 正文；
- 全 Graph 内容；
- 私人路径、用户名或终端历史；
- 未经 Validator 的原始模型失败正文。

完整本地原始运行日志留在 ignored 临时目录；提交前只抽取必要的 command、结果、commit、时间、状态和限制。
