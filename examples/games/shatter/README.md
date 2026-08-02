# SHATTER

A brick breaker. One input, legible skill, cheap failure.

```bash
milo build examples/games/shatter/main.milo -o /tmp/shatter --release && /tmp/shatter
```

Arrows/A/D/mouse move the paddle, `SPACE` launches and restarts, `ESC` quits.

Where the ball lands on the paddle sets its exit angle; bricks broken without
touching the paddle combo up to 20×. Colour is the rule: green 1 hit, cyan 2,
violet 3, grey never, orange explodes. Eight shaped boards.
