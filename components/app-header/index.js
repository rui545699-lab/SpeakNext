Component({
  properties: {
    title: { type: String, value: 'SpeakNext' },
    action: { type: String, value: 'none' }
  },
  data: {
    statusBarHeight: 24,
    navContentHeight: 44,
    rightSafeWidth: 96
  },
  lifetimes: {
    attached() {
      try {
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const capsule = wx.getMenuButtonBoundingClientRect();
        const statusBarHeight = windowInfo.statusBarHeight || 24;
        const navContentHeight = Math.max(44, (capsule.top - statusBarHeight) * 2 + capsule.height);
        const rightSafeWidth = windowInfo.windowWidth - capsule.left;
        this.setData({ statusBarHeight, navContentHeight, rightSafeWidth });
      } catch (error) {}
    }
  },
  methods: {
    handleAction() {
      this.triggerEvent(this.data.action);
    },
    handleTitleLongPress() {
      this.triggerEvent('titlelongpress');
    }
  }
});
