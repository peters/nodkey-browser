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

/// The extension's two steps for a request, with a key in memory instead of WebCrypto.
fn seal(
    draft: &Value,
    agent: &KeyPair,
    agent_id: &str,
    phone: &KeyPair,
    phone_id: &str,
    image: &[u8],
) -> Result<Value, String> {
    use ed25519_dalek::Signer;
    let t: Value = serde_json::from_str(&request_to_sign(
        &draft.to_string(),
        agent_id,
        phone_id,
        1.7e9,
        image,
    )?)
    .unwrap();
    let message = b64u::decode(s(&t, "message")).unwrap();
    let sig = agent.signing_key().sign(&message).to_bytes();
    let sealed = seal_signed_request(s(&t, "body"), &sig, agent_id, &phone.public().kem_b64u())?;
    Ok(serde_json::from_str(&sealed).unwrap())
}

/// What the phone does with a sealed request: open it, check the agent's signature, read it.
fn phone_opens(
    sealed: &Value,
    agent: &KeyPair,
    agent_id: &str,
    phone: &KeyPair,
    phone_id: &str,
) -> Request {
    let rid = s(sealed, "request_id");
    let env = &sealed["envelope"];
    assert_eq!(env["request_id"], rid);
    let plain = Purpose::Request
        .open(
            phone.kem_secret(),
            &b64u::decode(s(env, "enc")).unwrap(),
            &nodkey_proto::aad(rid, agent_id),
            &b64u::decode(s(env, "ct")).unwrap(),
        )
        .unwrap();
    let opened = nodkey_proto::signed::open(
        nodkey_proto::signed::Direction::Request,
        agent_id,
        phone_id,
        &plain,
        &agent.public().sign,
        true,
    )
    .expect("signed by the agent");
    parse_plaintext(&opened.body).unwrap()
}

fn from(v: &Value, phone_id: &str, signs: bool) -> String {
    json!({"agent_id": v["keys"]["agent"]["id"], "phone_id": phone_id,
           "sign": v["keys"]["phone"]["sign_pk"], "signs": signs})
    .to_string()
}

#[test]
fn opens_every_answer_and_the_grant_with_an_outside_x25519() {
    let v = vectors();
    let agent = &v["keys"]["agent"];
    let phone = &v["keys"]["phone"];
    let (mut answers, mut signed) = (0, 0);
    for h in v["hpke"].as_array().unwrap() {
        let (enc, sealed) = (
            s(h, "enc"),
            json!({"enc": h["enc"], "ct": h["ct"]}).to_string(),
        );
        let dh = x25519(s(h, "recipient_kem_sk"), enc);
        let kem = s(agent, "kem_pk");
        match s(h, "purpose") {
            "answer" => {
                let aad = s(h, "aad");
                let (rid, pid) = aad.split_at(aad.len() - 22);
                let out: Value = serde_json::from_str(
                    &open_answer(&dh, kem, &sealed, rid, &from(&v, pid, false)).unwrap(),
                )
                .unwrap();
                let a: Answer = serde_json::from_value(out["answer"].clone()).unwrap();
                let expected: Answer = parse_plaintext(s(h, "plaintext").as_bytes()).unwrap();
                assert_eq!(a, expected, "{}", s(h, "name"));
                let is_signed = s(h, "plaintext").contains(r#","sig":""#);
                assert_eq!(out["signed"], is_signed, "{}", s(h, "name"));
                // A phone that signs: only a signed answer passes.
                let required = open_answer(&dh, kem, &sealed, rid, &from(&v, pid, true));
                if is_signed {
                    assert!(required.is_ok());
                    signed += 1;
                    // Signed by another key: refused, required or not.
                    let other = json!({"agent_id": agent["id"], "phone_id": pid,
                        "sign": KeyPair::generate().public().sign_b64u(), "signs": false});
                    assert_eq!(
                        open_answer(&dh, kem, &sealed, rid, &other.to_string()).unwrap_err(),
                        "not_signed"
                    );
                } else {
                    assert_eq!(required.unwrap_err(), "not_signed", "{}", s(h, "name"));
                }
                assert!(open_answer(&dh, kem, &sealed, "x", &from(&v, pid, false)).is_err());
                answers += 1;
            }
            "pairing" => {
                let claimed = json!({
                    "phone_id": phone["id"], "sign": phone["sign_pk"], "kem": phone["kem_pk"],
                    "enc": h["enc"], "ct": h["ct"],
                })
                .to_string();
                let out = pairing::open_grant(&dh, kem, &claimed, "k7p-2qx");
                if s(h, "name") == s(&v["pairing"], "grant") {
                    let p: Value = serde_json::from_str(&out.unwrap()).unwrap();
                    assert_eq!(p["commit"], v["pairing"]["commit"]);
                    assert_eq!(p["phone_name"], "Test iPhone");
                    assert_eq!(p["phone_id"], phone["id"]);
                    assert_eq!(p["sign"], phone["sign_pk"]);
                } else {
                    // An app made before the commitment: refused, never paired by its number.
                    assert_eq!(out.unwrap_err(), "old_app", "{}", s(h, "name"));
                }
            }
            _ => {}
        }
    }
    assert!(answers >= 7 && signed >= 2);
}

#[test]
fn the_pairing_check_follows_the_vectors() {
    let v = vectors();
    let (agent, phone, p) = (&v["keys"]["agent"], &v["keys"]["phone"], &v["pairing"]);
    let answer = v["hpke"]
        .as_array()
        .unwrap()
        .iter()
        .find(|h| h["name"] == p["check_answer"])
        .unwrap();
    let answer: Answer = parse_plaintext(s(answer, "plaintext").as_bytes()).unwrap();
    let input = |nonce: &str, commit: &str| {
        json!({"answer": answer, "commit": commit, "nonce": nonce,
               "agent_sign": agent["sign_pk"], "agent_kem": agent["kem_pk"],
               "phone_sign": phone["sign_pk"], "phone_kem": phone["kem_pk"]})
        .to_string()
    };
    let (an, commit) = (s(p, "agent_nonce"), s(p, "commit"));
    assert_eq!(
        pairing::finish_pairing(&input(an, commit)).unwrap(),
        s(p, "display")
    );
    // Another nonce of the agent gives another number; another commitment does not fit.
    let other = b64u::encode(&[7u8; 32]);
    assert_ne!(
        pairing::finish_pairing(&input(&other, commit)).unwrap(),
        s(p, "display")
    );
    assert_eq!(
        pairing::finish_pairing(&input(an, &other)).unwrap_err(),
        "bad_pairing_check"
    );

    // The request: a new nonce each time, signed, and only the nonce.
    let (agent, phone_keys) = (KeyPair::generate(), KeyPair::generate());
    let (aid, pid) = (nodkey_proto::random_id(), nodkey_proto::random_id());
    let t: Value = serde_json::from_str(
        &pairing::pairing_check_to_sign("Firefox test", &aid, &pid, 1.7e9).unwrap(),
    )
    .unwrap();
    let t2: Value = serde_json::from_str(
        &pairing::pairing_check_to_sign("Firefox test", &aid, &pid, 1.7e9).unwrap(),
    )
    .unwrap();
    assert_ne!(t["nonce"], t2["nonce"]);
    use ed25519_dalek::Signer;
    let sig = agent
        .signing_key()
        .sign(&b64u::decode(s(&t, "message")).unwrap())
        .to_bytes();
    let sealed: Value = serde_json::from_str(
        &seal_signed_request(s(&t, "body"), &sig, &aid, &phone_keys.public().kem_b64u()).unwrap(),
    )
    .unwrap();
    let r = phone_opens(&sealed, &agent, &aid, &phone_keys, &pid);
    assert_eq!(r.kind, Kind::PairingCheck);
    assert_eq!(r.nonce.as_deref(), t["nonce"].as_str());
    assert!(r.target.is_empty() && r.reason.is_empty());
    // A signature of another key does not seal into something the phone takes.
    let bad = KeyPair::generate()
        .signing_key()
        .sign(&b64u::decode(s(&t, "message")).unwrap())
        .to_bytes();
    let sealed: Value = serde_json::from_str(
        &seal_signed_request(s(&t, "body"), &bad, &aid, &phone_keys.public().kem_b64u()).unwrap(),
    )
    .unwrap();
    let plain = Purpose::Request
        .open(
            phone_keys.kem_secret(),
            &b64u::decode(s(&sealed["envelope"], "enc")).unwrap(),
            &nodkey_proto::aad(s(&sealed, "request_id"), &aid),
            &b64u::decode(s(&sealed["envelope"], "ct")).unwrap(),
        )
        .unwrap();
    assert!(
        nodkey_proto::signed::open(
            nodkey_proto::signed::Direction::Request,
            &aid,
            &pid,
            &plain,
            &agent.public().sign,
            true
        )
        .is_err()
    );
    assert!(
        seal_signed_request(
            s(&t, "body"),
            &sig[..63],
            &aid,
            &phone_keys.public().kem_b64u()
        )
        .is_err()
    );
}

#[test]
fn sealed_requests_open_on_the_phone() {
    let (agent, phone) = (KeyPair::generate(), KeyPair::generate());
    let (agent_id, phone_id) = (nodkey_proto::random_id(), nodkey_proto::random_id());
    let password: Value =
        serde_json::from_str(&seal_password(&agent_id, &phone.public().kem_b64u(), "pw").unwrap())
            .unwrap();
    let draft = json!({
        "kind": "save", "target": "vg.no", "reason": "Save the login you just used on vg.no",
        "agent": "Firefox on Linux",
        "save": {"url": "https://www.vg.no/login", "username": "alex@example.com", "password": password},
        "client": {"app": "Nodkey for Firefox"},
    });
    let out = seal(&draft, &agent, &agent_id, &phone, &phone_id, &[]).unwrap();
    assert!(out["envelope"].get("attachment").is_none());
    let r = phone_opens(&out, &agent, &agent_id, &phone, &phone_id);
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

    // A picture: the request says its type, size and hash, which the phone checks.
    let png = nodkey_proto::vectors::PNG;
    let login = json!({"kind": "login", "target": "vg.no", "reason": "Sign in to vg.no",
        "agent": "Firefox on Linux", "caption": "vg.no"});
    let out = seal(&login, &agent, &agent_id, &phone, &phone_id, &png).unwrap();
    assert_eq!(out["envelope"]["attachment"], true);
    let r = phone_opens(&out, &agent, &agent_id, &phone, &phone_id);
    let a = r.attachment.unwrap();
    assert_eq!(a.bytes, png.len() as u64);
    assert_eq!(a.caption.as_deref(), Some("vg.no"));
    assert_eq!(a.sha256, Some(client::image_sha256(&png)));
    assert!(seal(&login, &agent, &agent_id, &phone, &phone_id, b"<svg/>").is_err());

    // The same checks as the command line.
    let bad = json!({"kind": "code", "target": "", "reason": "x", "agent": "A"});
    assert!(
        seal(&bad, &agent, &agent_id, &phone, &phone_id, &[])
            .unwrap_err()
            .contains("target is required")
    );
    let unknown = json!({"kind": "code", "target": "a", "reason": "x", "agent": "A", "extra": 1});
    assert!(seal(&unknown, &agent, &agent_id, &phone, &phone_id, &[]).is_err());
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
    let (agent, phone) = (KeyPair::generate(), KeyPair::generate());
    let agent_id = nodkey_proto::random_id();
    let rp_id = s(w, "rp_id");
    let request = json!({"op": "get", "rp_id": rp_id, "client_data_json": cdj,
        "allow_credentials": [s(w, "credential_id")], "user_verification": "required"});
    let draft = |target: &str, passkey: &Value| {
        json!({"kind": "passkey", "target": target, "reason": "Sign in", "agent": "Firefox on Linux",
            "passkey": passkey})
    };
    let sealed = |d: Value| seal(&d, &agent, &agent_id, &phone, "phone", &[]);
    assert!(sealed(draft(rp_id, &request)).is_ok());
    let evil = client_data_json("get", "AAEC", "https://evil.example").unwrap();
    let mut bad = request.clone();
    bad["client_data_json"] = json!(evil);
    assert!(sealed(draft(rp_id, &bad)).is_err());
    assert!(sealed(draft("evil.example", &request)).is_err());

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
    let (agent, phone) = (KeyPair::generate(), KeyPair::generate());
    let sealed = |d: &Value| seal(d, &agent, "agent", &phone, "phone", &[]);
    let suggest = json!({
        "kind": "suggest", "target": "renderfarm.example", "reason": "Signed in with Google",
        "agent": "Test browser",
        "suggest": {"method": {"kind": "federated", "provider": "google", "certainty": "seen",
                               "source": "extension"}, "outcome": "signed_in"}
    });
    assert!(sealed(&suggest).unwrap()["envelope"].get("ttl").is_none());
    // Only the user confirms a method.
    let mut confirmed = suggest.clone();
    confirmed["suggest"]["method"]["certainty"] = json!("confirmed");
    assert!(sealed(&confirmed).is_err());

    let sms = json!({"kind": "sms_code", "target": "account.example.com",
                     "reason": "The site sent a code by SMS", "agent": "Test browser",
                     "wait_seconds": 120});
    assert_eq!(sealed(&sms).unwrap()["envelope"]["ttl"], json!(180));
    let mut long = sms.clone();
    long["wait_seconds"] = json!(301);
    assert!(sealed(&long).is_err());
}

#[test]
fn fills_only_on_the_answered_accounts_website() {
    // The cases of the shared vectors, as the command line has them.
    for f in vectors()["sites"]["fill_only_on"].as_array().unwrap() {
        let answer = json!({"account": f["account"], "match": f["match"]}).to_string();
        let sites: Value =
            serde_json::from_str(&sites::fill_only_on(s(f, "target"), &answer).unwrap()).unwrap();
        assert_eq!(sites, f["fill_only_on"], "{f}");
    }
    for m in vectors()["sites"]["may_fill"].as_array().unwrap() {
        let allowed = sites::may_fill(s(m, "page"), &m["sites"].to_string()).unwrap();
        assert_eq!(allowed, m["allowed"].as_bool().unwrap(), "{m}");
    }
    // An account saved for another website: the page of the request is not among its sites.
    let other =
        json!({"account": {"issuer": "VG", "name": "alex", "site": "vg.no"}, "match": "direct"});
    let only = sites::fill_only_on("vg.example", &other.to_string()).unwrap();
    assert_eq!(only, r#"["vg.no"]"#);
    assert!(!sites::may_fill("https://vg.example/login", &only).unwrap());
    assert!(sites::may_fill("https://www.vg.no/login", &only).unwrap());
    // A newer match value is not "chosen"; no account means nowhere.
    let newer =
        json!({"account": {"issuer": "VG", "name": "alex", "site": "vg.no"}, "match": "someday"});
    assert_eq!(
        sites::fill_only_on("vg.example", &newer.to_string()).unwrap(),
        r#"["vg.no"]"#
    );
    assert_eq!(sites::fill_only_on("vg.no", "{}").unwrap(), "[]");
    // The same website for a code fill after a second-step choice.
    assert!(sites::same_site(
        "https://accounts.example.com/step",
        "https://example.com/code"
    ));
    assert!(!sites::same_site(
        "https://example.com/step",
        "https://example.org/code"
    ));
    assert!(!sites::same_site(
        "https://alice.github.io/",
        "https://bob.github.io/"
    ));
}

#[test]
fn generate_requests_follow_the_vectors() {
    let (agent, phone) = (KeyPair::generate(), KeyPair::generate());
    // Every request of the shared checks: sealed when it passes, refused when it does not.
    for c in vectors()["generate"]["checks"].as_array().unwrap() {
        let draft = json!({"kind": "generate", "target": c["target"], "reason": "Sign up",
                           "agent": "Test browser", "generate": c["generate"]});
        let sealed = seal(&draft, &agent, "agent", &phone, "phone", &[]);
        assert_eq!(sealed.is_ok(), c["error"].is_null(), "{c}");
        if let Ok(sealed) = sealed {
            let request = phone_opens(&sealed, &agent, "agent", &phone, "phone");
            assert_eq!(request.kind, Kind::Generate);
            assert_eq!(
                serde_json::to_value(&request.generate).unwrap(),
                c["generate"],
                "{c}"
            );
        }
    }
    // A generate request needs its page.
    let bare = json!({"kind": "generate", "target": "example.com", "reason": "Sign up",
                      "agent": "Test browser"});
    assert!(seal(&bare, &agent, "agent", &phone, "phone", &[]).is_err());
    for f in vectors()["generate"]["fill_only_on"].as_array().unwrap() {
        let sites = generate::generate_fill_only_on(s(f, "target")).unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&sites).unwrap(),
            f["fill_only_on"],
            "{f}"
        );
    }
    let page = generate::generate_page("https://Accounts.Example.com:8443/signup?flow=x#a")
        .unwrap()
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&page).unwrap(),
        json!({"target": "accounts.example.com", "url": "https://Accounts.Example.com:8443/signup"})
    );
    assert_eq!(
        generate::generate_page("localhost").unwrap().as_deref(),
        Some(r#"{"target":"localhost"}"#)
    );
    assert_eq!(generate::generate_page("not a site").unwrap(), None);
}
