import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AskBadgeView from '../results/AskBadgeView.vue'
import CheckIcon from '../results/icons/CheckIcon.vue'
import XIcon from '../results/icons/XIcon.vue'

describe('AskBadgeView', () => {
  describe('when result is true', () => {
    it('should render YES badge with success styling', () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: true,
          },
        },
      })

      const badge = wrapper.find('.ask-badge')
      expect(badge.exists()).toBe(true)
      expect(badge.classes()).toContain('success')
      expect(badge.text()).toContain('YES')
    })

    it('should render CheckIcon', () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: true,
          },
        },
      })

      const checkIcon = wrapper.findComponent(CheckIcon)
      expect(checkIcon.exists()).toBe(true)

      const xIcon = wrapper.findComponent(XIcon)
      expect(xIcon.exists()).toBe(false)
    })

    it('should have correct CSS classes', () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: true,
          },
        },
      })

      const badge = wrapper.find('.ask-badge')
      expect(badge.classes()).toEqual(['ask-badge', 'success'])
    })
  })

  describe('when result is false', () => {
    it('should render NO badge with error styling', () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: false,
          },
        },
      })

      const badge = wrapper.find('.ask-badge')
      expect(badge.exists()).toBe(true)
      expect(badge.classes()).toContain('error')
      expect(badge.text()).toContain('NO')
    })

    it('should render XIcon', () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: false,
          },
        },
      })

      const xIcon = wrapper.findComponent(XIcon)
      expect(xIcon.exists()).toBe(true)

      const checkIcon = wrapper.findComponent(CheckIcon)
      expect(checkIcon.exists()).toBe(false)
    })

    it('should have correct CSS classes', () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: false,
          },
        },
      })

      const badge = wrapper.find('.ask-badge')
      expect(badge.classes()).toEqual(['ask-badge', 'error'])
    })
  })

  describe('structure and layout', () => {
    it('should have container with ask-badge-view class', () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: true,
          },
        },
      })

      const container = wrapper.find('.ask-badge-view')
      expect(container.exists()).toBe(true)
    })

    it('should render badge text element', () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: true,
          },
        },
      })

      const badgeText = wrapper.find('.badge-text')
      expect(badgeText.exists()).toBe(true)
      expect(badgeText.text()).toBe('YES')
    })

    it('should render badge icon element', () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: true,
          },
        },
      })

      const badgeIcon = wrapper.find('.badge-icon')
      expect(badgeIcon.exists()).toBe(true)
    })
  })

  describe('reactivity', () => {
    it('should update when result prop changes from true to false', async () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: true,
          },
        },
      })

      // Initially should show YES
      expect(wrapper.text()).toContain('YES')
      expect(wrapper.find('.ask-badge').classes()).toContain('success')

      // Update prop
      await wrapper.setProps({
        result: {
          head: {},
          boolean: false,
        },
      })

      // Should now show NO
      expect(wrapper.text()).toContain('NO')
      expect(wrapper.find('.ask-badge').classes()).toContain('error')
    })

    it('should update icons when result changes', async () => {
      const wrapper = mount(AskBadgeView, {
        props: {
          result: {
            head: {},
            boolean: true,
          },
        },
      })

      // Initially should have CheckIcon
      expect(wrapper.findComponent(CheckIcon).exists()).toBe(true)
      expect(wrapper.findComponent(XIcon).exists()).toBe(false)

      // Update prop
      await wrapper.setProps({
        result: {
          head: {},
          boolean: false,
        },
      })

      // Should now have XIcon
      expect(wrapper.findComponent(CheckIcon).exists()).toBe(false)
      expect(wrapper.findComponent(XIcon).exists()).toBe(true)
    })
  })
})
