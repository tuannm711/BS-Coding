import { describe, expect, it } from 'vitest'
import * as sharedV2 from '../../../src/shared/v2'

describe('v2 module roots', () => {
  it('exposes a loadable shared root', () => expect(sharedV2).toBeDefined())
})
