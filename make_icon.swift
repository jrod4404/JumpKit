import Cocoa
import CoreGraphics

let size = 512
let bitmapRep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: size, pixelsHigh: size,
    bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: size * 4, bitsPerPixel: 32
)!

let ctx = NSGraphicsContext(bitmapImageRep: bitmapRep)!
NSGraphicsContext.current = ctx
let cgCtx = ctx.cgContext

// ── 1. Rounded rect clip (macOS app icon shape, ~22% corner radius) ──
let radius: CGFloat = 112
let fullRect = CGRect(x: 0, y: 0, width: CGFloat(size), height: CGFloat(size))
let clipPath = CGPath(roundedRect: fullRect, cornerWidth: radius, cornerHeight: radius, transform: nil)
cgCtx.addPath(clipPath)
cgCtx.clip()

// ── 2. Gradient: deep navy top → turquoise bottom ──
// CoreGraphics Y=0 is bottom, so "top" = y=size
let colorSpace = CGColorSpaceCreateDeviceRGB()
let colors: [CGColor] = [
    CGColor(red: 10.0/255,  green: 26.0/255,  blue: 107.0/255, alpha: 1.0),  // #0A1A6B  top
    CGColor(red: 0.0/255,   green: 194.0/255, blue: 199.0/255, alpha: 1.0)   // #00C2C7  bottom
]
let gradient = CGGradient(colorsSpace: colorSpace, colors: colors as CFArray, locations: [0.0, 1.0] as [CGFloat])!
cgCtx.drawLinearGradient(
    gradient,
    start: CGPoint(x: CGFloat(size) / 2, y: CGFloat(size)),  // top (navy)
    end:   CGPoint(x: CGFloat(size) / 2, y: 0),              // bottom (turquoise)
    options: []
)

// ── 3. Load the real jump-icon.png and paint it white using alpha-mask ──
let iconPath = "/Users/jeffroder/.openclaw/workspace/Topics/JumpKit/app/assets/jump-icon.png"
guard let nsImg = NSImage(contentsOf: URL(fileURLWithPath: iconPath)),
      let cgIcon = nsImg.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
    print("ERROR: could not load \(iconPath)")
    exit(1)
}

// Scale the icon to 72% of the canvas, centered
let targetW: CGFloat = CGFloat(size) * 0.72
let aspectH = CGFloat(cgIcon.height) * targetW / CGFloat(cgIcon.width)
let ox = (CGFloat(size) - targetW) / 2.0
let oy = (CGFloat(size) - aspectH) / 2.0

let iconRect = CGRect(x: ox, y: oy, width: targetW, height: aspectH)

// ── Base fill: clip to icon alpha, draw a gradient from bright white (top) to softer white (bottom) ──
cgCtx.saveGState()
cgCtx.clip(to: iconRect, mask: cgIcon)
let figureGradientColors: [CGColor] = [
    CGColor(red: 1, green: 1, blue: 1, alpha: 0.97),  // bright white top
    CGColor(red: 1, green: 1, blue: 1, alpha: 0.72)   // softer white bottom
]
let figureGradient = CGGradient(colorsSpace: colorSpace, colors: figureGradientColors as CFArray, locations: [0.0, 1.0] as [CGFloat])!
cgCtx.drawLinearGradient(
    figureGradient,
    start: CGPoint(x: CGFloat(size)/2, y: CGFloat(size)),  // top
    end:   CGPoint(x: CGFloat(size)/2, y: 0),              // bottom
    options: []
)
cgCtx.restoreGState()

// ── Highlight pass: shift the mask up+left slightly, draw at low alpha ──
// This simulates a top-left light source hitting the raised figure
let hiShift: CGFloat = 4
let hiRect = iconRect.insetBy(dx: 0, dy: 0).offsetBy(dx: -hiShift, dy: hiShift)
cgCtx.saveGState()
cgCtx.clip(to: hiRect, mask: cgIcon)
cgCtx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.22))
cgCtx.fill(fullRect)
cgCtx.restoreGState()

// ── Shadow pass: shift the mask down+right slightly, draw in dark teal at low alpha ──
// Adds a subtle drop-shadow feel beneath the figure
let shShift: CGFloat = 5
let shRect = iconRect.offsetBy(dx: shShift, dy: -shShift)
cgCtx.saveGState()
cgCtx.clip(to: shRect, mask: cgIcon)
cgCtx.setFillColor(CGColor(red: 0, green: 0.4, blue: 0.5, alpha: 0.28))
cgCtx.fill(fullRect)
cgCtx.restoreGState()

// ── 4. Save PNG ──
let pngData = bitmapRep.representation(using: .png, properties: [:])!
let outURL = URL(fileURLWithPath: "/Users/jeffroder/.openclaw/workspace/Topics/JumpKit/app/assets/icon_gradient_512.png")
try! pngData.write(to: outURL)
print("✓ saved \(outURL.path) (\(pngData.count) bytes)")
