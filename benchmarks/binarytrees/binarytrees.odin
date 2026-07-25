package main

import "core:fmt"

Node :: struct {
	l: ^Node,
	r: ^Node,
}

make_tree :: proc(d: i32) -> ^Node {
	n := new(Node)
	if d <= 0 {
		n.l = nil
		n.r = nil
		return n
	}
	n.l = make_tree(d - 1)
	n.r = make_tree(d - 1)
	return n
}

check :: proc(n: ^Node) -> i32 {
	if n.l == nil {
		return 1
	}
	return 1 + check(n.l) + check(n.r)
}

free_tree :: proc(n: ^Node) {
	if n == nil {
		return
	}
	free_tree(n.l)
	free_tree(n.r)
	free(n)
}

main :: proc() {
	depth: i32 = 15
	t := make_tree(depth)
	c := check(t)
	free_tree(t)
	fmt.printf("depth %d check=%d\n", depth, c)
}
