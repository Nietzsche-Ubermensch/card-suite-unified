/**
 * CARD PIPELINE API ROUTES v2
 * Backends: GFPGANv1, SyntronSD2, OpenAI, xAI, Venice, OpenRouter, Gemini
 *
 * Availability is measured, not assumed:
 *   local  → checkpoint / weight files exist on disk
 *   cloud  → named API key env var is set
 * Unknown or incomplete backends return 400/501 with the missing requirement.
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { spawn } from "child_process";
import fs from "fs";

const router = Router();
const upload = multer({ dest: "uploads/cards/" });

type ProviderType = "local" | "cloud";

interface ProviderCfg {
  type: ProviderType;
  name: string;
  description: string;
  requires: string[];
  envKey?: string;
  endpoint?: string;
  model?: string;
  fileEnv?: string[];
}

const AI_PROVIDERS: Record<string, ProviderCfg> = {
  gfpgan: {
    type: "local",
    name: "GFPGANv1-512",
    description: "Face restoration GAN. Best for portrait cards.",
    requires: ["GFPGAN_CHECKPOINT"],
    fileEnv: ["GFPGAN_CHECKPOINT"],
  },
  syntron: {
    type: "local",
    name: "SyntronSD2",
    description: "Diffusion + thermodynamic control. Best for artifact removal.",
    requires: ["SD2_BASE_MODEL", "SD2_LORA_WEIGHTS"],
    fileEnv: ["SD2_BASE_MODEL", "SD2_LORA_WEIGHTS"],
  },
  openai: {
    type: "cloud",
    name: "OpenAI DALL-E 3",
    description: "Photorealistic generation. Best for complete recreation.",
    requires: ["OPENAI_API_KEY"],
    envKey: "OPENAI_API_KEY",
    endpoint: "https://api.openai.com/v1/images/generations",
    model: "dall-e-3",
  },
  xai: {
    type: "cloud",
    name: "xAI Grok Imagine",
    description: "High-fidelity restoration. Best for detail preservation.",
    requires: ["XAI_API_KEY"],
    envKey: "XAI_API_KEY",
    endpoint: "https://api.x.ai/v1/images/generations",
    model: "grok-imagine-image-2.0",
  },
  venice: {
    type: "cloud",
    name: "Venice Vision",
    description: "Digital masterpiece style. Best for artistic cards.",
    requires: ["VENICE_API_KEY"],
    envKey: "VENICE_API_KEY",
    endpoint: "https://api.venice.ai/api/v1/image/generate",
    model: "venice-sd35",
  },
  openrouter: {
    type: "cloud",
    name: "OpenRouter Flux Pro",
    description: "Cinematic 8k HDR. Best for premium presentation.",
    requires: ["OPENROUTER_API_KEY"],
    envKey: "OPENROUTER_API_KEY",
    endpoint: "https://openrouter.ai/api/v1/images/generations",
    model: "black-forest-labs/flux-pro",
  },
  gemini: {
    type: "cloud",
    name: "Gemini Imagen",
    description: "Color-accurate generation via Imagen on Gemini API.",
    requires: ["GEMINI_API_KEY"],
    envKey: "GEMINI_API_KEY",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict",
    model: "imagen-3.0-generate-002",
  },
};

function envPresent(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

function filesPresent(keys: string[] | undefined): boolean {
  if (!keys?.length) return false;
  return keys.every((key) => {
    const p = process.env[key];
    return !!p && fs.existsSync(p);
  });
}

function isAvailable(cfg: ProviderCfg): boolean {
  if (cfg.type === "local") return filesPresent(cfg.fileEnv);
  return !!cfg.envKey && envPresent(cfg.envKey);
}

function missingRequirements(cfg: ProviderCfg): string[] {
  if (cfg.type === "local") {
    return (cfg.fileEnv || []).filter((key) => {
      const p = process.env[key];
      return !p || !fs.existsSync(p);
    });
  }
  return cfg.envKey && !envPresent(cfg.envKey) ? [cfg.envKey] : [];
}

function optimizePrompt(provider: string, meta: Record<string, unknown>): string {
  const year = meta.year ? String(meta.year) : "";
  const manufacturer = meta.manufacturer ? String(meta.manufacturer) : "";
  const cardSet = meta.card_set ? String(meta.card_set) : "";
  const player = meta.player_name ? String(meta.player_name) : "";
  const base = `${year} ${manufacturer} ${cardSet} ${player}`.trim();
  const feat = [
    meta.is_autograph && "on-card autograph",
    meta.serial_number && `serial ${meta.serial_number}`,
  ]
    .filter(Boolean)
    .join(", ");
  const templates: Record<string, string> = {
    gfpgan: `${base}${feat ? ", " + feat : ""}`,
    syntron: `${base}${feat ? ", " + feat : ""}. Sports trading card, sharp corners, vibrant colors, pristine condition.`,
    openai: `${base}${feat ? ", " + feat : ""}. Photorealistic trading card scan, razor-sharp corners, vibrant team colors, museum-quality lighting, 8k resolution, professional sports photography, pristine holographic foil, no surface scratches.`,
    xai: `${base}${feat ? ", " + feat : ""}. High-fidelity card restoration, accurate color reproduction, sharp typography, holographic foil details preserved, gem mint condition visualization.`,
    venice: `${base}${feat ? ", " + feat : ""}. Digital masterpiece, hyper-detailed sports card art, chromatic aberration corrected, premium stock texture, archival scan quality.`,
    openrouter: `${base}${feat ? ", " + feat : ""}. Cinematic 8k HDR sports card photography, micro-detail enhancement, surface imperfection removal, professional PSA grading lighting.`,
    gemini: `${base}${feat ? ", " + feat : ""}. Ultra-sharp focus, color-accurate team branding, pristine holographic elements, museum archival standard.`,
  };
  return templates[provider] || base;
}

function parseMeta(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

router.get("/enhancers", (_req: Request, res: Response) => {
  const enhancers = Object.entries(AI_PROVIDERS).map(([id, cfg]) => ({
    id,
    name: cfg.name,
    description: cfg.description,
    type: cfg.type,
    available: isAvailable(cfg),
    missing: missingRequirements(cfg),
  }));
  res.json({ enhancers });
});

router.post("/scan", upload.array("cards", 50), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return res.status(400).json({ error: "No files uploaded" });
    const results = [];
    for (const file of files) {
      const ocrResult = await runPython("ocr", file.path);
      results.push({
        id: path.parse(file.originalname).name,
        filename: file.originalname,
        ...ocrResult,
      });
    }
    res.json({ scanned: results.length, cards: results });
  } catch (err) {
    res.status(500).json({ error: "Scan failed", detail: String(err) });
  }
});

router.post("/enhance", upload.single("image"), async (req: Request, res: Response) => {
  const backend = String(req.body?.backend || "gfpgan");
  const meta = parseMeta(req.body?.metadata);
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  const imagePath = req.file?.path;
  if (!imagePath) return res.status(400).json({ error: "No image uploaded" });

  const cfg = AI_PROVIDERS[backend];
  if (!cfg) return res.status(400).json({ error: `Unknown backend: ${backend}` });

  const missing = missingRequirements(cfg);
  if (missing.length) {
    return res.status(400).json({
      error: `Backend ${backend} is not available`,
      missing,
    });
  }

  const optimized = prompt || optimizePrompt(backend, meta);

  try {
    if (cfg.type === "local") {
      const result = await runPython("enhance", imagePath, {
        backend,
        checkpoint: process.env.GFPGAN_CHECKPOINT || "",
        base_model: process.env.SD2_BASE_MODEL || "",
        weights: process.env.SD2_LORA_WEIGHTS || "",
        prompt: optimized,
      });
      return res.json({ backend, prompt: optimized, result });
    }

    if (backend === "gemini") {
      const r = await fetch(`${cfg.endpoint}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: optimized }],
          parameters: { sampleCount: 1 },
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ backend, error: data });
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
      return res.json({ backend, prompt: optimized, imageBase64: b64 || null, raw: data });
    }

    const apiKey = process.env[cfg.envKey as string] as string;
    const payload: Record<string, unknown> =
      backend === "openai"
        ? { model: cfg.model, prompt: optimized, size: "1024x1536", quality: "hd", n: 1 }
        : { model: cfg.model, prompt: optimized, n: 1 };

    const r = await fetch(cfg.endpoint as string, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ backend, error: data });
    return res.json({
      backend,
      prompt: optimized,
      imageUrl: data.data?.[0]?.url || data.url || data.images?.[0]?.url || null,
      raw: data,
    });
  } catch (err) {
    res.status(500).json({ error: "Enhancement failed", detail: String(err) });
  }
});

router.post("/batch-enhance", async (req: Request, res: Response) => {
  const { inputDir, outputDir, backend = "gfpgan", prompt = "" } = req.body || {};
  if (!inputDir || !outputDir) {
    return res.status(400).json({ error: "inputDir and outputDir are required" });
  }
  const cfg = AI_PROVIDERS[String(backend)];
  if (!cfg) return res.status(400).json({ error: `Unknown backend: ${backend}` });
  const missing = missingRequirements(cfg);
  if (missing.length) {
    return res.status(400).json({ error: `Backend ${backend} is not available`, missing });
  }
  try {
    const result = await runPython("batch_enhance", "", {
      input_dir: inputDir,
      output_dir: outputDir,
      backend,
      checkpoint: process.env.GFPGAN_CHECKPOINT || "",
      base_model: process.env.SD2_BASE_MODEL || "",
      weights: process.env.SD2_LORA_WEIGHTS || "",
      prompt,
    });
    res.json({ backend, processed: result.processed || 0, output_dir: outputDir, result });
  } catch (err) {
    res.status(500).json({ error: "Batch enhancement failed", detail: String(err) });
  }
});

router.post("/price", async (req: Request, res: Response) => {
  try {
    const result = await runPython("price", "", req.body?.metadata || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Pricing failed", detail: String(err) });
  }
});

router.post("/list", async (req: Request, res: Response) => {
  try {
    const result = await runPython("list", "", req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Listing failed", detail: String(err) });
  }
});

function runPython(command: string, imagePath: string, args: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptDir = path.resolve(__dirname, ".");
    const argv = ["enhancer.py", "--command", command];
    const pairs: Array<[string, string]> = [
      ["--input", String(imagePath || args.input_dir || "")],
      ["--output", String(args.output_dir || "")],
      ["--backend", String(args.backend || "gfpgan")],
      ["--checkpoint", String(args.checkpoint || "")],
      ["--base-model", String(args.base_model || "")],
      ["--weights", String(args.weights || "")],
      ["--prompt", String(args.prompt || "")],
    ];
    for (const [flag, value] of pairs) {
      if (value) argv.push(flag, value);
    }
    if (args && command === "price") argv.push("--meta", JSON.stringify(args));
    const child = spawn("python3", argv, {
      env: { ...process.env, PYTHONPATH: scriptDir },
      cwd: scriptDir,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `Exit ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ raw: stdout });
      }
    });
  });
}

export default router;
