# AI 教研内容交叉审核与修改工具 v2.0

本工具用于少儿英语分级阅读资源的交叉审核：将 S&S 大纲、Book PDF、Worksheet、Reading Report、Teacher's Guide 等材料进行一致性与语言规范性检查，并输出结构化修改工单。

## 环境变量

API Key 不在前端填写，也不会写入代码。请在部署平台的 Secrets / Environment Variables 中配置：

```env
MODEL_PROVIDER=openai-compatible
MODEL_API_KEY=your_api_key_here
MODEL_BASE_URL=https://api.example.com/v1
MODEL_NAME=your_model_name
```

说明：

- `MODEL_API_KEY`：你的真实模型 API Key。
- `MODEL_BASE_URL`：OpenAI-compatible 接口地址，通常以 `/v1` 结尾。
- `MODEL_NAME`：实际调用的模型名，例如 Claude 或 GPT 网关提供的模型 ID。
- `GEMINI_API_KEY` 不再需要。

## 本版本状态

- 支持 Excel / XLSX / CSV 大纲上传与匹配。
- 支持 Book PDF 自动提取文本。
- 支持 Worksheet PPT/PPTX 上传，但当前浏览器端不能直接解析完整 PPT 图文结构；建议先转成 PDF，或上传后手动粘贴提取底稿。
- 支持 DOC/DOCX/PPT/PPTX 占位上传和手动文本补充。
- 后端通过 OpenAI-compatible `/chat/completions` 调用真实模型。
- 当前审核请求以文本为主，尚未把 PDF 渲染图片发送给多模态模型。

## 本地运行

```bash
npm install
npm run dev
```

## 构建与启动

```bash
npm run build
npm run start
```
