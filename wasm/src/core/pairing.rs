//! Pairing with the phone's commitment ("Pairing and the check number" in the protocol): open
//! the grant, make the `pairing_check` request with the agent's nonce, and get the check number
//! from the phone's answer. A grant without a commitment comes from an app made before it: it is
//! refused (`old_app`), never paired by the old number.

use nodkey_proto::{Answer, PairingClaimed, Purpose, b64u, check, client, code, pairing};
use serde::{Deserialize, Serialize};

use super::{coded, js, keys, open, to_sign};

#[derive(Serialize)]
struct Granted {
    phone_id: String,
    phone_name: String,
    scope: nodkey_proto::Scope,
    /// b64u of the phone's commitment, for [`finish_pairing`].
    commit: String,
    sign: String,
    kem: String,
}

/// Opens the pairing grant (`GET /v1/pairings/{code}` once claimed) given
/// `dh = X25519(agent secret, enc)`. Returns `{phone_id, phone_name, scope, commit, sign, kem}`;
/// fails with `old_app` when the grant has no commitment.
pub fn open_grant(
    dh: &[u8],
    agent_kem: &str,
    claimed_json: &str,
    code: &str,
) -> Result<String, String> {
    let claimed: PairingClaimed = serde_json::from_str(claimed_json).map_err(js)?;
    nodkey_proto::validate_id(&claimed.phone_id).map_err(js)?;
    let code = code::normalize(code).map_err(js)?;
    keys(&claimed.sign, &claimed.kem)?;
    let plain = open(
        Purpose::Pairing,
        dh,
        agent_kem,
        &claimed.sealed(),
        &client::grant_aad(&code, &claimed.phone_id),
    )?;
    let grant = pairing::read_grant(&plain).map_err(coded)?;
    serde_json::to_string(&Granted {
        phone_id: claimed.phone_id.clone(),
        phone_name: grant.phone_name,
        scope: grant.scope,
        commit: b64u::encode(&grant.commit),
        sign: claimed.sign,
        kem: claimed.kem,
    })
    .map_err(js)
}

/// The one `pairing_check` request of a pairing, with a new nonce of the agent, ready to sign;
/// returns `{request_id, body, message, nonce}` (see `request_to_sign`).
pub fn pairing_check_to_sign(
    agent_name: &str,
    agent_id: &str,
    phone_id: &str,
    ts: f64,
) -> Result<String, String> {
    let nonce = pairing::nonce();
    let request = pairing::check_request(agent_name, &nonce, ts as u64);
    serde_json::to_string(&to_sign(&request, agent_id, phone_id)?).map_err(js)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Finish {
    /// The phone's answer to the `pairing_check`, opened with `open_answer` (signed).
    answer: Answer,
    /// From the grant.
    commit: String,
    /// The agent's nonce from `pairing_check_to_sign`.
    nonce: String,
    agent_sign: String,
    agent_kem: String,
    phone_sign: String,
    phone_kem: String,
}

/// Checks the phone's answer to the pairing check against its commitment; returns the check
/// number as shown (`"418 902"`), or `bad_pairing_check`.
pub fn finish_pairing(input_json: &str) -> Result<String, String> {
    let f: Finish = serde_json::from_str(input_json).map_err(js)?;
    let grant = pairing::Grant {
        phone_name: String::new(),
        scope: nodkey_proto::Scope::Selected,
        commit: b64u::decode_array(&f.commit).map_err(js)?,
    };
    let nonce = b64u::decode_array::<{ pairing::NONCE_LEN }>(&f.nonce).map_err(js)?;
    let n = pairing::finish(
        &f.answer,
        &grant,
        &keys(&f.agent_sign, &f.agent_kem)?,
        &keys(&f.phone_sign, &f.phone_kem)?,
        &nonce,
    )
    .map_err(coded)?;
    Ok(check::display(n))
}
