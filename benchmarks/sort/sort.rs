const N: i64 = 500000;

fn quicksort(arr: &mut Vec<f64>, lo: i64, hi: i64) {
    if lo >= hi {
        return;
    }
    let pivot = arr[hi as usize];
    let mut i = lo;
    let mut j = lo;
    while j < hi {
        if arr[j as usize] < pivot {
            arr.swap(i as usize, j as usize);
            i += 1;
        }
        j += 1;
    }
    arr.swap(i as usize, hi as usize);
    quicksort(arr, lo, i - 1);
    quicksort(arr, i + 1, hi);
}

fn main() {
    let mut arr: Vec<f64> = Vec::new();
    let mut seed: i64 = 42;
    for _ in 0..N {
        seed = (seed * 16807) % 2147483647;
        arr.push(seed as f64 / 2147483647.0);
    }
    quicksort(&mut arr, 0, N - 1);
    println!("first: {:.6}", arr[0]);
    println!("last: {:.6}", arr[(N - 1) as usize]);
}
