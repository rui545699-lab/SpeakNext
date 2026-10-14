Component({
  properties: {
    label: { type: String, value: '继续' },
    disabled: { type: Boolean, value: false }
  },
  methods: {
    handleTap() {
      if (!this.data.disabled) this.triggerEvent('tap');
    }
  }
});
