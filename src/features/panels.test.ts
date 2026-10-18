import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PairingPanel from './pairing/PairingPanel.vue'
import SitePanel from './site/SitePanel.vue'

const sendMessage = vi.fn(() => Promise.resolve({ ok: true, value: null }))

beforeEach(() => {
  sendMessage.mockClear()
  ;(globalThis as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage } }
})

describe('PairingPanel', () => {
  it('starts pairing with the chosen name', async () => {
    const w = mount(PairingPanel, {
      props: { pairing: { state: 'idle' }, defaultName: 'Firefox on Linux' },
    })
    expect(w.find('input').element.value).toBe('Firefox on Linux')
    await w.find('input').setValue('Work laptop')
    await w.find('button').trigger('click')
    expect(sendMessage).toHaveBeenCalledWith({ type: 'pair.start', name: 'Work laptop' })
  })

  it('shows the code while it waits', () => {
    const w = mount(PairingPanel, {
      props: {
        pairing: { state: 'waiting', code: 'K7P-2QX', expiresAt: Date.now() + 240_000, name: 'x' },
        defaultName: 'x',
      },
    })
    expect(w.get('[data-testid=pairing-code]').text()).toBe('K7P-2QX')
    expect(w.text()).toContain('valid for 4 minutes')
  })

  it('asks to compare the check number', async () => {
    const w = mount(PairingPanel, {
      props: {
        pairing: { state: 'check', check: '418 902', phoneName: 'Test iPhone', phoneId: 'p' },
        defaultName: 'x',
      },
    })
    expect(w.get('[data-testid=check-number]').text()).toBe('418 902')
    const [same, different] = w.findAll('button')
    await different?.trigger('click')
    expect(sendMessage).toHaveBeenLastCalledWith({ type: 'pair.reject' })
    await same?.trigger('click')
    expect(sendMessage).toHaveBeenLastCalledWith({ type: 'pair.confirm' })
  })
})

describe('SitePanel', () => {
  it('fills the login of the tab', async () => {
    const w = mount(SitePanel, {
      props: { site: 'vg.no', canFill: true, activity: null, tabId: 7 },
    })
    expect(w.get('[data-testid=site]').text()).toBe('vg.no')
    await w.get('[data-testid=fill-login]').trigger('click')
    expect(sendMessage).toHaveBeenCalledWith({ type: 'fill.login', tabId: 7 })
  })

  it('does not fill on an insecure page or while waiting', () => {
    const insecure = mount(SitePanel, {
      props: { site: 'vg.no', canFill: false, activity: null, tabId: 7 },
    })
    expect(insecure.get('[data-testid=fill-login]').attributes('disabled')).toBeDefined()
    expect(insecure.text()).toContain('does not use HTTPS')
    const waiting = mount(SitePanel, {
      props: {
        site: 'vg.no',
        canFill: true,
        tabId: 7,
        activity: {
          kind: 'login',
          state: 'waiting',
          site: 'vg.no',
          message: 'Approve on your iPhone',
          at: 0,
        },
      },
    })
    expect(waiting.get('[data-testid=fill-code]').attributes('disabled')).toBeDefined()
    expect(waiting.text()).toContain('Approve on your iPhone')
  })
})

describe('SitePanel notes', () => {
  it('shows the agent limit note under the result', () => {
    const w = mount(SitePanel, {
      props: {
        site: 'vg.no',
        canFill: true,
        tabId: 7,
        activity: {
          kind: 'login',
          state: 'approved',
          site: 'vg.no',
          message: 'Filled the login for vg.no.',
          note: 'This browser got 12 new logins and codes today.',
          at: 0,
        },
      },
    })
    expect(w.text()).toContain('This browser got 12 new logins and codes today.')
  })
})
