import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 90000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error(`外部 API 请求超时 (${timeoutMs / 1000}秒未响应)`);
    }
    throw error;
  }
}

const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
const SILICONFLOW_API_KEY = (process.env.SILICONFLOW_API_KEY || "").trim();

const CHAT_MODEL_FALLBACKS = [
  "deepseek-ai/DeepSeek-V3",      // 优先使用最新的 DeepSeek V3
  "deepseek-ai/deepseek-chat",    // 备用 DeepSeek 节点
  "Qwen/Qwen2.5-7B-Instruct",     // 最后的兜底
];

// 使用快手可图生图模型
const IMAGE_MODEL = "Kwai-Kolors/Kolors";

type SiliconFlowChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string } | string;
};

type SiliconFlowImagesResponse = {
  images?: Array<{ url?: string }>;
  error?: { message?: string };
};

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
    "Content-Type": "application/json",
  };
}

// @AI-CRITICAL-GUARD: DO NOT modify the 'accept' attribute or allowed MIME types. PNG/WEBP/JPG must be fully supported. Previous AI overwrote this, causing production bugs.
async function fileToDataUrl(file: File) {
  const ab = await file.arrayBuffer();
  const b64 = Buffer.from(ab).toString("base64");
  const mime = file.type || "image/png";
  return `data:${mime};base64,${b64}`;
}

async function siliconflowChat(body: Record<string, unknown>) {
  const rsp = await fetchWithTimeout(`${SILICONFLOW_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  let raw = "";
  let json: SiliconFlowChatResponse | null = null;
  try {
    raw = await rsp.text();
    json = raw ? (JSON.parse(raw) as SiliconFlowChatResponse) : null;
  } catch {
    // ignore parse error
  }

  if (!rsp.ok) {
    const detail = {
      model: body.model,
      status: rsp.status,
      statusText: rsp.statusText,
      body: json ?? raw,
    };
    console.error("[SiliconFlow chat] 请求失败：", JSON.stringify(detail, null, 2));
    const message =
      (json &&
        typeof json.error === "object" &&
        "message" in json.error &&
        (json.error as { message?: string }).message) ||
      (typeof json?.error === "string" ? json.error : null) ||
      `SiliconFlow chat 请求失败（${rsp.status}）`;
    throw new Error(message);
  }

  return json || { choices: [] };
}

async function siliconflowChatWithModelFallback(body: Record<string, unknown>) {
  let lastMessage = "SiliconFlow chat 请求失败";
  let lastErrorDetail: unknown = null;

  for (const model of CHAT_MODEL_FALLBACKS) {
    const payload = { ...body, model };
    try {
      return await siliconflowChat(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SiliconFlow chat 请求失败";
      const statusFromMsg = /\((\d{3})\)/.exec(message)?.[1];
      const status = statusFromMsg ? Number(statusFromMsg) : null;

      lastMessage = message;
      lastErrorDetail = { model, message };

      if (status === 403) {
        console.warn(`[SiliconFlow chat] 模型 ${model} 返回 403，自动切换到下一个模型`);
        continue;
      }
      throw error;
    }
  }

  console.error("[SiliconFlow chat] 所有后备模型均失败：", JSON.stringify(lastErrorDetail, null, 2));
  throw new Error(lastMessage);
}

async function siliconflowImages(body: unknown) {
  const rsp = await fetchWithTimeout(`${SILICONFLOW_BASE_URL}/images/generations`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  let raw = "";
  let json: SiliconFlowImagesResponse | null = null;
  try {
    raw = await rsp.text();
    json = raw ? (JSON.parse(raw) as SiliconFlowImagesResponse) : null;
  } catch {
    // keep raw text for logging
  }

  if (!rsp.ok) {
    const detail = {
      model: (body as { model?: string })?.model,
      status: rsp.status,
      statusText: rsp.statusText,
      body: json ?? raw,
      requestBody: body,
    };
    console.error("[SiliconFlow images] 请求失败详情：", JSON.stringify(detail, null, 2));
    throw new Error(json?.error?.message || `SiliconFlow 生图请求失败（${rsp.status}）`);
  }
  return json || { images: [] };
}

// @AI-CRITICAL: DO NOT simplify this parser. AI models often wrap JSON in markdown blocks.
function safeParseJson<T>(text: string): T | null {
  try {
    if (!text) return null;
    // 1. 尝试直接解析
    try { return JSON.parse(text) as T; } catch (e) {}
    
    // 2. 尝试提取 ```json ... ``` 或 ``` ... ``` 块内部的内容
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]) as T; } catch (e) {}
    }
    
    // 3. 尝试移除所有非 JSON 字符，只保留 {} 或 [] 内的内容
    const braceMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (braceMatch) {
      try { return JSON.parse(braceMatch[0]) as T; } catch (e) {}
    }
    
    // 4. 最后尝试清理并解析
    const cleanedText = text.replace(/^[^\{\[]*|[^\}\]]*$/g, '').trim();
    if (cleanedText) {
      try { return JSON.parse(cleanedText) as T; } catch (e) {}
    }
    
    console.error("JSON 解析失败，原始文本:", text);
    return null;
  } catch (error) {
    console.error("JSON 解析失败，原始文本:", text);
    return null;
  }
}

export async function POST(request: Request) {
  console.log("=======================================");
  console.log("🚀 [步骤 1] 后端被触发，准备接收表单数据...");
  try {
    if (!SILICONFLOW_API_KEY || SILICONFLOW_API_KEY === "sk-REPLACE_ME") {
      return NextResponse.json(
        { error: "请在 .env.local 中设置有效的 SILICONFLOW_API_KEY，然后重启开发服务器。" },
        { status: 500 },
      );
    }

    // 接收前端传来的结构化数据
    const formData = await request.formData();
    console.log("📦 [步骤 2] 数据解析成功！商品名:", formData.get("name"));
    const name = String(formData.get("name") || "");
    const brand = String(formData.get("brand") || "");
    const features = safeParseJson<string[]>(String(formData.get("features") || "[]")) || [];
    const scenarios = safeParseJson<string[]>(String(formData.get("scenarios") || "[]")) || [];
    const parameters = safeParseJson<string[]>(String(formData.get("parameters") || "[]")) || [];

    // 为保证链路稳定，使用固定风格词
    const styleKeywords = ["clean", "natural light", "e-commerce", "minimal background", "high detail"];

    console.log("🧠 [步骤 3] 正在请求大模型生成文案 (可能需要 5-15 秒)...");
    // 生成标题、标签和描述
    const copyRsp = await siliconflowChatWithModelFallback({
      messages: [
        {
          role: "system",
          content: `你现在是俄罗斯 Ozon 平台顶级的“本土化电商运营专家”。

 【核心任务】
 你需要根据用户提供的商品信息，生成 Ozon 俄文爆款文案。
 1. 标题 (title)：符合 Ozon SEO 规则，极其吸睛，最多80字符。
 2. 标签 (tags)：15-20 个极具搜索流量的词根。
 3. 简介 (description)：写一篇极度详实、极具推销感、长度在 800-1500 字符的长篇种草文案。必须包含：【痛点开篇】、【沉浸体验】、【硬核优势】(详细展开)、【促单结语】。

 【🚨致命的 JSON 输出纪律🚨】
 你必须且只能输出一个合法的 JSON 对象！绝对不准输出任何 JSON 之外的问候语或 Markdown 标记！
 ！！！注意：简介(description)必须是一个数组，严格按照逻辑分段（至少4-6段），绝不能把所有话写在一个字符串里！！！

 严格按照以下格式输出：
 {
   "title": {"ru": "俄文标题", "zh": "中文翻译"},
   "tags": [{"ru": "俄文标签1", "zh": "中文标签1"}, {"ru": "俄文标签2", "zh": "中文标签2"}],
   "description": [
     {"ru": "第一段：痛点开篇（俄文）", "zh": "第一段中文翻译"},
     {"ru": "第二段：沉浸体验（俄文）", "zh": "第二段中文翻译"},
     {"ru": "第三段：核心卖点1（俄文）", "zh": "第三段中文翻译"},
     {"ru": "第四段：核心卖点2及促单（俄文）", "zh": "第四段中文翻译"}
   ]
 }`
        },
        {
          role: "user",
          content: [
            "请严格输出合法的 JSON 格式！务必把简介写得超长、超详实，不准偷懒！",
            `📦 商品名称：${name || "未命名商品"}`,
            brand ? `🏷️ 品牌：${brand}` : "",
            features.length ? `✨ 核心功能卖点：${features.join("；")}` : "",
            scenarios.length ? `🏠 适用场景：${scenarios.join("；")}` : "",
            parameters.length ? `📊 物理参数：${parameters.join("；")}` : "",
            "现在，立刻输出纯 JSON 数据："
          ].filter(Boolean).join("\n"),
        },
      ],
      temperature: 0.8,
      max_tokens: 4096,
    });
    const copyText = copyRsp.choices?.[0]?.message?.content || "";
    const copyJson = safeParseJson<{
      title?: { ru: string; zh: string };
      tags?: Array<{ ru: string; zh: string }>;
      description?: Array<{ ru: string; zh: string }>;
    }>(copyText) || {};
    console.log("✅ [步骤 3 完成] 文案生成完毕！");

    // 生成纯文本生图 prompt
    const imagePrompt = [
      `Premium e-commerce product scene photo of ${name || "product"}`,
      brand ? `by ${brand}` : "",
      features.length ? `with features: ${features.join(", ")}` : "",
      scenarios.length ? `for ${scenarios.join(", ")}` : "",
      "clean and natural, Ozon style, product as main subject.",
      `Style: ${styleKeywords.join(", ")}.`,
      "No watermarks, no brand marks, no text, no posters, no duplicated objects.",
    ].filter(Boolean).join(" ");

    // 【第一击：根治 400 参数报错】
    // 强制大清洗：只传最基本的纯文本生图参数
    const imageRequestBody = {
      model: IMAGE_MODEL, // 使用 SDXL 模型
      prompt: imagePrompt,
      image_size: "1024x1024", // SDXL 完美支持此尺寸
      // 绝对禁区：删除所有与图片相关的字段
    };
    
    console.log("🎨 [步骤 4] 正在请求 Kolors 生成图片 (可能需要 15-30 秒)...");
    console.log("【生图请求参数】:", JSON.stringify(imageRequestBody));
    
    const imagesRsp = await siliconflowImages(imageRequestBody);
    console.log("✅ [步骤 4 完成] 图片生成完毕！");

    const sceneUrl = imagesRsp.images?.[0]?.url;
    if (!sceneUrl) {
      return NextResponse.json({ error: "SiliconFlow 未返回图片 URL。" }, { status: 502 });
    }

    console.log("🎉 [步骤 5] 准备返回响应数据！");
    console.log("=======================================");
    return NextResponse.json({
      imageUrl: sceneUrl,
      prompt: imagePrompt,
      styleKeywords,
      title: copyJson.title,
      tags: copyJson.tags,
      description: copyJson.description,
      provider: "siliconflow",
      model: IMAGE_MODEL,
    });
  } catch (error) {
    console.error("❌ [致命错误] 后端崩溃卡死原因:", error);
    const message = error instanceof Error ? error.message : "后端生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
