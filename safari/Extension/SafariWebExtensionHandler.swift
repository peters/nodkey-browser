import SafariServices

/// Safari needs a handler for native messages. The extension is standalone (ADR-0001) and sends
/// none, so the handler only answers that it has nothing to say.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["error": "unsupported"]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
