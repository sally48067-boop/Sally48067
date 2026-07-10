# AI 教研内容交叉审核与修改工具 v2.0

本工具用于少儿英语分级阅读教学大纲与多物料的一致性、语言规范性智能交叉质检。

## 环境变量配置
请确保在服务端环境设置以下变量：
```
MODEL_PROVIDER=openai-compatible
MODEL_API_KEY=your_api_key_here
MODEL_BASE_URL=https://api.example.com/v1
MODEL_NAME=your_model_name
```
注意：系统默认仅通过后端环境变量读取大模型配置，前端不接收、不保存任何 API Key。

## 功能限制说明
1. **多模态物料**：PPT/PPTX 当前仅支持上传占位和手动粘贴文本；如需视觉审核，请先将其转换为 PDF 后再上传。
2. **后端请求**：当前基于 OpenAI-compatible 规范的后端接口仅发送文本数据，暂不发送图片；若需多模态视觉审核，需后续单独接入 `image_url` 请求格式并更换支持视觉模型。
