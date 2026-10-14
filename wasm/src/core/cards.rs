//! Payment cards: amounts, the rules of a card request, and sealing a card for a save, from the
//! same code the `nodkey` command line and the phone's vectors use.

use nodkey_proto::{CardRequest, Money, b64u, card, client};
use serde::Serialize;

use super::js;

/// An amount as a person types it (`"499,00"`, `"nok"`), checked and normalized:
/// `{value, currency}` with a dot, or an error.
pub fn parse_money(value: &str, currency: &str) -> Result<String, String> {
    serde_json::to_string(&Money::parse(value, currency)?).map_err(js)
}

/// Whether amount `a` is more than `b` (both `{value, currency}`; another currency counts as
/// more, since the two cannot be compared).
pub fn money_exceeds(a_json: &str, b_json: &str) -> Result<bool, String> {
    let a: Money = serde_json::from_str(a_json).map_err(js)?;
    let b: Money = serde_json::from_str(b_json).map_err(js)?;
    Ok(a.exceeds(&b))
}

#[derive(Serialize)]
struct Checked {
    ok: bool,
    /// A refusal code from the protocol (`amount_missing`, `total_mismatch`), when one applies.
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

/// Checks a card request (the request's `card` object) for `target` by the protocol's rules;
/// returns `{ok, error?, message?}`.
pub fn check_card(card_json: &str, target: &str) -> Result<String, String> {
    let card: CardRequest = serde_json::from_str(card_json).map_err(js)?;
    let out = match card.check(target) {
        Ok(()) => Checked {
            ok: true,
            error: None,
            message: None,
        },
        Err((error, message)) => Checked {
            ok: false,
            error,
            message: Some(message),
        },
    };
    serde_json::to_string(&out).map_err(js)
}

/// Seals a card number or CVC for a card save to the phone on its own; returns `{enc, ct}`. Call
/// it the moment the value is read, and keep only the result.
pub fn seal_card_secret(agent_id: &str, phone_kem: &str, secret: &str) -> Result<String, String> {
    let kem = b64u::decode_array::<32>(phone_kem).map_err(js)?;
    let sealed = client::seal_card_secret(agent_id, &kem, secret).map_err(js)?;
    serde_json::to_string(&sealed).map_err(js)
}

pub fn luhn(number: &str) -> bool {
    card::luhn(number)
}

pub fn brand(number: &str) -> String {
    card::brand(number).to_owned()
}

pub fn last4(number: &str) -> Option<String> {
    card::last4(number)
}

#[cfg(test)]
mod tests {
    use super::*;
    use nodkey_proto::{KeyPair, Purpose};
    use serde_json::Value;

    #[test]
    fn same_answers_as_the_vectors() {
        let v = nodkey_proto::vectors::build();
        let c = &v["cards"];
        for a in c["amounts"].as_array().unwrap() {
            let out = parse_money(
                a["value"].as_str().unwrap(),
                a["currency"].as_str().unwrap(),
            );
            assert_eq!(out.is_ok(), a["ok"].as_bool().unwrap(), "{a}");
            if let Ok(m) = out {
                assert_eq!(serde_json::from_str::<Value>(&m).unwrap(), a["normalized"]);
            }
        }
        for r in c["requests"].as_array().unwrap() {
            let out: Value = serde_json::from_str(
                &check_card(&r["card"].to_string(), r["target"].as_str().unwrap()).unwrap(),
            )
            .unwrap();
            assert_eq!(out["ok"], r["ok"], "{}", r["name"]);
            if !r["error"].is_null() {
                assert_eq!(out["error"], r["error"], "{}", r["name"]);
            }
        }
        for n in c["numbers"].as_array().unwrap() {
            let number = n["number"].as_str().unwrap();
            assert_eq!(luhn(number), n["luhn"].as_bool().unwrap());
            assert_eq!(brand(number), n["brand"].as_str().unwrap());
            assert_eq!(last4(number).as_deref(), n["last4"].as_str());
        }
    }

    #[test]
    fn amounts_compare_and_card_secrets_seal() {
        let nok = |v: &str| format!(r#"{{"value":"{v}","currency":"NOK"}}"#);
        assert!(money_exceeds(&nok("500"), &nok("499.99")).unwrap());
        assert!(!money_exceeds(&nok("499.990"), &nok("499.99")).unwrap());
        assert!(money_exceeds(r#"{"value":"1","currency":"EUR"}"#, &nok("9")).unwrap());
        assert!(money_exceeds("{}", &nok("1")).is_err());

        let phone = KeyPair::generate();
        let kem = b64u::encode(&phone.public().kem);
        let sealed: nodkey_proto::SealedBox =
            serde_json::from_str(&seal_card_secret("agent", &kem, "4242424242424242").unwrap())
                .unwrap();
        let opened = Purpose::Card
            .open_box(phone.kem_secret(), &sealed, b"agent")
            .unwrap();
        assert_eq!(&opened[..], b"4242424242424242");
        assert!(seal_card_secret("agent", &kem, " ").is_err());
    }
}
