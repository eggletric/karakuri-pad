// Rounded-square processing for the app icon (launched from gen-icons.mjs).
// Draws the source into a 1024 canvas as a rounded square <inner> px on a side (corner
// radius <radius>), leaving the margin (when inner < 1024) transparent.
// mac = inner 824 / radius 185.4 (matching the Apple template)
// win = inner 1024 / radius 102.4 (no margin, a light rounding)
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 5, let innerArg = Double(args[3]), let radiusArg = Double(args[4]) else {
    FileHandle.standardError.write("usage: swift gen-icons.swift <src.png> <dst.png> <inner> <radius>\n".data(using: .utf8)!)
    exit(1)
}

guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    FileHandle.standardError.write("failed to load \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

let canvas = 1024
let inner = CGFloat(innerArg)
let radius = CGFloat(radiusArg)
let origin = (CGFloat(canvas) - inner) / 2

let ctx = CGContext(
    data: nil, width: canvas, height: canvas,
    bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
)!

let rect = CGRect(x: origin, y: origin, width: inner, height: inner)
ctx.addPath(CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil))
ctx.clip()
ctx.interpolationQuality = .high
ctx.draw(img, in: rect)

let out = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(
    URL(fileURLWithPath: args[2]) as CFURL, UTType.png.identifier as CFString, 1, nil
)!
CGImageDestinationAddImage(dest, out, nil)
guard CGImageDestinationFinalize(dest) else {
    FileHandle.standardError.write("failed to write \(args[2])\n".data(using: .utf8)!)
    exit(1)
}
