# FLYBY

Fly SF, Manhattan, Yosemite, the Grand Canyon and Honolulu — real places from
SRTM terrain, OSM buildings and aerial imagery, baked into the binary.

```bash
scripts/fetch-assets.sh --cities   # the cities are downloaded, not in git
milo build examples/games/flight/main.milo -o /tmp/flyby --release && /tmp/flyby
```

The places are baked into the binary, so the build fails outright without them;
fetching takes minutes the first time. See [cities/README.md](cities/README.md).

UP/DOWN climb and dive (up dives; `--natural` flips), LEFT/RIGHT bank, Q/E
rudder, Z/X throttle, SPACE burner, ENTER elsewhere, F fullscreen, ESC quit.

## Flying it

The model lives in [flight.milo](flight.milo) and is gated by
[tests/fixtures/flybyFlight.milo](../../../tests/fixtures/flybyFlight.milo),
which reaches no package and so actually runs in CI. Three things are modelled
honestly and one is deliberately not:

- **Airspeed is not groundspeed.** The throttle and the turn act on airspeed;
  the position advances by airspeed PLUS the wind, taken from the same station
  observation the sky is built from. Drift, crab and a downwind leg that eats
  the ground while the ASI never moves all fall out of that one separation. The
  model used to have no wind in it at all, so the live weather it draws so
  carefully was decoration the aircraft could not feel.
- **The vertical axis commands a rate of climb**, not an attitude, so it holds a
  height hands-off and holds it through a turn. A pitch axis that self-centres
  cannot hold a climb and one that does not needs trimming.
- **Density altitude.** Thrust and climb fall with air density, so a hot
  afternoon is mushier than a cold morning.
- **The turn rate is not truthful**, and `turnGain` says by how much. `g *
  tan(bank) / V` at 175 m/s and 40 degrees of bank is a 135-second circle. The
  gain is 19, which is a large number and is stated rather than hidden. The
  RELATION is scaled rather than replaced by a constant rate, which is what buys
  the part worth having: a burner pass comes round visibly wider than a cruise
  pass, and banking harder is what tightens it.

## The skyline budget

Buildings are budgeted, not fixed. `city.solveCullK` bisects the cull curve until
THIS city's skyline fits `SKYLINE_TRIS`, once, at load. Cities differ in density
by more than five times over the same radius, so a single hand-tuned constant is
either wasteful over the sparse city or unaffordable over the dense one -- and the
constant it replaces had been walked from three pixels to six by hand, tuned
against Manhattan and therefore throwing buildings away everywhere else.

Frame time at 1280x720, measured, before and after:

| place | fixed 0.010 | solved to 200k |
|---|---|---|
| San Francisco | 10 ms | 12 ms |
| Manhattan | **14 ms** | **11 ms** |
| Honolulu | 7 ms | 7 ms |
| Yosemite | 7 ms | 7 ms |
| Grand Canyon | 7 ms | 7 ms |

The number that matters is the worst one and it went from 14 to 12. The three
cheap places did not get slower and are drawing about ten times the skyline they
were: Honolulu's pack costs 40k triangles at the floor threshold and it was being
shown 4k. That is the wasteful half, and it is the half nobody notices, because a
city with buildings missing looks like a city with fewer buildings in it.

## The clock

`,` and `.` move the scene clock and `0` puts it back to now. The clock moves the
sun AND the weather, and answering only one of them would be worse than answering
neither: a dawn sky under this afternoon's cloud is a picture of a moment that
will never exist, and it is a picture that looks entirely plausible.

The band under the instruments paints the next sixty hours, and the twelve
behind, as the colour of each hour's own sky, so a clear dawn or an incoming
front is a stripe you can see and scrub to rather than something you find by
dragging blind. The light half of every swatch is arithmetic and needs no feed;
the cloud half comes from the hourly forecast, and an hour the forecast does not
reach keeps its light, loses its grey, and says so with a notch.

Weather comes from **Open-Meteo** now, which is keyless, global and hourly. The
NWS chain is kept and demoted to enrichment: it is the better observation and it
stops at the American border, and this game ships Honolulu, which its radar
composite does not even cover. It is also the only one of the two that names a
station, and a named station is what makes "the weather in the game is the
weather outside" checkable by someone standing under it.

The label says `LIVE`, `FORECAST +11H` or `SYNTHETIC SKY`. A prediction came off
the wire exactly as much as the current observation did, so "live" cannot be the
distinction between them; what separates them is when they describe. A panel that
said LIVE over a prediction would be the one dishonesty this chain exists to
avoid, and it is the one nothing on screen could reveal.

Scrubbing costs a recomposition of the cloud grid and no network at all. The
satellite and radar layers are the expensive half and they do not change when the
clock does; the station numbers are the cheap half and are exactly what an hourly
series can re-answer. See `composeField` in `live.milo`.

Gusts move the aircraft as a bounded OFFSET on the attitude, never as a rate
added to it. Integrating turbulence is a resonance rather than weather: the
aircraft rocks continuously and fights its own wings-level damping.

Five landmarks each, under a blue beam; find them all and the next place comes
in.

Everything renders on the GPU and it needs an OpenGL 3.3 core context — there is
no software fallback. There used to be one, behind `--cpu`, and losing it is a
real cost: a machine without 3.3 core now gets an error at startup rather than a
slower picture. It bought the sky. One `skyColor` function now answers the sky
pass, the distance haze and the sea reflection, so all three agree by
construction — which they could not while every visual change had to land twice
and look the same both times, and which is why the sea used to reflect a flat
grey sheet and look like one.

The scene renders at the window's own size, so a bigger window draws more pixels
instead of scaling up a fixed frame. `--ss` renders at twice that and downsamples,
which is what thin building edges over a city want.

The software rasteriser it used to have is not deleted — it lives in
[benchmarks/softraster](../../../benchmarks/softraster), where it is a benchmark
with no picture to match rather than a second renderer to keep in step.
