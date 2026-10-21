//! A new password the phone makes ("Making a password" in the protocol, peters/nodkey#131): the
//! page a request names and where the answer may be filled. The rules are
//! `nodkey_proto::generate`, as the `nodkey generate` command uses them.

use nodkey_proto::generate;
use serde::Serialize;

use super::js;

#[derive(Serialize)]
struct Page {
    target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
}

/// The `target` and `generate.url` of a request for the page at `site` (a URL or a host), as
/// JSON `{target, url?}`: the host, and the URL without query and fragment. `None` when it is
/// not a website.
pub fn generate_page(site: &str) -> Result<Option<String>, String> {
    generate::page(site)
        .map(|(target, url)| serde_json::to_string(&Page { target, url }).map_err(js))
        .transpose()
}

/// Where the password of an approved answer for `target` may be filled (`fill_only_on`), as a
/// JSON list: the website of `target`.
pub fn generate_fill_only_on(target: &str) -> Result<String, String> {
    serde_json::to_string(&generate::fill_only_on(target)).map_err(js)
}

/// Whether some password can meet `rules_json` (a `generate::Rules`): `None` when it can, else
/// why not (`Rules::check`, the phone's `bad_rules`). The extension asks the phone only when
/// they can be met.
pub fn generate_rules_problem(rules_json: &str) -> Result<Option<String>, String> {
    let rules: generate::Rules = serde_json::from_str(rules_json).map_err(js)?;
    Ok(rules.check().err())
}
