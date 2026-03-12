# contributing to clawdown

clawd welcomes help. here's how to get started.

## setup

```bash
git clone https://github.com/RA1NCS/clawdown.git
cd clawdown
open index.html
```

no build step, no dependencies to install. it's three files.

## structure

- `index.html` — DOM skeleton and CDN script tags
- `style.css` — all theming, layout, page break visuals
- `app.js` — clawd SVG, render pipeline, PDF export

## guidelines

- keep it vanilla. no frameworks, no build tools, no npm.
- test PDF export after any layout or styling change.
- clawd's pixel art is sacred. don't touch the sprite without opening an issue first.
- match the existing code style (camelCase, single quotes, no semicolons in markup).

## submitting changes

1. fork the repo
2. create a branch (`git checkout -b my-fix`)
3. make your changes
4. open a PR with a short description of what and why

## feedback

not a coder? you can still help.

> [leave feedback](https://app.youform.com/forms/wvdaxjhc)

bug reports, feature ideas, typos — all welcome.
