# Examples

Runnable programs; also stdlib tests.
`./milo run examples/hello.milo`

- `basics/` — fib, json, arenas, interp
- `cli-tools/` — grep, jq, tree, fmt
- `games/` — atlas (planets), apsis (orbits), flight (3D), dig, shatter, neon, volt, yap

Every game here binds SDL2 through the [`sdl`](https://github.com/milo-language/milo-sdl)
package rather than restating the declarations, and the three that render on the GPU —
flight, apsis, atlas — also depend on [`gl`](https://github.com/milo-language/milo-gl). Both
are listed in each game's `milo.json`, so run `milo pkg install` in that directory once
before building it. There used to be seven near-identical copies of those bindings across
this tree, and the drift cost flight its entire soundtrack: one copy asked SDL_Init for
video and not audio, which is not an error — it just makes every sound a silent no-op.
- `graphics/` — donut, plasma, raytracers; `graphics/gpu/` needs the `gl` package
- `simulation/` — cloth, rigid bodies
- `terminal/` — tetris, sysmon, tmux
- `net/` — servers, weather, termpair
- `embedded/` — bare-metal PID
- `tools/` — java-dap

emulators, milojs, dapweb: own repos.
