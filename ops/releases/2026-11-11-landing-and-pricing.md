# 2026-11-11 Landing page and pricing page

## What changed
- Pricing page: "Model Square" renamed "Model Pricing"; opens as a table; endpoint-type filter removed. Commits `deb261369`, `7ccd6cccc`.
- Landing page `web/public/brand/home.html` replaced by the new interactive version. Commit `b46cf2b10`.
- Hard claims removed from the landing page (99.9% availability, millisecond failover, "fully compliant", "all clusters operational"). Commit `f67c796af`.
- Workbench links point to `https://xingyuqiusuo.com/product.html`.

## How it is live
- Not through an image. The origin OpenResty serves the file from disk (see O-17 in `ops/CONTROL.md`).
- Origin file: `/opt/1panel/www/sites/ai.bozzii.com/index/brand/home.html`. Verified 200, 1092910 bytes.
- The pricing page changes are in git only. They are NOT live until a new image (for example `bozzii.4`) is built and deployed per `runbooks/04-release.md`.

## Open items for the operator
1. Refresh `https://ai.bozzii.com/brand/home.html` in the Alibaba ESA console (edge keeps it about 1 hour).
2. Not yet tested: mobile width, Safari/Firefox, low-end device WebGL, no-JavaScript view.
3. Remaining claims to review with someone who owns compliance: ICP number, company name, "domestic models run on cloud-vendor self-deployed clusters", the price table.
4. Build and deploy the next image, then follow O-17 (copy the file or remove `brand.conf`).

## Rollback
Restore the previous `home.html` on the origin from `git show 14247035e:web/public/brand/home.html`, or delete `brand.conf` and reload OpenResty.
