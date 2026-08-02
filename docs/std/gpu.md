# std/gpu

## std/gpu

### `bindScreen`

```milo
pub fn bindScreen(w: i64, h: i64)
```

Render to the window again. `w`/`h` are the drawable size in pixels, which on
a Retina display is not the window size — ask SDL_GL_GetDrawableSize, not
SDL_GetWindowSize, or half the frame goes missing.

### `Gpu.blendAdd`

```milo
fn Gpu.blendAdd()
```

Additive, for light. The whole point of an HDR target is that this can run
past 1.0 without clipping.

### `Gpu.blendAlpha`

```milo
fn Gpu.blendAlpha()
```

_Undocumented._

### `Gpu.blendOff`

```milo
fn Gpu.blendOff()
```

_Undocumented._

### `Gpu.clear`

```milo
fn Gpu.clear(r: f64, g: f64, b: f64, a: f64, depth: bool)
```

_Undocumented._

### `Gpu.cullBackFaces`

```milo
fn Gpu.cullBackFaces(on: bool)
```

_Undocumented._

### `Gpu.depthTest`

```milo
fn Gpu.depthTest(on: bool)
```

_Undocumented._

### `Gpu.depthWrite`

```milo
fn Gpu.depthWrite(on: bool)
```

_Undocumented._

### `Gpu.error`

```milo
fn Gpu.error(): u32
```

Any GL error latched since the last check. GL keeps one flag per error
type and clears it on read, so this drains only the first.

### `Gpu.finish`

```milo
fn Gpu.finish()
```

Block until the GPU has finished everything submitted. GL commands are
queued, so without this a timer around a frame measures how long it took
to *ask* — which on a warm driver is nearly free and tells you nothing.

### `Gpu.version`

```milo
fn Gpu.version(): string
```

The driver's GL version string, e.g. "4.1 Metal - 90.5". Useful in a
startup log: a context that silently fell back to 2.1 fails later, in a
shader compile, with an error that does not mention the version.

### `Gpu.viewport`

```milo
fn Gpu.viewport(x: i64, y: i64, w: i64, h: i64)
```

_Undocumented._

### `Mesh.draw`

```milo
fn Mesh.draw(self: &Mesh)
```

_Undocumented._

### `Mesh.free`

```milo
fn Mesh.free(self: &Mesh)
```

_Undocumented._

### `Mesh.fullscreenQuad`

```milo
fn Mesh.fullscreenQuad(): Mesh
```

Two triangles covering clip space, with UVs — the input to every
post-processing pass. Position is vec2 at location 0, UV vec2 at 1.

### `Mesh.new`

```milo
fn Mesh.new(attrs: &Vec<i64>): Mesh
```

_Undocumented._

### `Mesh.upload`

```milo
fn Mesh.upload(self: &mut Mesh, data: &Vec<f32>)
```

Replace the whole buffer. GL_STREAM_DRAW plus a full respecify is the
orphaning idiom: the driver hands back a fresh allocation instead of
stalling until the last frame's draw has finished reading the old one.

### `readPixelsRgba8`

```milo
pub fn readPixelsRgba8(w: i64, h: i64): Vec<u32>
```

Read back the bound framebuffer as ABGR8888 words — the layout SDL textures
and the software canvases here already use, so a frame read off the GPU can be
written straight out as a screenshot. Row 0 is the BOTTOM of the image in GL's
convention; flip it if you are writing PPM or PNG.

This stalls the pipeline until the GPU has caught up, which is exactly what a
headless smoke test wants and exactly what a frame loop does not.

### `Shader.bind`

```milo
fn Shader.bind(self: &Shader)
```

_Undocumented._

### `Shader.compile`

```milo
fn Shader.compile(vert: &string, frag: &string): Result<Shader, string>
```

Compile and link a vertex/fragment pair. The error is the driver's own log,
which names the line — there is nothing this module could add to it.

### `Shader.free`

```milo
fn Shader.free(self: &Shader)
```

_Undocumented._

### `Shader.loc`

```milo
fn Shader.loc(self: &Shader, name: &string): i32
```

-1 for a name the linker dropped, which every glUniform* call ignores. A
dead uniform is a normal thing (an unused branch of a shader), so this is
not an error.

### `Shader.sampler`

```milo
fn Shader.sampler(self: &Shader, name: &string, tex: &Texture2D, unit: i64)
```

Bind `tex` to texture unit `unit` and point the sampler at it.

### `Shader.uniform2F`

```milo
fn Shader.uniform2F(self: &Shader, name: &string, a: f64, b: f64)
```

_Undocumented._

### `Shader.uniform3F`

```milo
fn Shader.uniform3F(self: &Shader, name: &string, a: f64, b: f64, c: f64)
```

_Undocumented._

### `Shader.uniform4F`

```milo
fn Shader.uniform4F(self: &Shader, name: &string, a: f64, b: f64, c: f64, d: f64)
```

_Undocumented._

### `Shader.uniformF`

```milo
fn Shader.uniformF(self: &Shader, name: &string, v: f64)
```

_Undocumented._

### `Shader.uniformI`

```milo
fn Shader.uniformI(self: &Shader, name: &string, v: i64)
```

Uniform setters bind the program first: forgetting to is the single most
common way a uniform silently goes to whichever shader ran last.

### `Shader.uniformMat4`

```milo
fn Shader.uniformMat4(self: &Shader, name: &string, m: &Vec<f32>)
```

A 4x4 matrix in column-major order — sixteen floats, the layout GLSL's
`mat4` already has, so `transpose` stays false and nothing reorders.

### `Target.bind`

```milo
fn Target.bind(self: &Target)
```

Bind and set the viewport together. Every bug where a quarter-resolution
pass rendered into the top-left sixteenth of its own target was these two
lines drifting apart.

### `Target.bindTexture`

```milo
fn Target.bindTexture(self: &Target, unit: i64)
```

Bind what this target rendered as an input to the next pass. The colour
texture is not handed out as a value on purpose: a second `Texture2D`
holding the same GL name would be a second thing that thinks it may free
it, and second-class references mean it cannot be lent out either.

### `Target.free`

```milo
fn Target.free(self: &Target)
```

_Undocumented._

### `Target.new`

```milo
fn Target.new(w: i64, h: i64, depth: bool, smooth: bool): Result<Target, string>
```

_Undocumented._

### `Texture2D.bind`

```milo
fn Texture2D.bind(self: &Texture2D, unit: i64)
```

_Undocumented._

### `Texture2D.free`

```milo
fn Texture2D.free(self: &Texture2D)
```

_Undocumented._

### `Texture2D.rgb32f`

```milo
fn Texture2D.rgb32f(w: i64, h: i64, pixels: &Vec<f32>, smooth: bool): Texture2D
```

Three floats per pixel of unbounded linear light. This is the format an
HDR canvas is already in, so uploading one is a straight memcpy.

### `Texture2D.rgba16f`

```milo
fn Texture2D.rgba16f(w: i64, h: i64, smooth: bool): Texture2D
```

An empty half-float target, for a framebuffer to render into. Half is
enough for light that has already been exposed, and halves the bandwidth
of every blur tap against RGBA32F.

### `Texture2D.rgba8`

```milo
fn Texture2D.rgba8(w: i64, h: i64, pixels: &Vec<u32>, smooth: bool): Texture2D
```

An 8-bit RGBA texture from packed ABGR8888 words — the same layout the
software renderers here hand to SDL, so a CPU framebuffer uploads with no
repacking.

### `Texture2D.updateRgb32f`

```milo
fn Texture2D.updateRgb32f(self: &Texture2D, pixels: &Vec<f32>)
```

_Undocumented._

### `Texture2D.updateRgba8`

```milo
fn Texture2D.updateRgba8(self: &Texture2D, pixels: &Vec<u32>)
```

_Undocumented._
