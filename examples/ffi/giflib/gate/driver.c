/*
 * The differential's only mouth. Compiled twice from this one source: once against the real
 * -lgif and once against libgifmilo.a, both times through the real <gif_lib.h>, so the two
 * binaries differ in exactly one thing, the implementation behind the symbols.
 *
 * Everything printed has to be a function of the input bytes alone. A pointer value, a
 * malloc size, a timing, or an uninitialised read would make the two binaries differ for
 * reasons that say nothing about the port, and a gate that goes red for reasons it cannot
 * explain gets muted. Hence hashes of buffers rather than dumps, and no addresses at all.
 */
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <gif_lib.h>

/* Distinguishable from every D_GIF_ERR_* code, so "C wrote nothing into *Error" is a
 * printable observation rather than an invisible one. Three of giflib's failure paths do
 * exactly that, and the port copies them deliberately. */
#define SENTINEL (-12345)

static uint64_t fnv1a(const unsigned char *p, size_t n) {
	uint64_t h = 1469598103934665603ULL;
	for (size_t i = 0; i < n; i++) {
		h ^= (uint64_t)p[i];
		h *= 1099511628211ULL;
	}
	return h;
}

static void printMap(const char *tag, const ColorMapObject *m) {
	if (m == NULL) {
		printf("%s nomap\n", tag);
		return;
	}
	/* Colors can be NULL with a nonzero count only if something went wrong; say so rather
	 * than dereferencing, because a crash is a diff the harness cannot read. */
	if (m->Colors == NULL) {
		printf("%s count=%d bpp=%d sort=%d nocolors\n", tag, m->ColorCount,
		       m->BitsPerPixel, (int)m->SortFlag);
		return;
	}
	printf("%s count=%d bpp=%d sort=%d rgb=%016llx\n", tag, m->ColorCount,
	       m->BitsPerPixel, (int)m->SortFlag,
	       (unsigned long long)fnv1a((const unsigned char *)m->Colors,
	                                 (size_t)(m->ColorCount < 0 ? 0 : m->ColorCount) * 3));
}

static void printBlocks(const char *tag, int count, const ExtensionBlock *blocks) {
	printf("%s extcount=%d\n", tag, count);
	if (blocks == NULL) {
		if (count > 0) {
			printf("%s extnull\n", tag);
		}
		return;
	}
	for (int i = 0; i < count; i++) {
		const ExtensionBlock *b = &blocks[i];
		if (b->Bytes == NULL) {
			printf("%s ext%d fn=0x%02x bytes=%d nobytes\n", tag, i, b->Function,
			       b->ByteCount);
			continue;
		}
		printf("%s ext%d fn=0x%02x bytes=%d hash=%016llx\n", tag, i, b->Function,
		       b->ByteCount,
		       (unsigned long long)fnv1a(b->Bytes,
		                                 (size_t)(b->ByteCount < 0 ? 0 : b->ByteCount)));
	}
}

int main(int argc, char **argv) {
	if (argc != 2) {
		printf("usage\n");
		return 2;
	}

	int err = SENTINEL;
	GifFileType *gif = DGifOpenFileName(argv[1], &err);
	if (gif == NULL) {
		printf("open=null err=%d\n", err);
		return 0;
	}
	printf("open=ok err=%d\n", err);

	int rc = DGifSlurp(gif);

	printf("screen w=%d h=%d res=%d bg=%d aspect=%d\n", gif->SWidth, gif->SHeight,
	       gif->SColorResolution, gif->SBackGroundColor, (int)gif->AspectByte);
	printMap("global", gif->SColorMap);
	printf("images=%d\n", gif->ImageCount);

	for (int i = 0; i < gif->ImageCount; i++) {
		if (gif->SavedImages == NULL) {
			printf("img%d nosaved\n", i);
			break;
		}
		SavedImage *si = &gif->SavedImages[i];
		char tag[64];
		snprintf(tag, sizeof tag, "img%d", i);
		printf("%s l=%d t=%d w=%d h=%d il=%d\n", tag, si->ImageDesc.Left,
		       si->ImageDesc.Top, si->ImageDesc.Width, si->ImageDesc.Height,
		       (int)si->ImageDesc.Interlace);
		char mtag[80];
		snprintf(mtag, sizeof mtag, "%s local", tag);
		printMap(mtag, si->ImageDesc.ColorMap);

		/* Hashing a raster is safe even after a failed slurp: giflib appends the
		 * SavedImage only once the image has fully decoded, so no raster reachable from
		 * SavedImages is ever a half-written malloc block whose tail would hash the
		 * allocator instead of the decoder. */
		long w = si->ImageDesc.Width, h = si->ImageDesc.Height;
		size_t n = (w > 0 && h > 0) ? (size_t)w * (size_t)h : 0;
		if (si->RasterBits == NULL) {
			printf("%s raster none\n", tag);
		} else {
			printf("%s raster n=%zu hash=%016llx\n", tag, n,
			       (unsigned long long)fnv1a(si->RasterBits, n));
		}
		printBlocks(tag, si->ExtensionBlockCount, si->ExtensionBlocks);
	}

	/* Extensions that trail the last image live on the file, not on a SavedImage; they are
	 * a separate list in C and a separate list in the port, so diff them separately. */
	printBlocks("file", gif->ExtensionBlockCount, gif->ExtensionBlocks);

	printf("error=%d slurp=%d\n", gif->Error, rc);

	int err2 = SENTINEL;
	int cl = DGifCloseFile(gif, &err2);
	printf("close=%d err=%d\n", cl, err2);
	return 0;
}
