const N: usize = 256;

fn main() {
    let mut a: Vec<f64> = Vec::new();
    let mut b: Vec<f64> = Vec::new();
    let mut c: Vec<f64> = Vec::new();
    for i in 0..N * N {
        a.push((i % N) as f64 + 0.1);
        b.push((i / N) as f64 + 0.1);
        c.push(0.0);
    }
    for r in 0..N {
        for col in 0..N {
            let mut s = 0.0f64;
            for k in 0..N {
                s += a[r * N + k] * b[k * N + col];
            }
            c[r * N + col] = s;
        }
    }
    println!("c[0]={:.2} c[last]={:.2}", c[0], c[N * N - 1]);
}
