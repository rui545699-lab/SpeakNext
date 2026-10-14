Component({
  properties: {
    current: { type: String, value: 'home' }
  },
  methods: {
    goHome() {
      if (this.data.current !== 'home') wx.redirectTo({ url: '/pages/home/index' });
    },
    goProfile() {
      if (this.data.current !== 'profile') wx.redirectTo({ url: '/pages/profile/index' });
    }
  }
});
