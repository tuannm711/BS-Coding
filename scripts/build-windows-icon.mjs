import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SOURCE_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
export const ICO_SIZES = SOURCE_SIZES.filter(size => size <= 256)

export function readPngDimensions(buffer) {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error('Invalid PNG source')
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

export function readIcoEntries(buffer) {
  const count = buffer.readUInt16LE(4)
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16
    return {
      size: buffer[offset] || 256,
      bytes: buffer.readUInt32LE(offset + 8),
      imageOffset: buffer.readUInt32LE(offset + 12)
    }
  })
}

export function buildWindowsIcon(sourceDir, outputFile) {
  const sources = new Map(SOURCE_SIZES.map(size => {
    const file = path.join(sourceDir, `${size}x${size}.png`)
    const data = readFileSync(file)
    const dimensions = readPngDimensions(data)
    if (dimensions.width !== size || dimensions.height !== size) {
      throw new Error(`${size}x${size}.png has ${dimensions.width}x${dimensions.height} pixels`)
    }
    return [size, data]
  }))

  const headerSize = 6 + ICO_SIZES.length * 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(ICO_SIZES.length, 4)
  let imageOffset = headerSize

  ICO_SIZES.forEach((size, index) => {
    const data = sources.get(size)
    const offset = 6 + index * 16
    header[offset] = size === 256 ? 0 : size
    header[offset + 1] = size === 256 ? 0 : size
    header.writeUInt16LE(1, offset + 4)
    header.writeUInt16LE(32, offset + 6)
    header.writeUInt32LE(data.length, offset + 8)
    header.writeUInt32LE(imageOffset, offset + 12)
    imageOffset += data.length
  })

  mkdirSync(path.dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, Buffer.concat([header, ...ICO_SIZES.map(size => sources.get(size))]))
}

// The packaged tray icon lives outside build/icons, which is how it fell a
// rebrand behind the rest of the artwork. Regenerate it from the same source.
export function syncTrayIcon(sourceDir, outputFile) {
  const data = readFileSync(path.join(sourceDir, '32x32.png'))
  const dimensions = readPngDimensions(data)
  if (dimensions.width !== 32 || dimensions.height !== 32) {
    throw new Error(`32x32.png has ${dimensions.width}x${dimensions.height} pixels`)
  }
  mkdirSync(path.dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, data)
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFile === fileURLToPath(import.meta.url)) {
  buildWindowsIcon(path.resolve('build/icons'), path.resolve('build/icons/icon.ico'))
  syncTrayIcon(path.resolve('build/icons'), path.resolve('resources/tray-icon.png'))
}
