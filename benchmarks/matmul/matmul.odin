package main

import "core:fmt"

N :: 256

main :: proc() {
	a := make([dynamic]f64)
	b := make([dynamic]f64)
	c := make([dynamic]f64)
	for i in 0 ..< N * N {
		append(&a, f64(i % N) + 0.1)
		append(&b, f64(i / N) + 0.1)
		append(&c, 0.0)
	}
	for r in 0 ..< N {
		for col in 0 ..< N {
			s: f64 = 0.0
			for k in 0 ..< N {
				s += a[r * N + k] * b[k * N + col]
			}
			c[r * N + col] = s
		}
	}
	fmt.printf("c[0]=%.2f c[last]=%.2f\n", c[0], c[N * N - 1])
}
