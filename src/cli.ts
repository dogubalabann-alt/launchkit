#!/usr/bin/env node
// launchkit — turn a one-line product pitch into a launch kit:
// launch copy (X thread + LinkedIn post), a hero image, and an optional teaser video.
// Every step runs on fal: an LLM via openrouter/router, FLUX for the image, Kling for the video.

import { fal } from "@fal-ai/client";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const MODELS = {
  copy: "openrouter/router",
  image: "fal-ai/flux/schnell",
  video: "fal-ai/kling-video/v3/standard/image-to-video",
};
const LLM = process.env.LAUNCHKIT_LLM ?? "anthropic/claude-sonnet-5";

type Copy = {
  tagline: string;
  x_thread: string[];
  linkedin_post: string;
  image_prompt: string;
  video_prompt: string;
};

const SYSTEM_PROMPT = `You are a developer-focused product marketer.
Given a product name and a one-line pitch, write launch copy that makes developers want to try it today.
Be concrete, skip hype words ("revolutionary", "game-changing"), lead with what you can build.
Reply with JSON only, no code fences, matching:
{
  "tagline": "max 8 words",
  "x_thread": ["3 to 5 posts, each under 270 chars; first post is the hook, last is the call to action"],
  "linkedin_post": "120-180 words",
  "image_prompt": "a vivid, text-free hero image prompt for a launch banner",
  "video_prompt": "one sentence describing slow, cinematic camera motion for that image"
}`;

function usage(): never {
  console.log(`Usage: launchkit "<product name>" "<one-line pitch>" [--video] [--out dir]

  --video   also render a 5s teaser video from the hero image (slower, costs more)
  --out     output directory (default: ./launches)

Requires FAL_KEY in the environment. Optional: LAUNCHKIT_LLM (default ${LLM}).`);
  process.exit(1);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseCopy(raw: string): Copy {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  process.stdout.write(`→ ${label}… `);
  const result = await run();
  console.log(`done (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  return result;
}

async function download(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      video: { type: "boolean", default: false },
      out: { type: "string", default: "launches" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [name, pitch] = positionals;
  if (values.help || !name || !pitch) usage();
  if (!process.env.FAL_KEY) {
    console.error("FAL_KEY is not set. Get one at https://fal.ai/dashboard/keys");
    process.exit(1);
  }

  const dir = join(values.out!, slugify(name));
  await mkdir(dir, { recursive: true });

  const copy = await step("Writing launch copy", async () => {
    const { data } = await fal.subscribe(MODELS.copy, {
      input: {
        model: LLM,
        system_prompt: SYSTEM_PROMPT,
        prompt: `Product: ${name}\nPitch: ${pitch}`,
        temperature: 0.8,
      },
    });
    return parseCopy(data.output);
  });

  const imageUrl = await step("Rendering hero image", async () => {
    const { data } = await fal.subscribe(MODELS.image, {
      input: { prompt: copy.image_prompt, image_size: "landscape_16_9", num_images: 1 },
    });
    return data.images[0].url;
  });
  await download(imageUrl, join(dir, "hero.jpg"));

  let videoUrl: string | undefined;
  if (values.video) {
    const url = await step("Animating teaser video", async () => {
      const { data } = await fal.subscribe(MODELS.video, {
        input: { start_image_url: imageUrl, prompt: copy.video_prompt, duration: "5" },
      });
      return data.video.url;
    });
    await download(url, join(dir, "teaser.mp4"));
    videoUrl = url;
  }

  const md = [
    `# ${name}`,
    `> ${copy.tagline}`,
    ``,
    `![hero](hero.jpg)`,
    videoUrl ? `\n[Teaser video](teaser.mp4)\n` : ``,
    `## X thread`,
    ...copy.x_thread.map((post, i) => `**${i + 1}/${copy.x_thread.length}** ${post}\n`),
    `## LinkedIn`,
    copy.linkedin_post,
    ``,
    `---`,
    `<sub>Generated with launchkit · copy: ${LLM} via ${MODELS.copy} · image: ${MODELS.image}${
      videoUrl ? ` · video: ${MODELS.video}` : ""
    }</sub>`,
  ].join("\n");
  await writeFile(join(dir, "launch.md"), md);
  await writeFile(join(dir, "copy.json"), JSON.stringify(copy, null, 2));

  console.log(`\n✓ Launch kit ready in ${dir}/`);
}

main().catch((err) => {
  console.error(`\n✗ ${err?.body?.detail ? JSON.stringify(err.body.detail) : err.message ?? err}`);
  process.exit(1);
});
