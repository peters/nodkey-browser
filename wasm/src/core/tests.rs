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
fn passkey_requests_and_answers() {
    let v = vectors();
    let w = &v["webauthn"];
    let get = &w["get"];
    // The same clientDataJSON bytes as the vectors (and thus as the phone expects).
    let text: Value = serde_json::from_str(s(get, "client_data_json")).unwrap();
    let cdj = client_data_json("get", s(&text, "challenge"), s(w, "origin")).unwrap();
    assert_eq!(cdj, s(get, "client_data_json_b64u"));
    assert!(client_data_json("delete", "AAEC", "https://a.example").is_err());

    // A passkey request seals; one whose origin is not for the rp_id does not.
    let phone = KeyPair::generate();
    let agent_id = nodkey_proto::random_id();
    let rp_id = s(w, "rp_id");
    let request = json!({"op": "get", "rp_id": rp_id, "client_data_json": cdj,
        "allow_credentials": [s(w, "credential_id")], "user_verification": "required"});
    let draft = |target: &str, passkey: &Value| {
        json!({"kind": "passkey", "target": target, "reason": "Sign in", "agent": "Firefox on Linux",
            "passkey": passkey})
        .to_string()
    };
    let kem = phone.public().kem_b64u();
    assert!(seal_request(&draft(rp_id, &request), &agent_id, &kem, 1.7e9).is_ok());
    let evil = client_data_json("get", "AAEC", "https://evil.example").unwrap();
    let mut bad = request.clone();
    bad["client_data_json"] = json!(evil);
    assert!(seal_request(&draft(rp_id, &bad), &agent_id, &kem, 1.7e9).is_err());
    assert!(seal_request(&draft("evil.example", &request), &agent_id, &kem, 1.7e9).is_err());

    // The phone's answer from the vectors passes the agent's check; one for another site fails.
    let answer = json!({"credential_id": s(w, "credential_id"),
        "authenticator_data": s(get, "authenticator_data"), "signature": s(get, "signature"),
        "user_handle": s(w, "user_handle")});
    assert!(check_passkey_answer(&request.to_string(), &answer.to_string()).is_ok());
    let mut other = request.clone();
    other["rp_id"] = json!("other.example");
    assert!(check_passkey_answer(&other.to_string(), &answer.to_string()).is_err());
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

#[test]
fn sign_in_rules_follow_the_vectors() {
    let v = vectors();
    let signin = &v["signin"];
    for case in signin["sites"].as_array().unwrap() {
        assert_eq!(
            signin::site(s(case, "input")),
            case["site"].as_str().map(str::to_owned),
            "{case}"
        );
    }
    for case in signin["via_fill"].as_array().unwrap() {
        let via = json!({"account": {"issuer": "Test", "name": "alex", "site": case["via_site"]}});
        let allowed = signin::may_fill_via(
            s(case, "host"),
            s(case, "target"),
            &case["method"].to_string(),
            &via.to_string(),
        )
        .unwrap();
        assert_eq!(allowed, case["allowed"].as_bool().unwrap(), "{case}");
    }
    for case in signin["second_step_picks"].as_array().unwrap() {
        let pick =
            signin::second_step_pick(&case["order"].to_string(), &case["offered"].to_string())
                .unwrap();
        assert_eq!(pick, case["pick"].as_str().map(str::to_owned), "{case}");
    }
    // No order in the answer: the default (a passkey, then a code; avoid app prompts and SMS).
    let pick = signin::second_step_pick("null", r#"["app_prompt","totp","fax"]"#).unwrap();
    assert_eq!(pick.as_deref(), Some("totp"));
    assert_eq!(
        signin::second_step_pick("null", r#"["sms"]"#).unwrap(),
        None
    );
}

#[test]
fn seals_suggest_and_sms_code_requests() {
    let v = vectors();
    let phone = &v["keys"]["phone"];
    let suggest = json!({
        "kind": "suggest", "target": "renderfarm.example", "reason": "Signed in with Google",
        "agent": "Test browser",
        "suggest": {"method": {"kind": "federated", "provider": "google", "certainty": "seen",
                               "source": "extension"}, "outcome": "signed_in"}
    });
    let out = seal_request(&suggest.to_string(), "agent", s(phone, "kem_pk"), 1.0e9).unwrap();
    let sealed: Value = serde_json::from_str(&out).unwrap();
    assert!(sealed["envelope"].get("ttl").is_none());
    // Only the user confirms a method.
    let mut confirmed = suggest.clone();
    confirmed["suggest"]["method"]["certainty"] = json!("confirmed");
    assert!(seal_request(&confirmed.to_string(), "agent", s(phone, "kem_pk"), 1.0e9).is_err());

    let sms = json!({"kind": "sms_code", "target": "account.example.com",
                     "reason": "The site sent a code by SMS", "agent": "Test browser",
                     "wait_seconds": 120});
    let out = seal_request(&sms.to_string(), "agent", s(phone, "kem_pk"), 1.0e9).unwrap();
    let sealed: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(sealed["envelope"]["ttl"], json!(180));
    let mut long = sms.clone();
    long["wait_seconds"] = json!(301);
    assert!(seal_request(&long.to_string(), "agent", s(phone, "kem_pk"), 1.0e9).is_err());
}
