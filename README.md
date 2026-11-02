# MMW

Three independent web apps live in this repository. They share no code, no assets and no deploy pipeline.

| App | Folder | What it is | Deploy |
| --- | --- | --- | --- |
| **Local** | `local/` | Web-project launcher and visual version timeline | `deploy-local.yml` → Cloudflare Pages project `mmw` |
| **تلاوات** | `tilawat/` | Qur'an reader and Yasser Al-Dosari recitation library | `deploy-tilawat.yml` → Cloudflare Pages project `tilawat` |
| **USPACE** | `uspace/` | Private-by-default local Markdown writing workspace with optional AI | `deploy-uspace.yml` → its own Cloudflare Pages project |

Each app has its own README and path-filtered deployment or validation workflow, so a change in one never rebuilds or redeploys the other. Old `/tilawat` links on the Local site redirect to Tilawat's own domain.

The Tilawat catalog worker lives in `tilawat/worker/` and deploys with `deploy-tilawat-catalog.yml`.
