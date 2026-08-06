# Planet maps

Equirectangular surface maps, one per body, fetched by `../tools/fetchbody.milo`
and embedded by `../assets.milo`.

**The `.png` maps are not in git.** Fetch them before building APSIS or ATLAS:

```bash
scripts/fetch-assets.sh --bodies
```

`font.png` is the exception — a hand-made bitmap font, committed, not fetched.

All public domain: USGS Astrogeology (Mercury, Venus, Moon, Mars, Jupiter,
Saturn) and NASA GIBS (Earth). Google imagery is not used — its terms forbid
redistribution.

Square on purpose: a 2:1 domain requested at 1:1, because the sampler masks both
axes with `w - 1`. Earth and Mars 2048², the rest 1024².
