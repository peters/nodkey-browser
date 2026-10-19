//! The protocol steps behind the exported functions in `lib.rs`, with plain `String` errors so
//! they run in native tests too.
//!
//! nodkey-proto for the browser extension. The extension keeps its private keys as
//! non-extractable WebCrypto keys and does the two steps that need them (Ed25519 signing and the
//! X25519 key agreement) itself; everything else about the protocol runs here, from the same
//! code the `nodkey` command line uses.
//!
//! Strings in and out are JSON or base64url. Times come from JavaScript: there is no clock on
//! `wasm32-unknown-unknown`.

use nodkey_proto::{
    AttachmentInfo, CardRequest, ClientInfo, ImageType, Kind, PairingClaimed, PasskeyAnswer,
    PasskeyOp, PasskeyRequest, PublicKeys, Purpose, Request, SaveCard, SaveLogin, SealedBox,
    Suggestion, VERSION, auth, b64u, check, client, code, dh, passkey, webauthn,
};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

fn js(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// The protocol version this build speaks.
pub fn protocol_version() -> u8 {
    VERSION
}

/// A new random id (16 bytes, base64url).
pub fn random_id() -> String {
    nodkey_proto::random_id()
}

pub fn b64u_encode(bytes: &[u8]) -> String {
    b64u::encode(bytes)
}

pub fn b64u_decode(s: &str) -> Result<Vec<u8>, String> {
    b64u::decode(s).map_err(js)
}

/// A typed pairing code (`k7p-2qx`, `K7P2QX`) in its canonical form, or an error.
pub fn normalize_code(input: &str) -> Result<String, String> {
    code::normalize(input).map_err(js)
}

/// A canonical pairing code as shown: `K7P-2QX`.
pub fn display_code(code: &str) -> String {
    code::display(code)
}

pub(crate) fn keys(sign: &str, kem: &str) -> Result<PublicKeys, String> {
    PublicKeys::from_b64u(sign, kem).map_err(js)
}

/// The check number both sides show, as `"418 902"`.
pub fn check_number(
    agent_sign: &str,
    agent_kem: &str,
    phone_sign: &str,
    phone_kem: &str,
) -> Result<String, String> {
    let n = check::check_number(&keys(agent_sign, agent_kem)?, &keys(phone_sign, phone_kem)?);
    Ok(check::display(n))
}

/// The message to sign with the agent's Ed25519 key for one relay call. `path` includes the
/// query string exactly as sent.
pub fn auth_message(method: &str, path: &str, ts: f64, body: &[u8]) -> String {
    auth::message(method, path, ts as u64, body)
}

/// The `Nodkey-Auth` header value from the signature over [`auth_message`].
pub fn auth_header(id: &str, ts: f64, signature: &[u8]) -> Result<String, String> {
    if signature.len() != 64 {
        return Err(String::from("an Ed25519 signature has 64 bytes"));
    }
    Ok(format!("{id}.{}.{}", ts as u64, b64u::encode(signature)))
}

/// `"image/png"`, `"image/jpeg"` or `"image/gif"` from the first bytes, else `undefined`.
pub fn sniff_image(bytes: &[u8]) -> Option<String> {
    ImageType::sniff(bytes).map(|t| {
        match t {
            ImageType::Png => "image/png",
            ImageType::Jpeg => "image/jpeg",
            ImageType::Gif => "image/gif",
        }
        .to_owned()
    })
}

/// What the extension fills in for a request; the rest (`v`, `request_id`, `ts`) is added here.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Draft {
    kind: Kind,
    #[serde(default)]
    target: String,
    reason: String,
    agent: String,
    #[serde(default)]
    attachment: Option<AttachmentInfo>,
    #[serde(default)]
    save: Option<SaveLogin>,
    #[serde(default)]
    passkey: Option<PasskeyRequest>,
    #[serde(default)]
    card: Option<CardRequest>,
    #[serde(default)]
    save_card: Option<SaveCard>,
    #[serde(default)]
    client: Option<ClientInfo>,
    #[serde(default)]
    suggest: Option<Suggestion>,
    #[serde(default)]
    wait_seconds: Option<u32>,
}

#[derive(Serialize)]
struct Sealed {
    request_id: String,
    envelope: nodkey_proto::RequestEnvelope,
}

/// Checks and seals a request to the phone. `draft_json` is
/// `{kind, target, reason, agent, attachment?, save?, passkey?, card?, save_card?, client?, suggest?,
/// wait_seconds?}`; returns
/// `{request_id, envelope}` where `envelope` is the body of `POST /v1/phones/{id}/requests`.
pub fn seal_request(
    draft_json: &str,
    agent_id: &str,
    phone_kem: &str,
    ts: f64,
) -> Result<String, String> {
    let d: Draft = serde_json::from_str(draft_json).map_err(js)?;
    let request = Request {
        v: VERSION,
        request_id: nodkey_proto::random_id(),
        kind: d.kind,
        target: d.target.trim().to_owned(),
        reason: d.reason.trim().to_owned(),
        agent: d.agent,
        ts: ts as u64,
        attachment: d.attachment,
        filter: None,
        save: d.save,
        passkey: d.passkey,
        bundle: None,
        card: d.card,
        save_card: d.save_card,
        client: d.client.map(ClientInfo::tidy),
        session_id: None,
        suggest: d.suggest,
        wait_seconds: d.wait_seconds,
        save_secret: None,
        project: None,
    };
    client::check_request(&request)?;
    let kem = b64u::decode_array::<32>(phone_kem).map_err(js)?;
    let envelope =
        client::seal_request(&request, agent_id, &kem, request.attachment.is_some()).map_err(js)?;
    serde_json::to_string(&Sealed {
        request_id: request.request_id.clone(),
        envelope,
    })
    .map_err(js)
}

/// Seals a password for a `save` request to the phone on its own; returns `{enc, ct}`. Call it
/// the moment the password is read, and keep only the result.
pub fn seal_password(agent_id: &str, phone_kem: &str, password: &str) -> Result<String, String> {
    let kem = b64u::decode_array::<32>(phone_kem).map_err(js)?;
    let sealed = client::seal_password(agent_id, &kem, password).map_err(js)?;
    serde_json::to_string(&sealed).map_err(js)
}

/// Seals a picture for `PUT /v1/requests/{request_id}/attachment` (the raw body).
pub fn seal_attachment(
    request_id: &str,
    agent_id: &str,
    phone_kem: &str,
    image: &[u8],
) -> Result<Vec<u8>, String> {
    let kem = b64u::decode_array::<32>(phone_kem).map_err(js)?;
    client::seal_attachment(request_id, agent_id, &kem, image).map_err(js)
}

/// `clientDataJSON` for a passkey call as WebAuthn makes it, in b64u. `op` is `get` or `create`;
/// `origin` is the caller's origin as the browser reports it, never a value from the page.
pub fn client_data_json(op: &str, challenge: &str, origin: &str) -> Result<String, String> {
    let op = match op {
        "get" => PasskeyOp::Get,
        "create" => PasskeyOp::Create,
        _ => return Err(format!("unknown passkey op {op}")),
    };
    let json = passkey::build_client_data_json(op, challenge, origin);
    Ok(b64u::encode(json.as_bytes()))
}

/// The agent's check of an approved passkey answer: `request_json` is the request's `passkey`,
/// `answer_json` the answer's `passkey`.
pub fn check_passkey_answer(request_json: &str, answer_json: &str) -> Result<(), String> {
    let request: PasskeyRequest = serde_json::from_str(request_json).map_err(js)?;
    let answer: PasskeyAnswer = serde_json::from_str(answer_json).map_err(js)?;
    webauthn::check_answer(&request, &answer)
}

fn open(
    purpose: Purpose,
    dh: &[u8],
    agent_kem: &str,
    sealed: &SealedBox,
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>, String> {
    let dh: [u8; 32] = dh
        .try_into()
        .map_err(|_| String::from("the X25519 result has 32 bytes"))?;
    let pk = b64u::decode_array::<32>(agent_kem).map_err(js)?;
    let enc = b64u::decode(&sealed.enc).map_err(js)?;
    let ct = b64u::decode(&sealed.ct).map_err(js)?;
    dh::open_with_dh(purpose.info().as_bytes(), &dh, &pk, &enc, aad, &ct).map_err(js)
}

/// Opens the phone's answer (`{enc, ct}` from `GET /v1/requests/{id}`) given
/// `dh = X25519(agent secret, enc)`; returns the answer as JSON (it may hold a code or password).
pub fn open_answer(
    dh: &[u8],
    agent_kem: &str,
    sealed_json: &str,
    request_id: &str,
    phone_id: &str,
) -> Result<String, String> {
    let sealed: SealedBox = serde_json::from_str(sealed_json).map_err(js)?;
    let plain = open(
        Purpose::Answer,
        dh,
        agent_kem,
        &sealed,
        &client::answer_aad(request_id, phone_id),
    )?;
    let answer = client::read_answer(&plain, request_id).map_err(js)?;
    serde_json::to_string(&answer).map_err(js)
}

#[derive(Serialize)]
struct Paired {
    phone_id: String,
    phone_name: String,
    scope: nodkey_proto::Scope,
    /// As shown: "418 902".
    check: String,
    sign: String,
    kem: String,
}

/// Opens and checks the pairing grant (`GET /v1/pairings/{code}` once claimed) given
/// `dh = X25519(agent secret, enc)`. Fails when the check numbers differ.
pub fn open_grant(
    dh: &[u8],
    agent_sign: &str,
    agent_kem: &str,
    claimed_json: &str,
    code: &str,
) -> Result<String, String> {
    let claimed: PairingClaimed = serde_json::from_str(claimed_json).map_err(js)?;
    nodkey_proto::validate_id(&claimed.phone_id).map_err(js)?;
    let code = code::normalize(code).map_err(js)?;
    let phone = keys(&claimed.sign, &claimed.kem)?;
    let plain = open(
        Purpose::Pairing,
        dh,
        agent_kem,
        &claimed.sealed(),
        &client::grant_aad(&code, &claimed.phone_id),
    )?;
    let grant = client::read_grant(&plain, &keys(agent_sign, agent_kem)?, &phone).map_err(js)?;
    serde_json::to_string(&Paired {
        phone_id: claimed.phone_id.clone(),
        phone_name: grant.phone_name,
        scope: grant.scope,
        check: check::display(grant.check.parse().unwrap_or(0)),
        sign: claimed.sign,
        kem: claimed.kem,
    })
    .map_err(js)
}

pub mod cards;
pub mod signin;
pub mod sites;

#[cfg(test)]
mod tests;
