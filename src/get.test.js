import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { download } from './download.js'
import { extract } from './extract.js'
import { getTool } from './get.js'
import { createLog } from './log.js'
import { getDownloadUrl, isArduinoTool } from './tools.js'

jest.mock('@xhmikosr/decompress', () => ({
  __esModule: true,
  default: jest.fn(), // https://archive.jestjs.io/docs/en/23.x/jest-object
}))

jest.mock('node:fs')
jest.mock('node:fs/promises')
jest.mock('node:stream/promises')
jest.mock('./download.js')
jest.mock('./extract.js')
jest.mock('./log.js')
jest.mock('./tools.js')

describe('get', () => {
  const log = jest.fn()
  const mockTool = 'mockTool'
  const mockVersion = '1.0.0'
  const mockDestinationFolderPath = '/mock/destination'
  const mockPlatform = 'linux'
  const mockArch = 'x64'
  const mockBuffer = new Uint8Array([1, 2, 3])
  const mockExtractResult = {
    destinationPath: '/mock/extracted',
    dispose: jest.fn(),
  }
  const mockedFd = {
    createWriteStream: jest.fn(),
  }

  beforeEach(() => {
    jest.mocked(createLog).mockReturnValue(log)
    jest.mocked(download).mockResolvedValue(mockBuffer)
    jest.mocked(extract).mockResolvedValue(mockExtractResult)
    jest
      .mocked(getDownloadUrl)
      .mockReturnValue('https://downloads.arduino.cc/mock')
    jest.clearAllMocks()
    jest.mocked(isArduinoTool).mockReturnValue(false)
    jest.mocked(fs.open).mockReturnValue(mockedFd)
    jest.mocked(fs.rm).mockResolvedValue(Promise.resolve())
    jest.mocked(pipeline).mockReturnValue(Promise.resolve())
  })

  it('should open a file, download, extract, and pipe the tool to the file', async () => {
    jest.mocked(getDownloadUrl).mockImplementation((params) => {
      const toolsModule = jest.requireActual('./tools.js')
      return toolsModule.getDownloadUrl(params)
    })
    jest.mocked(isArduinoTool).mockImplementation((tool) => {
      const toolsModule = jest.requireActual('./tools.js')
      return toolsModule.isArduinoTool(tool)
    })

    const result = await getTool({
      tool: 'arduino-cli',
      version: mockVersion,
      destinationFolderPath: mockDestinationFolderPath,
      platform: mockPlatform,
      arch: mockArch,
    })

    expect(fs.open).toHaveBeenCalledWith(
      path.join(mockDestinationFolderPath, 'arduino-cli'),
      'wx'
    )
    expect(download).toHaveBeenCalledWith({
      url: 'https://downloads.arduino.cc/arduino-cli/arduino-cli_1.0.0_Linux_64bit.tar.gz',
    })
    expect(extract).toHaveBeenCalledWith({
      buffer: mockBuffer,
      strip: undefined,
    })
    expect(mockExtractResult.dispose).toHaveBeenCalled()
    expect(result.toolPath).toBe(
      path.join(mockDestinationFolderPath, 'arduino-cli')
    )
  })

  it('should strip one parent folder when extracting a non-Arduino tool', async () => {
    jest.mocked(getDownloadUrl).mockImplementation((params) => {
      const toolsModule = jest.requireActual('./tools.js')
      return toolsModule.getDownloadUrl(params)
    })
    jest.mocked(isArduinoTool).mockImplementation((tool) => {
      const toolsModule = jest.requireActual('./tools.js')
      return toolsModule.isArduinoTool(tool)
    })

    await getTool({
      tool: 'clangd',
      version: mockVersion,
      destinationFolderPath: mockDestinationFolderPath,
      platform: mockPlatform,
      arch: mockArch,
    })

    expect(extract).toHaveBeenCalledWith({ buffer: mockBuffer, strip: 1 })
  })

  it('should throw an error if download fails', async () => {
    jest.mocked(download).mockRejectedValue(new Error('download error'))

    await expect(
      getTool({
        tool: mockTool,
        version: mockVersion,
        destinationFolderPath: mockDestinationFolderPath,
      })
    ).rejects.toThrow(
      'Failed to download from https://downloads.arduino.cc/mock'
    )
  })

  it('should overwrite the tool if force is true', async () => {
    await getTool({
      tool: mockTool,
      version: mockVersion,
      destinationFolderPath: mockDestinationFolderPath,
      force: true,
      platform: 'win32',
    })

    expect(fs.open).toHaveBeenCalledWith(
      path.join(mockDestinationFolderPath, `${mockTool}.exe`),
      'w'
    )
  })

  it('should throw an error if tool already exists and force is false', async () => {
    jest
      .mocked(fs.open)
      .mockRejectedValue(Object.assign(new Error(), { code: 'EEXIST' }))

    await expect(
      getTool({
        tool: mockTool,
        version: mockVersion,
        destinationFolderPath: mockDestinationFolderPath,
      })
    ).rejects.toThrow('Tool already exists')
  })
})
