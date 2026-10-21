//! nodkey-proto for the browser extension (WebAssembly). The extension keeps its private keys as
//! non-extractable WebCrypto keys and does the two steps that need them (Ed25519 signing and the
//! X25519 key agreement) itself; everything else about the protocol runs here, from the same
//! code the `nodkey` command line uses. See `core.rs` for what each function does.

mod core;

use wasm_bindgen::prelude::*;

fn js<T>(r: Result<T, String>) -> Result<T, JsError> {
    r.map_err(|e| JsError::new(&e))
}

#[wasm_bindgen]
pub fn protocol_version() -> u8 {
    core::protocol_version()
}

#[wasm_bindgen]
pub fn random_id() -> String {
    core::random_id()
}

#[wasm_bindgen]
pub fn b64u_encode(bytes: &[u8]) -> String {
    core::b64u_encode(bytes)
}

#[wasm_bindgen]
pub fn b64u_decode(s: &str) -> Result<Vec<u8>, JsError> {
    js(core::b64u_decode(s))
}

#[wasm_bindgen]
pub fn normalize_code(input: &str) -> Result<String, JsError> {
    js(core::normalize_code(input))
}

#[wasm_bindgen]
pub fn display_code(code: &str) -> String {
    core::display_code(code)
}

#[wasm_bindgen]
pub fn auth_message(method: &str, path: &str, ts: f64, body: &[u8]) -> String {
    core::auth_message(method, path, ts, body)
}

#[wasm_bindgen]
pub fn auth_header(id: &str, ts: f64, signature: &[u8]) -> Result<String, JsError> {
    js(core::auth_header(id, ts, signature))
}

#[wasm_bindgen]
pub fn sniff_image(bytes: &[u8]) -> Option<String> {
    core::sniff_image(bytes)
}

#[wasm_bindgen]
pub fn request_to_sign(
    draft_json: &str,
    agent_id: &str,
    phone_id: &str,
    ts: f64,
    image: &[u8],
) -> Result<String, JsError> {
    js(core::request_to_sign(
        draft_json, agent_id, phone_id, ts, image,
    ))
}

#[wasm_bindgen]
pub fn seal_signed_request(
    body: &str,
    signature: &[u8],
    agent_id: &str,
    phone_kem: &str,
) -> Result<String, JsError> {
    js(core::seal_signed_request(
        body, signature, agent_id, phone_kem,
    ))
}

#[wasm_bindgen]
pub fn seal_password(agent_id: &str, phone_kem: &str, password: &str) -> Result<String, JsError> {
    js(core::seal_password(agent_id, phone_kem, password))
}

#[wasm_bindgen]
pub fn seal_attachment(
    request_id: &str,
    agent_id: &str,
    phone_kem: &str,
    image: &[u8],
) -> Result<Vec<u8>, JsError> {
    js(core::seal_attachment(
        request_id, agent_id, phone_kem, image,
    ))
}

#[wasm_bindgen]
pub fn open_answer(
    dh: &[u8],
    agent_kem: &str,
    sealed_json: &str,
    request_id: &str,
    from_json: &str,
) -> Result<String, JsError> {
    js(core::open_answer(
        dh,
        agent_kem,
        sealed_json,
        request_id,
        from_json,
    ))
}

#[wasm_bindgen]
pub fn open_grant(
    dh: &[u8],
    agent_kem: &str,
    claimed_json: &str,
    code: &str,
) -> Result<String, JsError> {
    js(core::pairing::open_grant(dh, agent_kem, claimed_json, code))
}

#[wasm_bindgen]
pub fn pairing_check_to_sign(
    agent_name: &str,
    agent_id: &str,
    phone_id: &str,
    ts: f64,
) -> Result<String, JsError> {
    js(core::pairing::pairing_check_to_sign(
        agent_name, agent_id, phone_id, ts,
    ))
}

#[wasm_bindgen]
pub fn finish_pairing(input_json: &str) -> Result<String, JsError> {
    js(core::pairing::finish_pairing(input_json))
}

#[wasm_bindgen]
pub fn client_data_json(op: &str, challenge: &str, origin: &str) -> Result<String, JsError> {
    js(core::client_data_json(op, challenge, origin))
}

#[wasm_bindgen]
pub fn check_passkey_answer(request_json: &str, answer_json: &str) -> Result<(), JsError> {
    js(core::check_passkey_answer(request_json, answer_json))
}

#[wasm_bindgen]
pub fn parse_money(value: &str, currency: &str) -> Result<String, JsError> {
    js(core::cards::parse_money(value, currency))
}

#[wasm_bindgen]
pub fn money_exceeds(a_json: &str, b_json: &str) -> Result<bool, JsError> {
    js(core::cards::money_exceeds(a_json, b_json))
}

#[wasm_bindgen]
pub fn check_card(card_json: &str, target: &str) -> Result<String, JsError> {
    js(core::cards::check_card(card_json, target))
}

#[wasm_bindgen]
pub fn seal_card_secret(agent_id: &str, phone_kem: &str, secret: &str) -> Result<String, JsError> {
    js(core::cards::seal_card_secret(agent_id, phone_kem, secret))
}

#[wasm_bindgen]
pub fn card_luhn(number: &str) -> bool {
    core::cards::luhn(number)
}

#[wasm_bindgen]
pub fn card_brand(number: &str) -> String {
    core::cards::brand(number)
}

#[wasm_bindgen]
pub fn card_last4(number: &str) -> Option<String> {
    core::cards::last4(number)
}

#[wasm_bindgen]
pub fn signin_site(value: &str) -> Option<String> {
    core::signin::site(value)
}

#[wasm_bindgen]
pub fn may_fill_via(
    host: &str,
    target: &str,
    method_json: &str,
    via_json: &str,
) -> Result<bool, JsError> {
    js(core::signin::may_fill_via(
        host,
        target,
        method_json,
        via_json,
    ))
}

#[wasm_bindgen]
pub fn fill_only_on(target: &str, answer_json: &str) -> Result<String, JsError> {
    js(core::sites::fill_only_on(target, answer_json))
}

#[wasm_bindgen]
pub fn may_fill(page: &str, sites_json: &str) -> Result<bool, JsError> {
    js(core::sites::may_fill(page, sites_json))
}

#[wasm_bindgen]
pub fn generate_page(site: &str) -> Result<Option<String>, JsError> {
    js(core::generate::generate_page(site))
}

#[wasm_bindgen]
pub fn generate_fill_only_on(target: &str) -> Result<String, JsError> {
    js(core::generate::generate_fill_only_on(target))
}

#[wasm_bindgen]
pub fn same_site(a: &str, b: &str) -> bool {
    core::sites::same_site(a, b)
}

#[wasm_bindgen]
pub fn is_public_suffix(host: &str) -> bool {
    core::sites::is_public_suffix(host)
}

#[wasm_bindgen]
pub fn second_step_pick(order_json: &str, offered_json: &str) -> Result<Option<String>, JsError> {
    js(core::signin::second_step_pick(order_json, offered_json))
}
