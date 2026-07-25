package main

import "core:fmt"

N :: 500000

quicksort :: proc(arr: []f64, lo: int, hi: int) {
	if lo >= hi {
		return
	}
	pivot := arr[hi]
	i := lo
	for j := lo; j < hi; j += 1 {
		if arr[j] < pivot {
			arr[i], arr[j] = arr[j], arr[i]
			i += 1
		}
	}
	arr[i], arr[hi] = arr[hi], arr[i]
	quicksort(arr, lo, i - 1)
	quicksort(arr, i + 1, hi)
}

main :: proc() {
	arr := make([dynamic]f64)
	seed: i64 = 42
	for _ in 0 ..< N {
		seed = (seed * 16807) % 2147483647
		append(&arr, f64(seed) / 2147483647.0)
	}
	quicksort(arr[:], 0, N - 1)
	fmt.printf("first: %.6f\n", arr[0])
	fmt.printf("last: %.6f\n", arr[N - 1])
}
