"use client";

import { Plus, Trash2, Wand2 } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { ImageUploader } from "./components/ImageUploader";

function clampList(items: string[]) {
  return items.map((s) => s.trim()).filter(Boolean);
}

function isAllowedImageFile(file: File) {
  const name = file.name.toLowerCase();
  const mime = file.type;
  const allowedMimes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
  const allowedExt = [".png", ".jpg", ".jpeg", ".webp"];
  return allowedMimes.has(mime) || allowedExt.some((ext) => name.endsWith(ext));
}

function OzonTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
      {children}
    </span>
  );
}

function FieldLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default function Home() {
  const [productName, setProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [functionalSellingPoints, setFunctionalSellingPoints] = useState<string[]>(["轻巧便携", "耐用材质"]);
  const [usageScenarios, setUsageScenarios] = useState<string[]>(["居家收纳", "户外旅行"]);
  const [productParameters, setProductParameters] = useState<string[]>([]);

  const [productImage, setProductImage] = useState<File | null>(null);
  const [heroRef, setHeroRef] = useState<File | null>(null);
  const [featureRefs, setFeatureRefs] = useState<File[]>([]);
  const [sceneRefs, setSceneRefs] = useState<File[]>([]);
  const [specRefs, setSpecRefs] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string>("");
  const [backendPrompt, setBackendPrompt] = useState<string>("");
  const [generatedData, setGeneratedData] = useState<{
    title?: { ru: string; zh: string };
    tags?: Array<{ ru: string; zh: string }>;
    description?: { ru: string; zh: string };
  }>({});

  const previewCopy = useMemo(() => {
    const bullets = clampList(functionalSellingPoints);
    const scenes = clampList(usageScenarios);
    return {
      title: productName.trim() || "未命名商品",
      bullets: bullets.length ? bullets : ["请输入至少 1 条功能卖点"],
      sceneLine: scenes.length ? scenes.join(" / ") : "请输入使用场景",
    };
  }, [productName, functionalSellingPoints, usageScenarios]);

  function setListItem(
    list: string[],
    index: number,
    next: string,
    setter: (v: string[]) => void,
  ) {
    const copy = list.slice();
    copy[index] = next;
    setter(copy);
  }

  function addListItem(list: string[], setter: (v: string[]) => void) {
    setter([...list, ""]);
  }

  function removeListItem(list: string[], setter: (v: string[]) => void, index: number) {
    const copy = list.slice();
    copy.splice(index, 1);
    setter(copy.length ? copy : [""]);
  }



  async function onDownloadGeneratedImage() {
    if (!generatedImageUrl || isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch(generatedImageUrl, { method: "GET" });
      const blob = await res.blob();

      const contentType = res.headers.get("content-type") || blob.type || "";
      const ext = contentType.includes("png")
        ? "png"
        : contentType.includes("jpeg") || contentType.includes("jpg")
          ? "jpg"
          : contentType.includes("webp")
            ? "webp"
            : "png";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ozon-scene.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.open(generatedImageUrl, "_blank", "noopener,noreferrer");
    } finally {
      setIsDownloading(false);
    }
  }

  async function onGenerate() {
    if (isGenerating) return;

    const nextErrors: string[] = [];
    if (!productName.trim()) nextErrors.push("请填写商品名称。");
    if (!productImage) nextErrors.push("请上传主商品图（JPG/JPEG/PNG/WebP）。");
    if (!heroRef) nextErrors.push("请上传英雄图参考（JPG/JPEG/PNG/WebP）。");
    if (!featureRefs.length) nextErrors.push("请上传至少 1 张功能图参考（JPG/JPEG/PNG/WebP）。");
    if (!sceneRefs.length) nextErrors.push("请上传至少 1 张场景图参考（JPG/JPEG/PNG/WebP）。");
    if (clampList(functionalSellingPoints).length < 1) nextErrors.push("请至少填写 1 条功能卖点。");
    if (clampList(usageScenarios).length < 1) nextErrors.push("请至少填写 1 个使用场景。");

    if (nextErrors.length) {
      setErrors(nextErrors);
      return;
    }

    setIsGenerating(true);
    setErrors([]);
    setGeneratedImageUrl("");
    setGeneratedData({}); // 统一清空上一轮的生成数据

    try {
      const autoDescription = [
        `商品名称：${productName.trim()}`,
        brand.trim() ? `品牌：${brand.trim()}` : undefined,
        `功能卖点：${clampList(functionalSellingPoints).join("；")}`,
        `使用场景：${clampList(usageScenarios).join("；")}`,
        clampList(productParameters).length ? `商品参数：${clampList(productParameters).join("；")}` : undefined,
      ].filter(Boolean).join("\n");

      const formData = new FormData();
      formData.append("productImage", productImage!);
      formData.append("heroReferenceImage", heroRef!);
      formData.append("featureReferenceImage", featureRefs[0]);
      formData.append("sceneReferenceImage", sceneRefs[0]);
      if (specRefs.length) {
        formData.append("specReferenceImage", specRefs[0]);
      }
      formData.append("name", productName.trim());
      formData.append("brand", brand.trim());
      formData.append("features", JSON.stringify(clampList(functionalSellingPoints)));
      formData.append("scenarios", JSON.stringify(clampList(usageScenarios)));
      formData.append("parameters", JSON.stringify(clampList(productParameters)));

      const response = await fetch("/api/generate-image", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        imageUrl?: string;
        error?: string;
        prompt?: string;
        title?: { ru: string; zh: string };
        tags?: Array<{ ru: string; zh: string }>;
        description?: { ru: string; zh: string };
      };

      if (!response.ok || !data.imageUrl) {
        throw new Error(data.error || "图片生成失败，请稍后重试。");
      }

      setGeneratedImageUrl(data.imageUrl);
      setBackendPrompt(data.prompt || "");
      setGeneratedData({
        title: data.title,
        tags: data.tags,
        description: data.description
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求失败";
      setErrors([message]);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-none px-4 py-8 sm:px-6 lg:px-10 2xl:px-14">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-sm">
                <Wand2 className="size-5" />
              </div>
              <div>
                <div className="text-xl font-bold tracking-tight">Ozon 上架助手</div>
                <div className="mt-0.5 text-sm text-slate-600">
                  上传主图 + 风格参考图，后端 AI 生成原创场景图
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <OzonTag>Next.js API Routes</OzonTag>
              <OzonTag>风格参考生成</OzonTag>
              <OzonTag>商业可交付架构</OzonTag>
            </div>
          </div>
        </header>

        <main className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="lg:col-span-1">
            <div className="h-full rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 flex flex-col">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-lg font-bold">商家输入区</h2>
                <div className="mt-1 text-xs text-slate-500">
                  主商品图 + 风格参考图 + 描述信息，一键发送至后端 AI 生图接口
                </div>
              </div>

              <div className="flex-1 space-y-6 px-5 py-5 overflow-y-auto">
                <div className="space-y-2">
                  <FieldLabel title="商品名称" hint="必填" />
                  <input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="例如：多功能收纳盒（透明盖）"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  />
                </div>

                <div className="space-y-2">
                  <FieldLabel title="品牌" hint="可选" />
                  <input
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="例如：XXX 品牌"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  />
                  <div className="text-xs text-slate-500">如果不需要品牌出现在商品标题或图片中，可不填</div>
                </div>

                <ImageUploader
                  title="主商品图上传"
                  hint="支持 JPG/JPEG/PNG/WebP，请提供抠好图的透明底商品图"
                  value={productImage}
                  onChange={setProductImage}
                />

                <ImageUploader
                  title="英雄图参考"
                  hint="请上传1-2张你想模仿的英雄图排版和色调"
                  value={heroRef}
                  onChange={setHeroRef}
                />

                <ImageUploader
                  title="功能图参考"
                  hint="请上传包含相似功能展示的参考图"
                  value={featureRefs}
                  onChange={setFeatureRefs}
                  isMultiple={true}
                />

                <ImageUploader
                  title="场景图参考"
                  hint="请上传你想融入的使用场景参考图"
                  value={sceneRefs}
                  onChange={setSceneRefs}
                  isMultiple={true}
                />

                <ImageUploader
                  title="参数图参考"
                  hint="可选，提供参数排版或多变体列表参考"
                  value={specRefs}
                  onChange={setSpecRefs}
                  isMultiple={true}
                />

                <div className="space-y-2">
                  <FieldLabel title="功能卖点" hint="必填，可添加/删除" />
                  <div className="space-y-2">
                    {functionalSellingPoints.map((v, idx) => (
                      <div key={`fsp-${idx}`} className="flex items-center gap-2">
                        <input
                          value={v}
                          onChange={(e) =>
                            setListItem(functionalSellingPoints, idx, e.target.value, setFunctionalSellingPoints)
                          }
                          placeholder={`卖点 ${idx + 1}`}
                          className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                        />
                        <button
                          type="button"
                          onClick={() => removeListItem(functionalSellingPoints, setFunctionalSellingPoints, idx)}
                          className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          aria-label="删除卖点"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addListItem(functionalSellingPoints, setFunctionalSellingPoints)}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                    >
                      <Plus className="size-4" />
                      添加卖点
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel title="使用场景" hint="必填，可添加/删除" />
                  <div className="space-y-2">
                    {usageScenarios.map((v, idx) => (
                      <div key={`scene-${idx}`} className="flex items-center gap-2">
                        <input
                          value={v}
                          onChange={(e) =>
                            setListItem(usageScenarios, idx, e.target.value, setUsageScenarios)
                          }
                          placeholder={`场景 ${idx + 1}`}
                          className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                        />
                        <button
                          type="button"
                          onClick={() => removeListItem(usageScenarios, setUsageScenarios, idx)}
                          className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          aria-label="删除场景"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addListItem(usageScenarios, setUsageScenarios)}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                    >
                      <Plus className="size-4" />
                      添加场景
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel title="商品参数" hint="可选，可添加/删除" />
                  <div className="space-y-2">
                    {productParameters.map((v, idx) => (
                      <div key={`param-${idx}`} className="flex items-center gap-2">
                        <input
                          value={v}
                          onChange={(e) =>
                            setListItem(productParameters, idx, e.target.value, setProductParameters)
                          }
                          placeholder={`参数 ${idx + 1}`}
                          className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                        />
                        <button
                          type="button"
                          onClick={() => removeListItem(productParameters, setProductParameters, idx)}
                          className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          aria-label="删除参数"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addListItem(productParameters, setProductParameters)}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                    >
                      <Plus className="size-4" />
                      添加参数
                    </button>
                  </div>
                </div>

                {errors.length ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    <ul className="list-disc pl-5">
                      {errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-slate-100 px-5 py-5">
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={isGenerating}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm transition focus:outline-none focus:ring-4 focus:ring-sky-200 ${
                    isGenerating ? "cursor-not-allowed opacity-70" : "hover:from-sky-700 hover:to-indigo-700"
                  }`}
                >
                  <Wand2 className="size-5" />
                  {isGenerating ? "AI 生成中…" : "一键生成 Listing"}
                </button>
              </div>
            </div>
          </section>

          <section className="lg:col-span-1">
            <div className="h-full rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 flex flex-col">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-lg font-bold">AI 生成结果展示区</h2>
                <div className="mt-1 text-xs text-slate-500">
                  展示由后端 API 返回的风格模仿场景图（保留主体、模仿风格、不复刻元素）
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-6 px-5 py-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Ozon 文案预览</div>
                  <div className="mt-2">
                    {/* 双语标题展示区 */}
                    <div className="space-y-1">
                      <div className="text-lg font-bold tracking-tight text-slate-900">
                        {generatedData.title?.ru || "Многофункциональный контейнер для хранения с прозрачной крышкой"}
                      </div>
                      <div className="text-sm text-slate-500">
                        {generatedData.title?.zh || "多功能收纳盒（透明盖）"}
                      </div>
                    </div>

                    {/* 商品标签 (Tags) 容器 */}
                    <div className="mt-4">
                      <div className="text-sm font-medium text-slate-700 mb-2">商品标签</div>
                      
                      {/* 俄语复制区 */}
                      <div className="mb-2 p-3 rounded-xl bg-gray-50 break-words">
                        {(() => {
                          const t = generatedData.tags as any;
                          if (!t) return "#Коробка (此处将显示AI生成的俄语标签)";
                          if (typeof t === 'string') return t;
                          
                          let ruTags: string[] = [];
                          if (Array.isArray(t)) {
                            ruTags = t.map(x => typeof x === 'string' ? x : x?.ru).filter(Boolean);
                          } else if (t.ru && Array.isArray(t.ru)) {
                            ruTags = t.ru;
                          } else if (typeof t === 'object') {
                            ruTags = Object.values(t).map((x: any) => typeof x === 'string' ? x : x?.ru).filter(Boolean);
                          }
                          
                          if (ruTags.length === 0) {
                            return `[调试透视] AI 乱编的数据格式: ${JSON.stringify(t)}`;
                          }
                          return ruTags.map(x => String(x).startsWith('#') ? x : `#${x}`).join(' ');
                        })()}
                      </div>
                      
                      {/* 中文对照区 */}
                      <div className="text-sm text-slate-500 break-words">
                        中文对照：{(() => {
                          const t = generatedData.tags as any;
                          if (!t) return "此处将显示中文对照标签";
                          if (typeof t === 'string') return "";
                          
                          let zhTags: string[] = [];
                          if (Array.isArray(t)) {
                            zhTags = t.map(x => typeof x === 'string' ? '' : x?.zh).filter(Boolean);
                          } else if (t.zh && Array.isArray(t.zh)) {
                            zhTags = t.zh;
                          } else if (typeof t === 'object') {
                            zhTags = Object.values(t).map((x: any) => typeof x === 'string' ? '' : x?.zh).filter(Boolean);
                          }
                          
                          if (zhTags.length === 0) return "";
                          return zhTags.map(x => String(x).startsWith('#') ? x : `#${x}`).join(' ');
                        })()}
                      </div>
                    </div>

                    {/* 商品简介 (Description) 区 */}
                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-medium text-slate-700">商品简介</div>
                      
                      {/* 俄文简介 */}
                      <div className="text-sm text-slate-900 break-words">
                        {generatedData.description?.ru || "Этот легкий и портативный многофункциональный контейнер с прозрачной крышкой изготовлен из прочных материалов. Он идеально подходит для домашнего хранения и использования во время путешествий. Характеристики: пластик, размер 20x15x10 см, объем 3 л."}
                      </div>
                      
                      {/* 中文翻译 */}
                      <div className="text-sm text-slate-500 break-words">
                        {generatedData.description?.zh || "这款轻巧便携的多功能透明盖收纳盒采用耐用材质制成。它非常适合居家日常收纳与户外旅行时使用。具体参数：塑料材质，尺寸 20x15x10cm，容量 3L。"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col">
                  <div className="text-sm font-semibold text-slate-900">AI 生成图片展厅</div>
                  
                  <div className="flex-1 flex flex-col gap-4 mt-3">
                    {/* 英雄图 (主图) */}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-700 mb-2">英雄图 (主图)</div>
                      {generatedImageUrl ? (
                        <div className="h-full rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                          <Image
                            src={generatedImageUrl}
                            alt="AI 生成英雄图"
                            width={800}
                            height={600}
                            className="max-h-full object-contain"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="h-full rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center p-6 text-center text-sm text-slate-500">
                          上传主商品图和英雄图参考后，这里会展示 AI 生成的英雄图
                        </div>
                      )}
                    </div>
                    
                    {/* 功能图展示 */}
                    <div>
                      <div className="text-sm font-medium text-slate-700 mb-2">功能图展示</div>
                      <div className="grid grid-cols-2 gap-3">
                        {[1, 2].map((i) => (
                          <div key={i} className="aspect-video rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center text-sm text-slate-500">
                            功能图 {i}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* 场景图展示 */}
                    <div>
                      <div className="text-sm font-medium text-slate-700 mb-2">场景图展示</div>
                      <div className="grid grid-cols-2 gap-3">
                        {[1, 2].map((i) => (
                          <div key={i} className="aspect-video rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center text-sm text-slate-500">
                            场景图 {i}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* 参数图展示 */}
                    <div>
                      <div className="text-sm font-medium text-slate-700 mb-2">参数图展示</div>
                      <div className="aspect-video rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center text-sm text-slate-500">
                        参数图
                      </div>
                    </div>
                  </div>
                  
                  {generatedImageUrl && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={onDownloadGeneratedImage}
                        disabled={isDownloading}
                        className={`w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-200 ${
                          isDownloading ? "cursor-not-allowed opacity-70" : ""
                        }`}
                      >
                        {isDownloading ? "正在下载…" : "下载图片"}
                      </button>
                    </div>
                  )}
                </div>

                {backendPrompt ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">后端发送给 AI 的 Prompt</div>
                    <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700 max-h-40">
                      {backendPrompt}
                    </pre>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
