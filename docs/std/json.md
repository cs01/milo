# std/json

## std/json

### `Json.arr`

```milo
fn Json.arr(): JsonArr
```

New empty array builder.

### `Json.asBool`

```milo
fn Json.asBool(self: &Json): Option<bool>
```

_Undocumented._

### `Json.asF64`

```milo
fn Json.asF64(self: &Json): Option<f64>
```

_Undocumented._

### `Json.asI64`

```milo
fn Json.asI64(self: &Json): Option<i64>
```

_Undocumented._

### `Json.asStr`

```milo
fn Json.asStr(self: &Json): Option<string>
```

_Undocumented._

### `Json.at`

```milo
fn Json.at(self: &Json, index: i64): Option<Json>
```

_Undocumented._

### `Json.bool`

```milo
fn Json.bool(self: &Json, key: &string): Option<bool>
```

_Undocumented._

### `Json.boolAt`

```milo
fn Json.boolAt(self: &Json, index: i64, key: &string): Option<bool>
```

_Undocumented._

### `Json.boolPath`

```milo
fn Json.boolPath(self: &Json, p: &string): Option<bool>
```

_Undocumented._

### `Json.childBoolAt`

```milo
fn Json.childBoolAt(self: &Json, key: &string, index: i64, subKey: &string): Option<bool>
```

_Undocumented._

### `Json.childF64At`

```milo
fn Json.childF64At(self: &Json, key: &string, index: i64, subKey: &string): Option<f64>
```

_Undocumented._

### `Json.childI64At`

```milo
fn Json.childI64At(self: &Json, key: &string, index: i64, subKey: &string): Option<i64>
```

_Undocumented._

### `Json.childLen`

```milo
fn Json.childLen(self: &Json, key: &string): i64
```

_Undocumented._

### `Json.childStrAt`

```milo
fn Json.childStrAt(self: &Json, key: &string, index: i64, subKey: &string): Option<string>
```

_Undocumented._

### `Json.curBool`

```milo
fn Json.curBool(self: &Json, cur: i64): Option<bool>
```

_Undocumented._

### `Json.curChild`

```milo
fn Json.curChild(self: &Json, cur: i64, index: i64): i64
```

_Undocumented._

### `Json.curField`

```milo
fn Json.curField(self: &Json, cur: i64, key: &string): i64
```

_Undocumented._

### `Json.curFloat`

```milo
fn Json.curFloat(self: &Json, cur: i64): Option<f64>
```

_Undocumented._

### `Json.curInt`

```milo
fn Json.curInt(self: &Json, cur: i64): Option<i64>
```

_Undocumented._

### `Json.curKind`

```milo
fn Json.curKind(self: &Json, cur: i64): i32
```

Node kind at the cursor: 0 null, 1 bool, 2 number, 3 string, 4 array,
5 object; -1 if the cursor is invalid.

### `Json.curLen`

```milo
fn Json.curLen(self: &Json, cur: i64): i64
```

_Undocumented._

### `Json.curPath`

```milo
fn Json.curPath(self: &Json, p: &string): i64
```

Cursor at the end of a dotted path — "a.b", "items[0].name". A missing key,
an out-of-range index or a shape mismatch yields -1, which every cursor
accessor already reads as "nothing here", so the walk is total for any input.
A key containing '.' or '[' is not addressable this way; use get()/at().

### `Json.curRoot`

```milo
fn Json.curRoot(self: &Json): i64
```


`get`/`at` above return an owned Json by deep-cloning the whole document
(source string + every node) per call — navigating a large doc thousands
of times blows up to gigabytes. The cursor API instead treats a plain
`i64` node index as a cursor into THIS document: navigation returns child
indices (‑1 = missing) with zero allocation, and only leaf-string reads
materialize (just that one string). Start at `curRoot()` and chain:
  let user = doc.curField(doc.curChild(doc.curRoot(), 0), "name")
  match doc.curStr(user) { Option.Some(s) => ..., Option.None => ... }

### `Json.curStr`

```milo
fn Json.curStr(self: &Json, cur: i64): Option<string>
```

_Undocumented._

### `Json.f64`

```milo
fn Json.f64(self: &Json, key: &string): Option<f64>
```

_Undocumented._

### `Json.f64At`

```milo
fn Json.f64At(self: &Json, index: i64, key: &string): Option<f64>
```

_Undocumented._

### `Json.f64Path`

```milo
fn Json.f64Path(self: &Json, p: &string): Option<f64>
```

_Undocumented._

### `Json.get`

```milo
fn Json.get(self: &Json, key: &string): Option<Json>
```

_Undocumented._

### `Json.getAt`

```milo
fn Json.getAt(self: &Json, index: i64, key: &string): Option<Json>
```

_Undocumented._

### `Json.i64`

```milo
fn Json.i64(self: &Json, key: &string): Option<i64>
```

_Undocumented._

### `Json.i64At`

```milo
fn Json.i64At(self: &Json, index: i64, key: &string): Option<i64>
```

_Undocumented._

### `Json.i64Path`

```milo
fn Json.i64Path(self: &Json, p: &string): Option<i64>
```

_Undocumented._

### `Json.isArray`

```milo
fn Json.isArray(self: &Json): bool
```

_Undocumented._

### `Json.isBool`

```milo
fn Json.isBool(self: &Json): bool
```

_Undocumented._

### `Json.isNull`

```milo
fn Json.isNull(self: &Json): bool
```

_Undocumented._

### `Json.isNum`

```milo
fn Json.isNum(self: &Json): bool
```

_Undocumented._

### `Json.isObject`

```milo
fn Json.isObject(self: &Json): bool
```

_Undocumented._

### `Json.isStr`

```milo
fn Json.isStr(self: &Json): bool
```

_Undocumented._

### `Json.keys`

```milo
fn Json.keys(self: &Json): Vec<string>
```

_Undocumented._

### `Json.len`

```milo
fn Json.len(self: &Json): i64
```

_Undocumented._

### `Json.obj`

```milo
fn Json.obj(): JsonObj
```

New empty object builder: Json.obj().set("k", ...).build().

### `Json.parse`

```milo
fn Json.parse(s: string): Result<Json>
```

Parse strict RFC 8259 JSON. Propagate failures with `?` or match on the error.

### `Json.parseJsonc`

```milo
fn Json.parseJsonc(s: string): Result<Json>
```

Parse JSON with JSONC extensions (comments, trailing commas).

### `Json.path`

```milo
fn Json.path(self: &Json, p: &string): Option<Json>
```

_Undocumented._

### `Json.rawStr`

```milo
fn Json.rawStr(self: &Json): string
```

_Undocumented._

### `Json.str`

```milo
fn Json.str(self: &Json, key: &string): Option<string>
```

_Undocumented._

### `Json.strAt`

```milo
fn Json.strAt(self: &Json, index: i64, key: &string): Option<string>
```

_Undocumented._

### `Json.strPath`

```milo
fn Json.strPath(self: &Json, p: &string): Option<string>
```

_Undocumented._

### `JsonArr.arr`

```milo
fn JsonArr.arr(self: JsonArr, val: JsonArr): JsonArr
```

_Undocumented._

### `JsonArr.bool`

```milo
fn JsonArr.bool(self: JsonArr, val: bool): JsonArr
```

_Undocumented._

### `JsonArr.build`

```milo
fn JsonArr.build(self: &JsonArr): string
```

_Undocumented._

### `JsonArr.float`

```milo
fn JsonArr.float(self: JsonArr, val: f64): JsonArr
```

_Undocumented._

### `JsonArr.int`

```milo
fn JsonArr.int(self: JsonArr, val: i64): JsonArr
```

_Undocumented._

### `JsonArr.nil`

```milo
fn JsonArr.nil(self: JsonArr): JsonArr
```

_Undocumented._

### `JsonArr.obj`

```milo
fn JsonArr.obj(self: JsonArr, val: JsonObj): JsonArr
```

_Undocumented._

### `JsonArr.raw`

```milo
fn JsonArr.raw(self: JsonArr, json: string): JsonArr
```

Splice a pre-serialized JSON value verbatim (caller guarantees validity).

### `JsonArr.str`

```milo
fn JsonArr.str(self: JsonArr, val: string): JsonArr
```

_Undocumented._

### `JsonArr.val`

```milo
fn JsonArr.val(self: JsonArr, val: JsonVal): JsonArr
```

_Undocumented._

### `jsonEscapeStr`

```milo
pub fn jsonEscapeStr(s: &string): string
```

_Undocumented._

### `JsonObj.arr`

```milo
fn JsonObj.arr(self: JsonObj, key: string, val: JsonArr): JsonObj
```

_Undocumented._

### `JsonObj.bool`

```milo
fn JsonObj.bool(self: JsonObj, key: string, val: bool): JsonObj
```

_Undocumented._

### `JsonObj.boolOpt`

```milo
fn JsonObj.boolOpt(self: JsonObj, key: string, val: Option<bool>): JsonObj
```

_Undocumented._

### `JsonObj.build`

```milo
fn JsonObj.build(self: &JsonObj): string
```

_Undocumented._

### `JsonObj.float`

```milo
fn JsonObj.float(self: JsonObj, key: string, val: f64): JsonObj
```

_Undocumented._

### `JsonObj.floatOpt`

```milo
fn JsonObj.floatOpt(self: JsonObj, key: string, val: Option<f64>): JsonObj
```

_Undocumented._

### `JsonObj.int`

```milo
fn JsonObj.int(self: JsonObj, key: string, val: i64): JsonObj
```

_Undocumented._

### `JsonObj.intOpt`

```milo
fn JsonObj.intOpt(self: JsonObj, key: string, val: Option<i64>): JsonObj
```

_Undocumented._

### `JsonObj.nil`

```milo
fn JsonObj.nil(self: JsonObj, key: string): JsonObj
```

_Undocumented._

### `JsonObj.obj`

```milo
fn JsonObj.obj(self: JsonObj, key: string, val: JsonObj): JsonObj
```

_Undocumented._

### `JsonObj.raw`

```milo
fn JsonObj.raw(self: JsonObj, key: string, json: string): JsonObj
```

Splice a pre-serialized JSON value verbatim (caller guarantees validity).

### `JsonObj.str`

```milo
fn JsonObj.str(self: JsonObj, key: string, val: string): JsonObj
```

_Undocumented._

### `JsonObj.strOpt`

```milo
fn JsonObj.strOpt(self: JsonObj, key: string, val: Option<string>): JsonObj
```

Optional-field helpers: add the key only when the Option is Some, so a
conditional field stays inside the fluent chain instead of breaking out
to an `if` around each call.

### `JsonObj.val`

```milo
fn JsonObj.val(self: JsonObj, key: string, val: JsonVal): JsonObj
```

_Undocumented._

### `jsonPull`

```milo
pub fn jsonPull(src: string): JsonPull
```

_Undocumented._

### `JsonPull.next`

```milo
fn JsonPull.next(self: &mut JsonPull): JsonToken
```

_Undocumented._

### `jsonSer`

```milo
pub fn jsonSer(v: &JsonVal): string
```

_Undocumented._
