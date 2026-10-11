use nodkey_proto::{Answer, KeyPair, Request, parse_plaintext};
use serde_json::{Value, json};

use super::*;

fn vectors() -> Value {
    nodkey_proto::vectors::build()
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or_else(|| panic!("{k}"))
}

fn x25519(sk_b64u: &str, enc_b64u: &str) -> Vec<u8> {
    let sk = b64u::decode_array::<32>(sk_b64u).unwrap();
    let enc = b64u::decode_array::<32>(enc_b64u).unwrap();
    x25519_dalek::x25519(sk, enc).to_vec()
}

#[test]
fn opens_every_answer_and_the_grant_with_an_outside_x25519() {
    let v = vectors();
    let agent = &v["keys"]["agent"];
    let phone = &v["keys"]["phone"];
    let mut answers = 0;
    for h in v["hpke"].as_array().unwrap() {
        let (enc, sealed) = (s(h, "enc"), json!({"enc": h["enc"], "ct": h["ct"]}));
        let dh = x25519(s(h, "recipient_kem_sk"), enc);
        match s(h, "purpose") {
            "answer" => {
                let aad = s(h, "aad");
                let (rid, pid) = aad.split_at(aad.len() - 22);
                let out =
                    open_answer(&dh, s(agent, "kem_pk"), &sealed.to_string(), rid, pid).unwrap();
                let a: Answer = serde_json::from_str(&out).unwrap();
                let expected: Answer = parse_plaintext(s(h, "plaintext").as_bytes()).unwrap();
                assert_eq!(a, expected, "{}", s(h, "name"));
                assert!(
                    open_answer(&dh, s(agent, "kem_pk"), &sealed.to_string(), "x", pid).is_err()
                );
                answers += 1;
            }
            "pairing" => {
                let claimed = json!({
                    "phone_id": phone["id"], "sign": phone["sign_pk"], "kem": phone["kem_pk"],
                    "enc": h["enc"], "ct": h["ct"],
                });
                let out = open_grant(
                    &dh,
                    s(agent, "sign_pk"),
                    s(agent, "kem_pk"),
                    &claimed.to_string(),
                    "k7p-2qx",
                )
                .unwrap();
                let p: Value = serde_json::from_str(&out).unwrap();
                assert_eq!(p["check"], v["check"]["display"]);
                assert_eq!(p["phone_name"], "Test iPhone");
                assert_eq!(p["phone_id"], phone["id"]);
                // Another agent key gives another check number: refused.
                let other = KeyPair::generate().public();
                assert!(
                    open_grant(
                        &dh,
                        &other.sign_b64u(),
                        s(agent, "kem_pk"),
                        &claimed.to_string(),
                        "K7P2QX"
                    )
                    .unwrap_err()
                    .contains("check numbers differ")
                );
            }
            _ => {}
        }
    }
    assert!(answers >= 7);
}

#[test]
fn sealed_requests_open_on_the_phone() {
    let phone = KeyPair::generate();
    let agent_id = nodkey_proto::random_id();
    let password: Value =
        serde_json::from_str(&seal_password(&agent_id, &phone.public().kem_b64u(), "pw").unwrap())
            .unwrap();
    let draft = json!({
        "kind": "save", "target": "vg.no", "reason": "Save the login you just used on vg.no",
        "agent": "Firefox on Linux",
        "save": {"url": "https://www.vg.no/login", "username": "alex@example.com", "password": password},
        "client": {"app": "Nodkey for Firefox"},
    });
    let out = seal_request(
        &draft.to_string(),
        &agent_id,
        &phone.public().kem_b64u(),
        1.7e9,
    )
    .unwrap();
    let out: Value = serde_json::from_str(&out).unwrap();
    let rid = s(&out, "request_id");
    let env = &out["envelope"];
    assert_eq!(env["request_id"], rid);
    assert!(env.get("attachment").is_none());
    let plain = Purpose::Request
        .open(
            phone.kem_secret(),
            &b64u::decode(s(env, "enc")).unwrap(),
            &nodkey_proto::aad(rid, &agent_id),
            &b64u::decode(s(env, "ct")).unwrap(),
        )
        .unwrap();
    let r: Request = parse_plaintext(&plain).unwrap();
    assert_eq!(r.kind, Kind::Save);
    assert_eq!(r.ts, 1_700_000_000);
    let opened = Purpose::Password
        .open_box(
            phone.kem_secret(),
            &r.save.unwrap().password,
            agent_id.as_bytes(),
        )
        .unwrap();
    assert_eq!(&opened[..], b"pw");

    // The same checks as the command line.
    let bad = json!({"kind": "code", "target": "", "reason": "x", "agent": "A"});
    assert!(
        seal_request(&bad.to_string(), &agent_id, &phone.public().kem_b64u(), 1.0)
            .unwrap_err()
            .contains("target is required")
    );
    let unknown = json!({"kind": "code", "target": "a", "reason": "x", "agent": "A", "extra": 1});
    assert!(
        seal_request(
            &unknown.to_string(),
            &agent_id,
            &phone.public().kem_b64u(),
            1.0
        )
        .is_err()
    );
}

#[test]
fn auth_header_verifies() {
    let keys = KeyPair::generate();
    let id = nodkey_proto::random_id();
    let msg = auth_message("GET", "/v1/requests/abc?wait=60", 1_791_620_000.0, b"");
    use ed25519_dalek::Signer;
    let sig = keys.signing_key().sign(msg.as_bytes()).to_bytes();
    let header = auth_header(&id, 1_791_620_000.0, &sig).unwrap();
    let parsed = auth::parse(&header).unwrap();
    assert_eq!(parsed.id, id);
    assert!(
        auth::verify(
            &header,
            &keys.public().sign,
            "GET",
            "/v1/requests/abc?wait=60",
            b"",
            1_791_620_000
        )
        .is_ok()
    );
    assert!(auth_header(&id, 1.0, &[0; 63]).is_err());
}

#[test]
fn small_helpers() {
    assert_eq!(normalize_code("k7p-2qx").unwrap(), "K7P2QX");
    assert!(normalize_code("nope").is_err());
    assert_eq!(display_code("K7P2QX"), "K7P-2QX");
    assert_eq!(
        sniff_image(&nodkey_proto::vectors::PNG).as_deref(),
        Some("image/png")
    );
    assert_eq!(sniff_image(b"<svg/>"), None);
    assert_eq!(b64u_decode(&b64u_encode(b"hi")).unwrap(), b"hi");
    assert_eq!(random_id().len(), 22);
}
