package main

import "core:fmt"

fib :: proc(n: i64) -> i64 {
	if n < 2 {
		return n
	}
	return fib(n - 1) + fib(n - 2)
}

main :: proc() {
	n: i64 = 35
	fmt.printf("fib(%d) = %d\n", n, fib(n))
}
