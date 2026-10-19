# launchkit

**One line in, a launch out.** Give launchkit a product name and a one-line pitch, and it makes
the launch kit for you: an X thread, a LinkedIn post, a hero image and, if you want one, a 5-second teaser video.

```bash
launchkit "Pocket Studio" "Turn any product photo into a studio-quality ad in one API call" --video
```

```
launches/pocket-studio/
├── launch.md      # tagline, X thread, LinkedIn post, hero image embedded
├── copy.json      # the same copy as structured data
├── hero.jpg       # 16:9 launch banner
└── teaser.mp4     # 5s cinematic teaser (with --video)
```

## Why I built it

Shipping is half of a launch. The other half is getting people to try what you shipped: the hook,
the visual, the clip people stop scrolling for. launchkit is a small experiment in doing that whole second
half with generative media. You go from a pitch to a ready-to-post launch in about a minute.

## How it works

Three models chained on [fal](https://fal.ai), all called through one client and one API key:

| Step | Model | What it does |
|---|---|---|
| Copy | `openrouter/router` → Claude Sonnet 5 | Writes the tagline, X thread and LinkedIn post, plus the prompts for the next two steps |
| Image | `fal-ai/flux/schnell` | Renders a text-free 16:9 hero banner from the LLM's image prompt |
| Video | `fal-ai/kling-video/v3/standard/image-to-video` | Animates the hero image into a 5s teaser (optional) |

The LLM writes the creative brief for the image and video models, so every asset tells the same story.

## Setup

Requires Node.js 22.18+ (it runs the TypeScript directly, no build step).

```bash
git clone https://github.com/dogubalabann-alt/launchkit
cd launchkit
npm install
export FAL_KEY=...            # https://fal.ai/dashboard/keys
npm start -- "Product name" "One-line pitch"
```

| Option | |
|---|---|
| `--video` | Also render the teaser video. It takes longer and costs more than the image. |
| `--out <dir>` | Output directory (default `./launches`) |
| `LAUNCHKIT_LLM` | Any model `openrouter/router` supports, e.g. `google/gemini-3.8-flash` |

## Ideas for next

- `--style` presets (minimal, retro, product-shot) that steer the image and video prompts
- A/B variants of the hook post
- Model swaps per step to compare cost and quality across fal's catalog

## License

MIT
