# std/html

Escaping untrusted text for HTML output.

```milo
from "std/html" import { Html }
```

This is a security primitive, so read what it is *not* first: nothing here is a
sanitizer. It does not parse markup, strip tags, or make attacker-supplied HTML
safe to insert as HTML — that needs a parser and an element allowlist. These
functions take text that should appear literally and make it appear literally.

## The two contexts

```milo
fn Html.escapeText(s: &string): string   // element text, and quoted attributes
fn Html.escapeAttr(s: &string): string   // attribute values under any quoting
```

`escapeText` turns `&`, `<`, `>`, `"` and `'` into character references and
copies everything else, so UTF-8 passes through intact. It is safe in element
text, in RCDATA elements (`<title>`, `<textarea>`), and in an attribute value you
wrote quotes around. Quotes are escaped even though element text does not need
it — that way the common mistake of reaching for the text escaper inside a quoted
attribute is still safe.

`escapeAttr` escapes all of that plus the bytes that terminate or extend an
*unquoted* attribute value: space, tab, LF, FF, CR, `=` and backtick. The result
is safe whether or not the template quoted the attribute.

```milo
let name = "x' onerror='alert(1)"
print("<div title='" + Html.escapeAttr(name) + "'>")
// <div title='x&#39;&#32;onerror&#61;&#39;alert(1)'>
```

The noise is the point. Correctness must not depend on the caller having
remembered quotes at a call site the escaper cannot see. If your templates always
quote their attributes, `escapeText` produces cleaner output and is equally safe.

## Where escaping is the wrong tool

There is deliberately no function here for any of these:

| Context | Why escaping does not help |
|---|---|
| inside `<script>` / `<style>` | entities are not decoded there, and `</script>` still ends the element. Emit data in a `<script type="application/json">` block and read it from JS. |
| `href` / `src` / `action` | escaping does not stop `javascript:`. Check the scheme — see below. |
| tag or attribute *names* | only a fixed set you control belongs there. |
| inside an HTML comment | `--` and `>` have meaning escaping misses. |
| CSS values, URL components | those have their own encoders. |

## URL schemes

```milo
fn Html.isSafeUrl(url: &string): bool
```

True for a relative URL, or an absolute one whose scheme is `http`, `https`,
`mailto` or `tel`. False for `javascript:`, `data:`, `vbscript:`, `file:`, and
for any input containing a C0 control byte or DEL — browsers strip some of those
before resolving the scheme, so `java\tscript:x` navigates exactly where
`javascript:x` does.

```milo
let href = "javascript:alert(1)"
if Html.isSafeUrl(href) {
    print("<a href=\"" + Html.escapeAttr(href) + "\">link</a>")
} else {
    print("<span>link</span>")
}
```

A scheme allowlist is all it is. It says nothing about *where* the URL points, so
it is not an open-redirect check and not an SSRF check, and a `true` answer does
not remove the need to escape.

## Decoding

```milo
fn Html.unescape(s: &string): string
```

Decodes the five predefined entities (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;`) and
numeric character references (`&#39;`, `&#x27;`), leaving every other
`&`-sequence exactly as it was. It is not a full HTML5 named-entity table:
`&nbsp;` comes back as the literal seven characters. References to surrogates or
out-of-range code points decode to U+FFFD rather than producing bytes that would
not decode back as UTF-8.

This is a display decoder, not a security function. Never decode before a
security check and then emit the escaped original — that is the classic way to
make a check and a renderer disagree.
