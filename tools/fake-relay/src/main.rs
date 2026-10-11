//! `nodkey-fake-relay [ADDR]`: the fake relay and phone from nodkey-cli, for the browser tests.
//! Prints `listening on http://HOST:PORT` once ready. Never point a real agent at it.

fn main() {
    let bind = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "127.0.0.1:0".to_owned());
    let (_fake, addr) = nodkey_fake_relay::start_on(&bind, 1);
    println!("listening on http://{addr}");
    loop {
        std::thread::park();
    }
}
