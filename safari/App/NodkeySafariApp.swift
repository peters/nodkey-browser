import SafariServices
import SwiftUI

/// The Mac app only carries the extension into Safari and shows how to turn it on. All the work
/// happens in the web extension (ADR-0008).
@main
struct NodkeySafariApp: App {
    var body: some Scene {
        WindowGroup {
            SetupView()
                .frame(width: 480)
                .fixedSize(horizontal: false, vertical: true)
        }
        .windowResizability(.contentSize)
    }
}

/// Flis colours, the same as the extension's tokens.css.
enum Flis {
    static let background = Color(light: 0xFBFAF7, dark: 0x11141A)
    static let card = Color(light: 0xFFFFFF, dark: 0x1A1F27)
    static let ink = Color(light: 0x1D2433, dark: 0xEEF1F5)
    static let muted = Color(light: 0x5F6878, dark: 0x9AA3B2)
    static let accent = Color(light: 0x138A63, dark: 0x5FD3A5)
    static let onAccent = Color(light: 0xFFFFFF, dark: 0x052016)
    static let tiles = [
        Color(light: 0xC8EFD9, dark: 0x17402F),
        Color(light: 0xCFE3FF, dark: 0x1D3456),
        Color(light: 0xFFD9C7, dark: 0x4A2A1E),
    ]
    static let off = Color(light: 0xFFD9C7, dark: 0x4A2A1E)
}

struct SetupView: View {
    static let extensionID = "com.fintermac.nodkey.safari.extension"
    static let appStore = URL(string: "https://apps.apple.com/app/id6820952672")!

    @State private var enabled: Bool?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 14) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .frame(width: 64, height: 64)
                Text("Nodkey for Safari")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(Flis.ink)
            }
            Text("Sign in with logins, codes and passkeys from Nodkey on your iPhone. You approve every request with Face ID.")
                .font(.system(size: 14))
                .foregroundStyle(Flis.muted)
                .fixedSize(horizontal: false, vertical: true)

            if let enabled {
                Label(enabled ? LocalizedStringKey("Nodkey is on in Safari.") : LocalizedStringKey("Nodkey is off in Safari."),
                      systemImage: enabled ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Flis.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(enabled ? Flis.tiles[0] : Flis.off, in: RoundedRectangle(cornerRadius: 14))
            }

            VStack(spacing: 10) {
                Step(number: 1, tile: Flis.tiles[0], text: "Turn on Nodkey in Safari Settings, under Extensions.")
                Step(number: 2, tile: Flis.tiles[1], text: "Allow Nodkey on all websites, so that it can fill in sign-in fields.")
                Step(number: 3, tile: Flis.tiles[2], text: "Click Nodkey in the Safari toolbar and pair it with Nodkey on your iPhone.")
            }

            HStack {
                Button(action: openSafariSettings) {
                    Text("Open Safari Settings")
                        .font(.system(size: 14, weight: .semibold))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .foregroundStyle(Flis.onAccent)
                        .background(Flis.accent, in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                Spacer()
                Link("Get Nodkey for iPhone", destination: Self.appStore)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Flis.accent)
            }
        }
        .padding(28)
        .background(Flis.background)
        .task { await refresh() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await refresh() }
        }
    }

    private func refresh() async {
        let state = try? await SFSafariExtensionManager.stateOfSafariExtension(withIdentifier: Self.extensionID)
        enabled = state?.isEnabled
    }

    private func openSafariSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: Self.extensionID) { _ in }
    }
}

struct Step: View {
    let number: Int
    let tile: Color
    let text: LocalizedStringKey

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .frame(width: 26, height: 26)
                .background(.white.opacity(0.7), in: Circle())
            Text(text)
                .font(.system(size: 14, weight: .medium))
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .foregroundStyle(Flis.ink)
        .padding(12)
        .background(tile, in: RoundedRectangle(cornerRadius: 16))
    }
}

extension Color {
    /// A colour with its own value in light and dark appearance.
    init(light: UInt32, dark: UInt32) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            let hex = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: CGFloat(hex >> 16 & 0xFF) / 255, green: CGFloat(hex >> 8 & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        })
    }
}
